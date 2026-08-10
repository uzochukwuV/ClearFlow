import { prisma } from '../../config/database';
import { getIdentityService } from '../identity';
import { logger } from '../../config';
import { 
  CanonicalPO, 
  createPOSigningData, 
  recoverPOSigner,
  generatePOHash,
  verifyIntentSignature
} from '../../utils/eip712';
import { UserType } from '@prisma/client';
import { getAddress } from 'ethers';

export interface CreatePOResult {
  success: boolean;
  poId?: string;
  poHash?: string;
  error?: string;
}

export interface SignPOResult {
  success: boolean;
  poId?: string;
  status?: string;
  error?: string;
}

export interface POWithSignatures {
  id: string;
  poReference: string;
  buyerId: string;
  supplierId: string;
  buyerAddress?: string;
  supplierAddress?: string;
  amount: string;
  currency: string;
  quantity: number;
  deliveryDate: Date;
  status: string;
  poHash?: string;
  buyerSignature?: {
    signature: string;
    signedAt: Date;
  };
  supplierSignature?: {
    signature: string;
    signedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export class PurchaseOrderService {
  private identityService = getIdentityService();

  /**
   * Create a new Purchase Order
   * 
   * Flow:
   * 1. Verify EIP-712 signature ? recover buyer address
   * 2. Verify signature matches the canonical PO terms
   * 3. Verify buyer A-Pass
   * 4. Create PO in PENDING_SUPPLIER_SIGNATURE state
   * 5. Record buyer's signature
   * 
   * One signature per party - buyer signs once when creating.
   */
  async createPO(params: {
    buyerAddress: string;
    supplierAddress: string;
    poReference: string;
    amount: string;
    currency: string;
    quantity: number;
    deliveryDate: Date;
    buyerSignature: string;
    chainId: number;
  }): Promise<CreatePOResult> {
    const { buyerAddress, supplierAddress, poReference, amount, currency, quantity, deliveryDate, buyerSignature, chainId } = params;

    logger.info({ 
      buyerAddress, 
      supplierAddress, 
      poReference 
    }, 'Creating Purchase Order');
    logger.debug({
      buyerAddress,
      supplierAddress,
      poReference,
      chainId,
      amount,
      currency,
      quantity,
      deliveryDate: deliveryDate.toISOString(),
    }, 'PO create verification input');

    try {
      // Build canonical PO - use checksummed addresses for signature verification
      const canonicalPO: CanonicalPO = {
        poReference,
        buyerAddress: getAddress(buyerAddress),
        supplierAddress: getAddress(supplierAddress),
        amount,
        currency,
        quantity,
        deliveryDate: deliveryDate.toISOString().split('T')[0],
      };
      logger.debug({ canonicalPO }, 'PO create canonical payload');

      // 1. Verify EIP-712 signature
      const recoveredBuyer = recoverPOSigner(canonicalPO, buyerSignature, chainId);
      if (!recoveredBuyer) {
        return {
          success: false,
          error: 'Invalid EIP-712 signature - could not recover buyer',
        };
      }

      const recoveredBuyerChecksum = getAddress(recoveredBuyer);
      const buyerAddressChecksum = getAddress(buyerAddress);
      const buyerMismatch = recoveredBuyerChecksum !== buyerAddressChecksum;
      logger.debug({
        recoveredBuyer,
        buyerAddress,
        recoveredBuyerChecksum,
        buyerAddressChecksum,
        recoveredMatchesBuyer: !buyerMismatch,
        chainId,
      }, 'PO create recovered signer');

      if (buyerMismatch) {
        logger.warn({
          expectedBuyerAddress: buyerAddressChecksum,
          recoveredBuyerAddress: recoveredBuyerChecksum,
          chainId,
          poReference,
        }, 'Buyer signature recovered from a different wallet than the requested buyer address');
        return {
          success: false,
          error: `Buyer signature does not match the requested buyer address. Expected ${buyerAddressChecksum}, got ${recoveredBuyerChecksum}.`,
        };
      }
      // 2. Verify buyer A-Pass (skip in demo mode)
      const skipAPassVerification = process.env.SKIP_APASS_VERIFICATION === 'true';
      if (!skipAPassVerification) {
        const buyerAPass = await this.identityService.verifyAPass(buyerAddressChecksum);
        if (!buyerAPass.valid) {
          return {
            success: false,
            error: `Buyer A-Pass verification failed: ${buyerAPass.reason}`,
          };
        }
      } else {
        logger.info({ buyerAddress: buyerAddressChecksum }, 'Skipping A-Pass verification (demo mode)');
      }

      // 3. Generate PO hash
      const poHash = generatePOHash(canonicalPO);

      // 4. Find or create buyer user
      let buyer = await prisma.user.findUnique({
        where: { walletAddress: buyerAddress.toLowerCase() },
      });

      if (!buyer) {
        buyer = await prisma.user.create({
          data: {
            walletAddress: buyerAddressChecksum.toLowerCase(),
            userType: UserType.BUYER,
          },
        });
      }

      // 5. Find or create supplier user
      let supplier = await prisma.user.findUnique({
        where: { walletAddress: supplierAddress.toLowerCase() },
      });

      if (!supplier) {
        supplier = await prisma.user.create({
          data: {
            walletAddress: supplierAddress.toLowerCase(),
            userType: UserType.SUPPLIER,
          },
        });
      }

      // 6. Create PO in PENDING_SUPPLIER_SIGNATURE state
      const po = await prisma.purchaseOrder.create({
        data: {
          poReference,
          buyerId: buyer.id,
          supplierId: supplier.id,
          amount: amount,  // Store as string to preserve exact format
          currency,
          quantity,
          deliveryDate,
          advanceAmount: '0',  // Store as string
          advancePercent: 0,
          status: "PENDING_SUPPLIER_SIGNATURE",
        },
      });

      // 7. Record buyer's EIP-712 signature
      await prisma.pOSignature.create({
        data: {
          purchaseOrderId: po.id,
          signer: UserType.BUYER,
          signerId: buyer.id,
          hash: poHash,
          signature: buyerSignature,
        },
      });

      logger.info({ 
        poId: po.id, 
        poHash,
        status: "PENDING_SUPPLIER_SIGNATURE" 
      }, 'Purchase Order created - awaiting supplier signature');

      return {
        success: true,
        poId: po.id,
        poHash,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to create Purchase Order');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create PO',
      };
    }
  }

  /**
   * Sign a Purchase Order (Supplier only)
   * 
   * Flow:
   * 1. Verify auth signature ? recover signer address
   * 2. Verify signer is the supplier
   * 3. Verify EIP-712 signature over canonical PO terms
   * 4. Verify PO hash matches stored hash
   * 5. Verify signer A-Pass
   * 6. Record signature
   * 7. Update status to SIGNED
   */
  async signPO(params: {
    poId: string;
    signerAddress: string;
    poSignature: string;
    poHash: string;
    chainId: number;
  }): Promise<SignPOResult> {
    const { poId, signerAddress, poSignature, poHash, chainId } = params;

    logger.info({ poId, signerAddress }, 'Supplier signing Purchase Order');

    try {
      // 1. Find PO
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        include: {
          buyer: true,
          supplier: true,
          signatures: true,
        },
      });

      if (!po) {
        return { success: false, error: 'Purchase Order not found' };
      }

      // 2. Verify status allows signing
      if (po.status !== "PENDING_SUPPLIER_SIGNATURE") {
        return { 
          success: false, 
          error: `Cannot sign PO in ${po.status} status` 
        };
      }

      // 3. Verify signer is the supplier
      if (po.supplier.walletAddress.toLowerCase() !== signerAddress.toLowerCase()) {
        return { success: false, error: 'Only the supplier can sign' };
      }

      // 4. Verify EIP-712 signature over canonical PO
      // Use checksummed addresses to match how ethers.js signs them
      const canonicalPO: CanonicalPO = {
        poReference: po.poReference,
        buyerAddress: getAddress(po.buyer.walletAddress),
        supplierAddress: getAddress(po.supplier.walletAddress),
        amount: po.amount,
        currency: po.currency,
        quantity: po.quantity,
        deliveryDate: po.deliveryDate.toISOString().split('T')[0],
      };

      const recoveredSigner = recoverPOSigner(canonicalPO, poSignature, chainId);
      if (!recoveredSigner) {
        return { success: false, error: 'Invalid EIP-712 signature' };
      }

      if (getAddress(recoveredSigner) !== getAddress(signerAddress)) {
        return { success: false, error: 'Signature does not match supplier address' };
      }

      // 5. Verify PO hash matches
      const expectedPOHash = generatePOHash(canonicalPO);
      if (poHash !== expectedPOHash) {
        return { 
          success: false, 
          error: 'PO hash mismatch - PO terms may have changed after signature' 
        };
      }

      // 6. Verify supplier A-Pass (skip in demo mode)
      const skipAPassVerification = process.env.SKIP_APASS_VERIFICATION === 'true';
      if (!skipAPassVerification) {
        const aPassVerification = await this.identityService.verifyAPass(signerAddress);
        if (!aPassVerification.valid) {
          return {
            success: false,
            error: `Supplier A-Pass verification failed: ${aPassVerification.reason}`,
          };
        }
      } else {
        logger.info({ signerAddress }, 'Skipping supplier A-Pass verification (demo mode)');
      }

      // 7. Record signature
      await prisma.pOSignature.create({
        data: {
          purchaseOrderId: po.id,
          signer: UserType.SUPPLIER,
          signerId: po.supplier.id,
          hash: poHash,
          signature: poSignature,
        },
      });

      // 8. Update status to SIGNED
      const updatedPO = await prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { status: "SIGNED" },
      });

      logger.info({ 
        poId, 
        status: "SIGNED" 
      }, 'Purchase Order fully signed');

      return {
        success: true,
        poId: po.id,
        status: "SIGNED",
      };
    } catch (error) {
      logger.error({ error, poId }, 'Failed to sign Purchase Order');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sign PO',
      };
    }
  }

  async getPO(poId: string): Promise<POWithSignatures | null> {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        buyer: true,
        supplier: true,
        signatures: {
          orderBy: { signedAt: 'asc' },
        },
      },
    });

    if (!po) return null;

    const buyerSig = po.signatures.find(s => s.signer === 'BUYER');
    const supplierSig = po.signatures.find(s => s.signer === 'SUPPLIER');

    return {
      id: po.id,
      poReference: po.poReference,
      buyerId: po.buyer.id,
      supplierId: po.supplier.id,
      buyerAddress: po.buyer.walletAddress,
      supplierAddress: po.supplier.walletAddress,
      amount: po.amount,
      currency: po.currency,
      quantity: po.quantity,
      deliveryDate: po.deliveryDate,
      status: po.status,
      poHash: buyerSig?.hash,
      buyerSignature: buyerSig ? {
        signature: buyerSig.signature,
        signedAt: buyerSig.signedAt,
      } : undefined,
      supplierSignature: supplierSig ? {
        signature: supplierSig.signature,
        signedAt: supplierSig.signedAt,
      } : undefined,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
    };
  }

  async listPOs(params: {
    walletAddress: string;
    status?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: POWithSignatures[]; total: number; page: number; pageSize: number }> {
    const { walletAddress, status, page, pageSize } = params;

    const user = await prisma.user.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() },
    });

    if (!user) {
      return { items: [], total: 0, page, pageSize };
    }

    const where: any = {
      OR: [
        { buyerId: user.id },
        { supplierId: user.id },
      ],
    };

    if (status) {
      where.status = status;
    }

    const [pos, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          buyer: true,
          supplier: true,
          signatures: {
            orderBy: { signedAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    const items = pos.map(po => {
      const buyerSig = po.signatures.find(s => s.signer === 'BUYER');
      const supplierSig = po.signatures.find(s => s.signer === 'SUPPLIER');

      return {
        id: po.id,
        poReference: po.poReference,
        buyerId: po.buyer.id,
        supplierId: po.supplier.id,
        buyerAddress: po.buyer.walletAddress,
        supplierAddress: po.supplier.walletAddress,
        amount: po.amount,
        currency: po.currency,
        quantity: po.quantity,
        deliveryDate: po.deliveryDate,
        status: po.status,
        poHash: buyerSig?.hash,
        buyerSignature: buyerSig ? {
          signature: buyerSig.signature,
          signedAt: buyerSig.signedAt,
        } : undefined,
        supplierSignature: supplierSig ? {
          signature: supplierSig.signature,
          signedAt: supplierSig.signedAt,
        } : undefined,
        createdAt: po.createdAt,
        updatedAt: po.updatedAt,
      };
    });

    return { items, total, page, pageSize };
  }
}

let poServiceInstance: PurchaseOrderService | null = null;

export function getPurchaseOrderService(): PurchaseOrderService {
  if (!poServiceInstance) {
    poServiceInstance = new PurchaseOrderService();
  }
  return poServiceInstance;
}

export default getPurchaseOrderService;

