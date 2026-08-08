import { ethers } from 'ethers';
import fs from 'fs';

const keys = JSON.parse(fs.readFileSync('./recovery/test-private-keys.json', 'utf8'));
const buyerWallet = keys.wallets.find(w => w.role === 'BUYER');
const supplierWallet = keys.wallets.find(w => w.role === 'SUPPLIER');

console.log('============================================');
console.log('  PURCHASE ORDER FLOW - BUYER & SUPPLIER');
console.log('============================================\n');

const domain = {
  name: 'ClearFlow',
  version: '1',
  chainId: 84532,
  verifyingContract: '0x0000000000000000000000000000000000000000',
};

// Use _TypedDataEncoder to create properly formatted types
// Use checksummed addresses (ethers normalizes to checksum when signing)
const buyerAddress = ethers.getAddress(buyerWallet.address);
const supplierAddress = ethers.getAddress(supplierWallet.address);

const typedData = {
  domain,
  primaryType: 'PurchaseOrder',
  types: {
    PurchaseOrder: [
      { name: 'poReference', type: 'string' },
      { name: 'buyerAddress', type: 'address' },
      { name: 'supplierAddress', type: 'address' },
      { name: 'amount', type: 'string' },
      { name: 'currency', type: 'string' },
      { name: 'quantity', type: 'uint256' },
      { name: 'deliveryDate', type: 'string' },
      { name: 'chainId', type: 'uint256' },
    ],
  },
  message: {
    poReference: `PO-${Date.now()}`,
    buyerAddress,
    supplierAddress,
    amount: '250000.00',
    currency: 'USD',
    quantity: 10000,
    deliveryDate: '2026-12-31',
    chainId: 84532,
  },
};

console.log('📋 PO DETAILS:');
console.log('   Reference: ' + typedData.message.poReference);
console.log('   Buyer: ' + typedData.message.buyerAddress);
console.log('   Supplier: ' + typedData.message.supplierAddress);
console.log('   Amount: $' + typedData.message.amount + ' ' + typedData.message.currency);
console.log('   Quantity: ' + typedData.message.quantity + ' units');
console.log('   Delivery: ' + typedData.message.deliveryDate);
console.log('');

const buyer = new ethers.Wallet(buyerWallet.privateKey);
const signature = await buyer.signTypedData(typedData.domain, typedData.types, typedData.message);

console.log('✅ STEP 1: BUYER SIGNS EIP-712');
console.log('   Signer: ' + buyer.address);
console.log('   Signature: ' + signature.substring(0, 50) + '...');
console.log('');

const request = {
  poReference: typedData.message.poReference,
  buyerAddress: typedData.message.buyerAddress.toLowerCase(),  // Server expects lowercase
  supplierAddress: typedData.message.supplierAddress.toLowerCase(),  // Server expects lowercase
  amount: typedData.message.amount,
  currency: typedData.message.currency,
  quantity: typedData.message.quantity,
  deliveryDate: typedData.message.deliveryDate,
  chainId: 84532,
  poSignature: signature,
};

console.log('📤 Creating Purchase Order via API...');
console.log('   POST /api/v1/purchase-orders');
console.log('');

const res = await fetch('http://localhost:3000/api/v1/purchase-orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(request)
});

const result = await res.json();
console.log('📥 API Response:');
console.log(JSON.stringify(result, null, 2));

if (result.success) {
  console.log('\n✅ PO CREATED SUCCESSFULLY!');
  console.log('   PO ID: ' + result.data.poId);
  console.log('   Status: ' + result.data.status);
  console.log('   PO Hash: ' + result.data.poHash);
  
  // Save PO ID for supplier signing
  const poId = result.data.poId;
  const poHash = result.data.poHash;
  
  console.log('\n' + '='.repeat(50));
  console.log('  STEP 2: SUPPLIER SIGNS PO');
  console.log('='.repeat(50) + '\n');
  
  // Supplier signs auth message to prove wallet ownership
  const supplier = new ethers.Wallet(supplierWallet.privateKey);
  const authMessage = `Sign this message to authenticate with ClearFlow.\n\nTimestamp: ${Date.now()}`;
  const authSignature = await supplier.signMessage(authMessage);
  
  console.log('📝 Supplier authenticates:');
  console.log('   Address: ' + supplier.address);
  console.log('   Signature: ' + authSignature.substring(0, 50) + '...');
  console.log('');
  
  // Supplier signs the same PO data (EIP-712)
  const supplierSignature = await supplier.signTypedData(typedData.domain, typedData.types, typedData.message);
  
  console.log('📝 Supplier signs PO (EIP-712):');
  console.log('   Signature: ' + supplierSignature.substring(0, 50) + '...');
  console.log('');
  
  // Call the sign endpoint
  const signRequest = {
    poId: poId,
    poHash: poHash,
    chainId: 84532,
    poSignature: supplierSignature,
    authSignature: authSignature,
    authMessage: authMessage,
  };
  
  console.log('📤 Calling supplier sign API...');
  console.log('   POST /api/v1/purchase-orders/' + poId + '/sign');
  console.log('');
  
  const signRes = await fetch('http://localhost:3000/api/v1/purchase-orders/' + poId + '/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signRequest)
  });
  
  const signResult = await signRes.json();
  console.log('📥 API Response:');
  console.log(JSON.stringify(signResult, null, 2));
  
  if (signResult.success) {
    console.log('\n🎉 PO FULLY SIGNED!');
    console.log('   Status: ' + signResult.data.status);
    console.log('   Both buyer and supplier have signed.');
    
    console.log('\n' + '='.repeat(50));
    console.log('  STEP 3: CREATE DEAL & LAUNCH A-TOKEN');
    console.log('='.repeat(50) + '\n');
    
    // Buyer creates a deal from the signed PO
    const dealMessage = `Create deal for PO ${poId}\nTimestamp: ${Date.now()}`;
    const dealSignature = await buyer.signMessage(dealMessage);
    
    const dealRequest = {
      signature: dealSignature,
      message: dealMessage,
      purchaseOrderId: poId,
      targetAmount: '150000.00',  // Advance amount to raise (60% of PO)
      yieldPercent: 8.5,  // 8.5% yield for investors
      fundingDeadline: '2026-09-30T23:59:59Z',
      minInvestorTier: 1,
      eligibleCountries: ['US', 'CN', 'SG'],
      chainId: 84532,
    };
    
    console.log('📋 DEAL DETAILS:');
    console.log('   Target Amount: $' + dealRequest.targetAmount + ' USDC');
    console.log('   Yield: ' + dealRequest.yieldPercent + '%');
    console.log('   Funding Deadline: ' + dealRequest.fundingDeadline);
    console.log('   Eligible Countries: ' + dealRequest.eligibleCountries.join(', '));
    console.log('');
    
    console.log('📤 Creating Deal via API...');
    console.log('   POST /api/v1/deals');
    console.log('');
    
    const dealRes = await fetch('http://localhost:3000/api/v1/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dealRequest)
    });
    
    const dealResult = await dealRes.json();
    console.log('📥 API Response:');
    console.log(JSON.stringify(dealResult, null, 2));
    
    if (dealResult.success) {
      const dealId = dealResult.data.dealId;
      const atokenSymbol = dealResult.data.atokenSymbol;
      
      console.log('\n🎉 DEAL CREATED & A-TOKEN LAUNCHED!');
      console.log('   Deal ID: ' + dealId);
      console.log('   A-Token Symbol: ' + atokenSymbol);
      console.log('   Status: ' + dealResult.data.status);
      
      console.log('\n' + '='.repeat(50));
      console.log('  STEP 4: INVESTOR CONTRIBUTION');
      console.log('='.repeat(50) + '\n');
      
      // Investor 1 contributes to the deal
      const investor1Wallet = keys.wallets.find(w => w.role === 'INVESTOR_1');
      const investor1 = new ethers.Wallet(investor1Wallet.privateKey);
      
      // Admin wallet signs the contribution approval
      const adminWallet = keys.wallets.find(w => w.role === 'ADMIN');
      const admin = new ethers.Wallet(adminWallet.privateKey);
      
      // Investor signs the contribution intent
      const investorMessage = `Contribute to deal ${dealId}\nAmount: 50000 USDC\nTimestamp: ${Date.now()}`;
      const investorSignature = await investor1.signMessage(investorMessage);
      
      // Admin signs the contribution approval
      const adminMessage = `Approve contribution to deal ${dealId}\nInvestor: ${investor1.address}\nAmount: 50000 USDC\nTimestamp: ${Date.now()}`;
      const adminSignature = await admin.signMessage(adminMessage);
      
      const contributeRequest = {
        investorSignature: investorSignature,
        investorMessage: investorMessage,
        adminSignature: adminSignature,
        adminMessage: adminMessage,
        dealId: dealId,
        amount: '50000.00',
        chainId: 84532,
      };
      
      console.log('📋 CONTRIBUTION DETAILS:');
      console.log('   Investor: ' + investor1.address);
      console.log('   Admin: ' + admin.address);
      console.log('   Deal ID: ' + dealId);
      console.log('   Amount: $' + contributeRequest.amount + ' USDC');
      console.log('   Ramp: Fiat onramp to deal wallet');
      console.log('');
      
      console.log('📤 Submitting contribution via API...');
      console.log('   POST /api/v1/deals/' + dealId + '/contribute');
      console.log('');
      
      const contributeRes = await fetch('http://localhost:3000/api/v1/deals/' + dealId + '/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contributeRequest)
      });
      
      const contributeResult = await contributeRes.json();
      console.log('📥 API Response:');
      console.log(JSON.stringify(contributeResult, null, 2));
      
      if (contributeResult.success) {
        console.log('\n🎉 CONTRIBUTION SUCCESSFUL!');
        console.log('   Contribution ID: ' + contributeResult.data.contributionId);
        console.log('   Token Amount: ' + contributeResult.data.tokenAmount + ' ' + atokenSymbol);
        console.log('   Ramp Receipt ID: ' + contributeResult.data.rampReceiptId);
        console.log('   Ramp Tx Hash: ' + (contributeResult.data.rampTxHash || 'N/A'));
        console.log('   Status: ' + contributeResult.data.status);
        console.log('');
        console.log('📋 FULL FLOW COMPLETE:');
        console.log('   ✅ 1. Buyer created PO with EIP-712 signature');
        console.log('   ✅ 2. Supplier signed PO with EIP-712 signature');
        console.log('   ✅ 3. Buyer created Deal & A-Token launched');
        console.log('   ✅ 4. Investor + Admin signed, Fiat onramp completed');
        console.log('   ⏭️  5. Next: Supplier payout when funded');
      } else {
        console.log('\n⚠️  Contribution failed: ' + contributeResult.error.message);
      }
    }
  }
}
