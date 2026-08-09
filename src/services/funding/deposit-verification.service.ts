import { ethers } from 'ethers';
import { prisma } from '../../config/database';
import { config, logger } from '../../config';
import { getCircleWalletService } from '../circle';
import { getAuditService, getRampService } from '../cleanverse';
import { ContributionStatus } from '@prisma/client';

/**
 * DepositVerificationService
 *
 * The single source of truth for "did money actually arrive in the deal wallet?".
 *
 * Two contribution paths feed into one verification pipeline:
 *
 *   Path A — CRYPTO (investor sends USDC on-chain to the deal wallet)
 *     Verified by inspecting inbound transfers recorded by Circle for the deal
 *     wallet (listTransactions, custodyType=DEVELOPER, operation=TRANSFER,
 *     destinationAddress = wallet address, state = CONFIRMED/COMPLETE), then
 *     matching by sourceAddress + amount. As a belt-and-braces fallback the
 *     USDC contract balanceOf is read directly via the chain RPC.
 *
 *   Path B — FIAT (investor pays fiat via the Cleanverse ramp widget)
 *     Verified by polling query_ramp_order until the order reaches COMPLETED,
 *     then confirming the resulting USDC transfer landed in the deal wallet
 *     via the same Circle listTransactions check used by Path A.
 *
 * Token minting must NEVER happen until a contribution's status is CONFIRMED,
 * which only this service sets.
 */
export class DepositVerificationService {
  private circleWalletService = getCircleWalletService();
  private auditService = getAuditService();
  private rampService = getRampService();

  /**
   * Verify a CRYPTO contribution: look for an inbound USDC transfer into the
   * deal wallet matching the contribution amount and (when known) the
   * investor's source address. On a confirmed match, marks the Contribution
   * CONFIRMED and returns the on-chain txHash.
   */
  async verifyCryptoDeposit(contributionId: string): Promise<{
    verified: boolean;
    txHash?: string;
    sourceAddress?: string;
    error?: string;
  }> {
    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      include: { deal: true },
    });
    if (!contribution) {
      return { verified: false, error: 'Contribution not found' };
    }
    const deal = contribution.deal;
    if (!deal.circleWalletId || !deal.circleWalletAddress) {
      return { verified: false, error: 'Deal has no Circle wallet' };
    }

    const expectedAmount = parseFloat(contribution.amount);

    // 1. Ask Circle for inbound settled transfers on the deal wallet.
    const inboundRes = await this.circleWalletService.listInboundTransactions(deal.circleWalletId);
    if (!inboundRes.success || !inboundRes.transactions) {
      return { verified: false, error: inboundRes.error || 'Failed to list inbound transactions' };
    }

    const match = this.findMatchingTransfer(inboundRes.transactions, {
      expectedAmount,
      expectedSource: contribution.fromAddress || undefined,
    });

    if (match) {
      await this.markConfirmed(contribution.id, {
        txHash: match.txHash,
        sourceAddress: match.sourceAddress,
        toAddress: deal.circleWalletAddress,
      });
      logger.info(
        { contributionId, txHash: match.txHash, amount: expectedAmount },
        'Crypto deposit verified via Circle'
      );
      return { verified: true, txHash: match.txHash, sourceAddress: match.sourceAddress };
    }

    // 2. Fallback: read USDC balanceOf on-chain to at least confirm funds are present.
    // (We cannot attribute a specific txHash this way, but it proves the wallet
    // received the expected total. Useful when Circle's indexer lags.)
    const balanceOk = await this.checkOnChainUsdcBalance(
      deal.circleWalletAddress,
      expectedAmount
    ).catch(() => false);
    if (!balanceOk) {
      return { verified: false, error: 'No matching inbound transfer and on-chain balance insufficient' };
    }

    // Balance confirms funds but we have no txHash; record what we can and
    // leave status PENDING so a later Circle index update can attach the hash.
    logger.warn(
      { contributionId, dealWalletAddress: deal.circleWalletAddress, amount: expectedAmount },
      'On-chain balance sufficient but no matching Circle transfer yet — leaving PENDING'
    );
    return { verified: false, error: 'Funds present on-chain but not yet indexed by Circle' };
  }

  /**
   * Verify a FIAT contribution: poll the Cleanverse ramp order to COMPLETED,
   * then confirm the USDC landed in the deal wallet via Circle listTransactions.
   */
  async verifyFiatDeposit(contributionId: string): Promise<{
    verified: boolean;
    rampOrderId?: string;
    rampTxHash?: string;
    txHash?: string;
    error?: string;
  }> {
    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      include: { deal: true },
    });
    if (!contribution) {
      return { verified: false, error: 'Contribution not found' };
    }
    if (!contribution.rampOrderId && !contribution.rampQuoteToken) {
      return { verified: false, error: 'Contribution has no ramp order/quote to verify' };
    }
    const deal = contribution.deal;
    if (!deal.circleWalletId || !deal.circleWalletAddress) {
      return { verified: false, error: 'Deal has no Circle wallet' };
    }

    // 1. Poll the ramp order once (caller drives the polling loop, or the Bull
    //    job does). We do a single status check here.
    const orderRes = await this.rampService.queryOrder({
      orderId: contribution.rampOrderId || undefined,
      quoteToken: contribution.rampQuoteToken || undefined,
    });
    if (!this.rampService['client'].isSuccess(orderRes) || !orderRes.data) {
      return { verified: false, error: 'Failed to query ramp order' };
    }
    const order = orderRes.data;
    const status = (order as any).status?.toUpperCase();

    if (status === 'FAILED' || status === 'REFUNDED' || status === 'CANCELLED') {
      await this.markFailed(contribution.id, `Ramp order ${status}`);
      return { verified: false, error: `Ramp order ${status}` };
    }
    if (status !== 'COMPLETED' && status !== 'COMPLETE' && status !== 'SETTLED') {
      return { verified: false, error: `Ramp order status: ${status}` };
    }

    // 2. Ramp says COMPLETED — now verify USDC actually landed in the deal wallet.
    const rampTxHash = (order as any).txHash || (order as any).tx_hash;
    const expectedAmount = parseFloat(contribution.amount);
    const inboundRes = await this.circleWalletService.listInboundTransactions(deal.circleWalletId);
    if (!inboundRes.success || !inboundRes.transactions) {
      return { verified: false, error: inboundRes.error || 'Failed to list inbound transactions' };
    }

    const match = this.findMatchingTransfer(inboundRes.transactions, {
      expectedAmount,
      expectedTxHash: rampTxHash || undefined,
    });

    if (!match) {
      logger.warn(
        { contributionId, rampOrderId: contribution.rampOrderId, amount: expectedAmount },
        'Ramp completed but USDC not yet visible in deal wallet'
      );
      return { verified: false, error: 'Ramp completed but USDC not yet indexed in deal wallet' };
    }

    await this.markConfirmed(contribution.id, {
      txHash: match.txHash,
      sourceAddress: match.sourceAddress,
      toAddress: deal.circleWalletAddress,
      rampOrderId: (order as any).orderId || contribution.rampOrderId,
      rampTxHash: rampTxHash,
    });
    logger.info(
      { contributionId, rampOrderId: contribution.rampOrderId, txHash: match.txHash },
      'Fiat deposit verified via ramp + Circle'
    );
    return {
      verified: true,
      rampOrderId: (order as any).orderId || contribution.rampOrderId,
      rampTxHash: rampTxHash,
      txHash: match.txHash,
    };
  }

  /**
   * Poll a contribution's deposit until verified or the attempt budget runs out.
   * Used by the Bull job for async verification of pending contributions.
   */
  async pollUntilVerified(
    contributionId: string,
    opts: { maxAttempts?: number; intervalMs?: number } = {}
  ): Promise<{ verified: boolean; error?: string }> {
    const maxAttempts = opts.maxAttempts ?? 60;
    const intervalMs = opts.intervalMs ?? 10000;

    for (let i = 0; i < maxAttempts; i++) {
      const contribution = await prisma.contribution.findUnique({
        where: { id: contributionId },
        select: { type: true, status: true },
      });
      if (!contribution) return { verified: false, error: 'Contribution not found' };
      if (contribution.status === ContributionStatus.CONFIRMED) return { verified: true };
      if (contribution.status === ContributionStatus.FAILED) {
        return { verified: false, error: 'Contribution already FAILED' };
      }

      const result = contribution.type === 'FIAT'
        ? await this.verifyFiatDeposit(contributionId)
        : await this.verifyCryptoDeposit(contributionId);

      if (result.verified) return { verified: true };
      if (i < maxAttempts - 1) await sleep(intervalMs);
    }
    return { verified: false, error: `Timed out after ${maxAttempts} attempts` };
  }

  // ---- internal helpers --------------------------------------------------

  private findMatchingTransfer(
    txns: Array<{
      txHash?: string;
      sourceAddress?: string;
      destinationAddress?: string;
      amounts?: string[];
      state: string;
    }>,
    criteria: { expectedAmount: number; expectedSource?: string; expectedTxHash?: string }
  ) {
    return txns.find((t) => {
      // txHash match is the strongest signal (fiat path).
      if (criteria.expectedTxHash && t.txHash) {
        return t.txHash.toLowerCase() === criteria.expectedTxHash.toLowerCase();
      }
      // Amount + source match (crypto path).
      const amt = t.amounts?.[0] ? parseFloat(t.amounts[0]) : NaN;
      if (Math.abs(amt - criteria.expectedAmount) > 1e-6) return false;
      if (criteria.expectedSource && t.sourceAddress) {
        if (t.sourceAddress.toLowerCase() !== criteria.expectedSource.toLowerCase()) return false;
      }
      return true;
    });
  }

  private async checkOnChainUsdcBalance(dealWalletAddress: string, expectedAmount: number): Promise<boolean> {
    const provider = new ethers.JsonRpcProvider(config.MONAD_RPC_URL);
    const usdc = new ethers.Contract(
      config.MONAD_USDC_ADDRESS,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );
    const bal = await usdc.balanceOf(dealWalletAddress);
    const balHuman = parseFloat(ethers.formatUnits(bal, 6));
    return balHuman >= expectedAmount - 1e-6;
  }

  private async markConfirmed(
    contributionId: string,
    data: {
      txHash?: string;
      sourceAddress?: string;
      toAddress?: string;
      rampOrderId?: string;
      rampTxHash?: string;
    }
  ) {
    await prisma.contribution.update({
      where: { id: contributionId },
      data: {
        status: ContributionStatus.CONFIRMED,
        confirmedAt: new Date(),
        txHash: data.txHash,
        fromAddress: data.sourceAddress,
        toAddress: data.toAddress,
        rampOrderId: data.rampOrderId,
        rampTxHash: data.rampTxHash,
      },
    });
  }

  private async markFailed(contributionId: string, reason: string) {
    await prisma.contribution.update({
      where: { id: contributionId },
      data: { status: ContributionStatus.FAILED },
    });
    logger.warn({ contributionId, reason }, 'Contribution marked FAILED');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let depositVerificationServiceInstance: DepositVerificationService | null = null;

export function getDepositVerificationService(): DepositVerificationService {
  if (!depositVerificationServiceInstance) {
    depositVerificationServiceInstance = new DepositVerificationService();
  }
  return depositVerificationServiceInstance;
}

export default getDepositVerificationService;
