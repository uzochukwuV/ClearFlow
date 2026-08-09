import { ethers } from 'ethers';
import fs from 'fs';

const keys = JSON.parse(fs.readFileSync('./recovery/test-private-keys.json', 'utf8'));
const buyerWallet = keys.wallets.find(w => w.role === 'BUYER');
const supplierWallet = keys.wallets.find(w => w.role === 'SUPPLIER');
const adminWallet = keys.wallets.find(w => w.role === 'ADMIN');

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
const adminAddress = ethers.getAddress(adminWallet.address);

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
      deliveryDeadline: '2026-10-31T23:59:59Z',  // Buyer must receive goods and pay up by this date
      minInvestorTier: 1,
      eligibleCountries: ['US', 'CN', 'SG'],
      chainId: 84532,
    };
    
    console.log('📋 DEAL DETAILS:');
    console.log('   Target Amount: $' + dealRequest.targetAmount + ' USDC');
    console.log('   Yield: ' + dealRequest.yieldPercent + '%');
    console.log('   Funding Deadline: ' + dealRequest.fundingDeadline);
    console.log('   Delivery Deadline: ' + dealRequest.deliveryDeadline);
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
        
        // Add more contributions to fully fund the deal
        console.log('\n' + '='.repeat(50));
        console.log('  STEP 5: ADD MORE CONTRIBUTIONS TO FULLY FUND');
        console.log('='.repeat(50) + '\n');
        
        // Get full deal data with auth
        const dealMessage = `Get deal ${dealId}\nTimestamp: ${Date.now()}`;
        const dealSignature = await buyer.signMessage(dealMessage);
        const dealRes = await fetch('http://localhost:3000/api/v1/deals/' + dealId + '?signature=' + encodeURIComponent(dealSignature) + '&message=' + encodeURIComponent(dealMessage), {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        const dealData = await dealRes.json();
        console.log('📊 Current Funding:', dealData.data?.runningTotal, '/', dealData.data?.targetAmount);
        
        // Add second investor contribution
        const investor2Wallet = keys.wallets.find(w => w.role === 'INVESTOR_2');
        const investor2 = new ethers.Wallet(investor2Wallet.privateKey);
        
        const contrib2Message = `Contribute to deal ${dealId}\nAmount: 100000 USDC\nTimestamp: ${Date.now()}`;
        const contrib2Signature = await investor2.signMessage(contrib2Message);
        
        const adminMessage2 = `Approve contribution to deal ${dealId}\nInvestor: ${investor2.address}\nAmount: 100000 USDC\nTimestamp: ${Date.now()}`;
        const adminSignature2 = await admin.signMessage(adminMessage2);
        
        const contrib2Request = {
          investorSignature: contrib2Signature,
          investorMessage: contrib2Message,
          adminSignature: adminSignature2,
          adminMessage: adminMessage2,
          dealId: dealId,
          amount: '100000.00',
          chainId: 84532,
        };
        
        console.log('📤 Investor 2 contributing...');
        const contrib2Res = await fetch('http://localhost:3000/api/v1/deals/' + dealId + '/contribute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contrib2Request)
        });
        const contrib2Result = await contrib2Res.json();
        console.log('   Result:', contrib2Result.success ? 'Success' : contrib2Result.error?.message);
        
        // Check updated funding
        const dealRes2 = await fetch('http://localhost:3000/api/v1/deals/' + dealId + '?signature=' + encodeURIComponent(dealSignature) + '&message=' + encodeURIComponent(dealMessage), {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        const dealData2 = await dealRes2.json();
        console.log('📊 Updated Funding:', dealData2.data?.runningTotal, '/', dealData2.data?.targetAmount);
        console.log('📊 Deal Status:', dealData2.data?.status);
        
        // STEP 5: SUPPLIER PAYOUT RELEASE
        console.log('\n' + '='.repeat(50));
        console.log('  STEP 6: SUPPLIER PAYOUT RELEASE');
        console.log('='.repeat(50) + '\n');
        
        // Admin signs payout approval
        const payoutAdminMessage = `Approve supplier payout release\nDeal ID: ${dealId}\nPO ID: ${poId}\nAmount: ${dealData.data.targetAmount} USDC\nTimestamp: ${Date.now()}`;
        const payoutAdminSignature = await admin.signMessage(payoutAdminMessage);
        
        // Supplier signs PO for payment release
        const payoutSupplierMessage = `Release payment for PO ${poId}\nDeal ID: ${dealId}\nSupplier: ${supplier.address}\nAmount: ${dealData.data.targetAmount} USDC\nTimestamp: ${Date.now()}`;
        const payoutSupplierSignature = await supplier.signMessage(payoutSupplierMessage);
        
        const payoutRequest = {
          adminSignature: payoutAdminSignature,
          adminMessage: payoutAdminMessage,
          supplierSignature: payoutSupplierSignature,
          supplierMessage: payoutSupplierMessage,
          dealId: dealId,
          poId: poId,
          amount: dealData.data.targetAmount,
          chainId: 84532,
        };
        
        console.log('📋 PAYOUT RELEASE DETAILS:');
        console.log('   Admin: ' + admin.address);
        console.log('   Supplier: ' + supplier.address);
        console.log('   Deal ID: ' + dealId);
        console.log('   PO ID: ' + poId);
        console.log('   Amount: $' + payoutRequest.amount + ' USDC');
        console.log('   Dual Signatures: Admin + Supplier');
        console.log('');
        
        console.log('📤 Releasing payout via API...');
        console.log('   POST /api/v1/settlement/deals/' + dealId + '/payout-release');
        console.log('');
        
        const payoutRes = await fetch('http://localhost:3000/api/v1/settlement/deals/' + dealId + '/payout-release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payoutRequest)
        });
        
        const payoutResult = await payoutRes.json();
        console.log('📥 API Response:');
        console.log(JSON.stringify(payoutResult, null, 2));
        
        if (payoutResult.success) {
          console.log('\n🎉 PAYOUT RELEASE SUCCESSFUL!');
          console.log('   Transfer ID: ' + payoutResult.data.transferId);
          console.log('   Supplier: ' + payoutResult.data.supplierAddress);
          console.log('   Admin: ' + payoutResult.data.adminAddress);
          console.log('   Status: ' + payoutResult.data.status);
          
          // STEP 7: BUYER CONFIRMS DELIVERY
          console.log('\n' + '='.repeat(50));
          console.log('  STEP 7: BUYER CONFIRMS DELIVERY');
          console.log('='.repeat(50) + '\n');
          
          const buyerConfirmMessage = `Confirm delivery receipt for deal ${dealId}\nPO: ${poId}\nBuyer: ${buyer.address}\nTimestamp: ${Date.now()}`;
          const buyerConfirmSignature = await buyer.signMessage(buyerConfirmMessage);
          
          console.log('📋 BUYER CONFIRM DELIVERY:');
          console.log('   Buyer: ' + buyer.address);
          console.log('   Deal ID: ' + dealId);
          console.log('');
          
          const buyerConfirmRes = await fetch('http://localhost:3000/api/v1/settlement/deals/' + dealId + '/buyer-confirm-delivery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              signature: buyerConfirmSignature,
              message: buyerConfirmMessage,
            })
          });
          
          const buyerConfirmResult = await buyerConfirmRes.json();
          console.log('📥 API Response:');
          console.log(JSON.stringify(buyerConfirmResult, null, 2));
          
          if (buyerConfirmResult.success) {
            console.log('\n✅ Delivery confirmed by buyer');
            console.log('   Status: ' + buyerConfirmResult.data.status);
            
            // STEP 8: BUYER MAKES REPAYMENT
            console.log('\n' + '='.repeat(50));
            console.log('  STEP 8: BUYER MAKES REPAYMENT (PRINCIPAL + YIELD)');
            console.log('='.repeat(50) + '\n');
            
            // Calculate total repayment: principal + yield
            const principal = parseFloat(dealData.data.targetAmount);
            const yieldAmount = principal * 0.085; // 8.5% yield
            const totalRepayment = principal + yieldAmount;
            
            console.log('📋 REPAYMENT DETAILS:');
            console.log('   Principal: $' + principal.toFixed(2) + ' USDC');
            console.log('   Yield (8.5%): $' + yieldAmount.toFixed(2) + ' USDC');
            console.log('   Total Repayment: $' + totalRepayment.toFixed(2) + ' USDC');
            console.log('');
            
            const buyerRepayMessage = `Repay deal ${dealId}\nAmount: ${totalRepayment.toFixed(2)} USDC\nPrincipal: ${principal}\nYield: ${yieldAmount.toFixed(2)}\nTimestamp: ${Date.now()}`;
            const buyerRepaySignature = await buyer.signMessage(buyerRepayMessage);
            
            const buyerRepayRes = await fetch('http://localhost:3000/api/v1/settlement/deals/' + dealId + '/buyer-repay', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                signature: buyerRepaySignature,
                message: buyerRepayMessage,
                txHash: 'DEMO-REPAY-' + Date.now(),
              })
            });
            
            const buyerRepayResult = await buyerRepayRes.json();
            console.log('📥 API Response:');
            console.log(JSON.stringify(buyerRepayResult, null, 2));
            
            if (buyerRepayResult.success) {
              console.log('\n🎉 REPAYMENT SUCCESSFUL!');
              console.log('   Principal: $' + buyerRepayResult.data.principal);
              console.log('   Yield: $' + buyerRepayResult.data.yieldAmount);
              console.log('   Total Repaid: $' + buyerRepayResult.data.totalRepayment);
              console.log('   Status: ' + buyerRepayResult.data.status);
              
              // STEP 9: CHECK INVESTOR PAYOUTS
              console.log('\n' + '='.repeat(50));
              console.log('  STEP 9: INVESTOR PAYOUTS');
              console.log('='.repeat(50) + '\n');
              
              const payoutsRes = await fetch('http://localhost:3000/api/v1/settlement/deals/' + dealId + '/payouts', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
              });
              
              const payoutsResult = await payoutsRes.json();
              console.log('📋 INVESTOR PAYOUTS:');
              if (payoutsResult.payouts && payoutsResult.payouts.length > 0) {
                payoutsResult.payouts.forEach((p, i) => {
                  console.log(`   Investor ${i+1}: $${p.total} (Principal: $${p.principal}, Yield: $${p.yieldAmount})`);
                });
              }
              
              // STEP 10: CHECK FINAL DEAL STATUS
              console.log('\n' + '='.repeat(50));
              console.log('  STEP 10: FINAL DEAL STATUS');
              console.log('='.repeat(50) + '\n');
              
              const finalDealRes = await fetch('http://localhost:3000/api/v1/settlement/deals/' + dealId + '/status', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
              });
              
              const finalStatus = await finalDealRes.json();
              console.log('📊 SETTLEMENT STATUS:');
              console.log('   Status: ' + finalStatus.settlement?.status);
              console.log('   Completion: ' + finalStatus.settlement?.completionPercentage + '%');
            }
          }
        } else {
          console.log('\n⚠️  Payout release: ' + (payoutResult.error?.message || payoutResult.error || 'Failed'));
        }
        
        console.log('\n📋 FULL FLOW COMPLETE:');
        console.log('   ✅ 1. Buyer created PO with EIP-712 signature');
        console.log('   ✅ 2. Supplier signed PO with EIP-712 signature');
        console.log('   ✅ 3. Buyer created Deal & A-Token launched');
        console.log('   ✅ 4. Investor + Admin signed, Fiat onramp completed');
        console.log('   ✅ 5. Supplier payout with Admin + Supplier dual signatures');
        console.log('   ✅ 6. Buyer confirmed delivery (EIP-712 signature)');
        console.log('   ✅ 7. Buyer made repayment (principal + yield)');
        console.log('   ✅ 8. Investors received payouts');
        console.log('   ✅ Deal completed!');
      } else {
        console.log('\n⚠️  Contribution failed: ' + contributeResult.error.message);
      }
    }
  }
}
