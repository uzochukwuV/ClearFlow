# Frontend Integration Guide

Complete mapping of ClearFlow backend endpoints to frontend user flows.

---

## Table of Contents

1. [Authentication & Onboarding](#1-authentication--onboarding)
2. [Dashboard & Queries](#2-dashboard--queries)
3. [Create Purchase Order (Buyer)](#3-create-purchase-order-buyer)
4. [Sign Purchase Order (Supplier)](#4-sign-purchase-order-supplier)
5. [Create Deal & A-Token (Buyer)](#5-create-deal--a-token-buyer)
6. [Investor Contributions](#6-investor-contributions)
7. [Investor Dashboard](#7-investor-dashboard)
8. [Supplier Payout (Admin)](#8-supplier-payout-admin)
9. [Buyer Confirms Delivery](#9-buyer-confirms-delivery)
10. [Buyer Repayment](#10-buyer-repayment)
11. [Investor Claims Payout](#11-investor-claims-payout)
12. [Missing Endpoints (Needs Implementation)](#12-missing-endpoints-needs-implementation)

---

## 1. Authentication & Onboarding

### 1.1 Check if Wallet Exists
```http
GET /api/v1/users/:address
```

**Frontend Flow:**
- On app load, check if user's wallet address exists
- If 404, show onboarding wizard
- If 200, load dashboard

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "0x...",
    "role": "BUYER",
    "isRegistered": true
  }
}
```

### 1.2 Register User
```http
POST /api/v1/users/register
```

**Request:**
```json
{
  "address": "0x...",
  "role": "BUYER",
  "email": "user@example.com",
  "name": "Company Name"
}
```

**Frontend Flow:**
1. User connects wallet (MetaMask/WalletConnect)
2. User selects role
3. User submits registration
4. Redirect to role-specific dashboard

---

## 2. Dashboard & Queries

### 2.1 Dashboard Data (Role-Based)

#### Buyer Dashboard
```http
GET /api/v1/dashboard/buyer
```

#### Supplier Dashboard
```http
GET /api/v1/dashboard/supplier
```

#### Investor Dashboard
```http
GET /api/v1/dashboard/investor
```

### 2.2 Query Single Deal
```http
GET /api/v1/deals/:dealId
```

### 2.3 Query Deal Timeline (Audit Log)
```http
GET /api/v1/deals/:dealId/timeline
```

---

## 3. Create Purchase Order (Buyer)

### 3.1 Create PO
```http
POST /api/v1/purchase-orders
```

**Request:**
```json
{
  "buyerAddress": "0x...",
  "supplierAddress": "0x...",
  "amount": 250000,
  "currency": "USD",
  "quantity": 10000,
  "description": "Electronic components",
  "deliveryDate": "2026-12-31",
  "signature": "0x..."
}
```

**Frontend Flow:**
1. Buyer fills PO form
2. Frontend prepares EIP-712 typed data
3. User signs with wallet
4. Submit to backend
5. Display PO summary with hash

**Display After Creation:**
- PO Reference: `PO-XXXXXXXXXX`
- Status: `PENDING_SUPPLIER_SIGNATURE`
- Buyer signature hash
- Next step indicator: "Awaiting supplier signature"

### 3.2 Get PO Status
```http
GET /api/v1/purchase-orders/:poId
```

---

## 4. Sign Purchase Order (Supplier)

### 4.1 Supplier Signs PO
```http
POST /api/v1/purchase-orders/:poId/sign
```

**Request:**
```json
{
  "address": "0x...",
  "signature": "0x..."
}
```

**Frontend Flow:**
1. Supplier views pending PO
2. Supplier reviews PO details
3. Supplier signs EIP-712 message
4. Submit signature
5. PO status changes to `SIGNED`

**Display After Signing:**
- Status: `SIGNED`
- Both signatures displayed
- Action: "Create Deal for this PO" button

---

## 5. Create Deal & A-Token (Buyer)

### 5.1 Create Deal
```http
POST /api/v1/deals
```

**Request:**
```json
{
  "poId": "uuid",
  "buyerAddress": "0x...",
  "targetAmount": 150000,
  "yield": 8.5,
  "fundingDeadline": "2026-09-30T23:59:59Z",
  "deliveryDeadline": "2026-10-31T23:59:59Z",
  "eligibleCountries": ["US", "CN", "SG"],
  "signature": "0x..."
}
```

**Frontend Flow:**
1. Buyer clicks "Create Deal" on signed PO
2. Buyer sets deal parameters:
   - Target amount (must be ≤ PO amount)
   - Yield percentage (e.g., 8.5%)
   - Funding deadline
   - Delivery deadline
   - Eligible investor countries
3. Buyer signs EIP-712
4. Submit to backend
5. A-Token is automatically launched

**Display After Creation:**
- Deal ID
- A-Token Symbol: `POF-XXXXX` (auto-generated)
- Status: `OPEN`
- Link to share with investors
- Progress bar: Funded $0 / Target $150,000

### 5.2 List Open Deals (for Investor Discovery)
```http
GET /api/v1/deals?status=OPEN
```

---

## 6. Investor Contributions

### 6.1 Contribute to Deal
```http
POST /api/v1/deals/:dealId/contribute
```

**Request:**
```json
{
  "investorAddress": "0x...",
  "amount": 50000,
  "signature": "0x..."
}
```

**Frontend Flow:**
1. Investor enters contribution amount
2. Shows fiat onramp (Ramp) link for buying USDC
3. Investor approves USDC for contract
4. Investor signs contribution
5. Backend confirms and mints A-Tokens

**Display After Contribution:**
```
✅ CONTRIBUTION CONFIRMED
Amount: $50,000 USDC
A-Tokens Received: 50,000 POF-ABC12
Yield Accruing: 8.5% APR
Expected Return: $54,250
```

### 6.2 Get User's Contributions
```http
GET /api/v1/users/:address/contributions
```

### 6.3 Ramp Onramp URL (Fiat → USDC)
```
GET /api/v1/ramp/onramp-url?address=0x...&amount=50000
```

---

## 7. Investor Dashboard

### 7.1 Portfolio Summary
```http
GET /api/v1/users/:address/portfolio
```

**Display:**
```
📊 YOUR PORTFOLIO
💰 Total Invested: $100,000
📈 Total Yield Earned: $8,500
⏳ Pending Yield: $4,250
🎫 Active Deals: 3
```

### 7.2 Holdings by Deal
```http
GET /api/v1/users/:address/holdings
```

**Display:**
```
🎫 YOUR HOLDINGS
POF-ABC12
  Tokens: 50,000 | Value: $50,000
  Yield Accrued: $4,250
  Status: 🔄 In Progress
  Claim: Not Available Yet

POF-DEF34  
  Tokens: 50,000 | Value: $50,000
  Yield Accrued: $4,250
  Status: ✅ Ready
  Claim: [CLAIM $54,250]
```

---

## 8. Supplier Payout (Admin)

### 8.1 Initiate Payout Release
```http
POST /api/v1/settlement/deals/:dealId/payout-release
```

**Request:**
```json
{
  "adminAddress": "0x...",
  "supplierAddress": "0x...",
  "amount": 150000,
  "poId": "uuid",
  "adminSignature": "0x...",
  "supplierSignature": "0x..."
}
```

**Frontend Flow (Admin Dashboard):**
1. Admin sees "Funded Deals" waiting for payout
2. Admin clicks "Release Payout"
3. System generates dual-signature request
4. Admin signs with wallet
5. Supplier signs (or receives email/SMS to sign)
6. Both signatures submitted
7. Transfer executed from deal wallet to supplier

**Display:**
```
💰 PAYOUT RELEASE
Supplier: 0xA89f...01f20
Amount: $150,000 USDC
Deal: POF-ABC12
PO: PO-12345
Status: ✅ Payout Released
Transfer: 0x...abc
```

---

## 9. Buyer Confirms Delivery

### 9.1 Buyer Confirms Goods Received
```http
POST /api/v1/settlement/deals/:dealId/buyer-confirm-delivery
```

**Request:**
```json
{
  "buyerAddress": "0x...",
  "signature": "0x..."
}
```

**Frontend Flow:**
1. After supplier confirms goods shipped
2. Buyer verifies goods received
3. Buyer clicks "Confirm Delivery"
4. Buyer signs EIP-712 confirmation
5. Status changes to `AWAITING_REPAYMENT`

**Display:**
```
✅ DELIVERY CONFIRMED
Buyer: 0x773d...Ed4a
Confirmed: Aug 8, 2026
Status: Awaiting Repayment
Next: Buyer to make repayment
```

---

## 10. Buyer Repayment

### 10.1 Get Repayment Amount
```http
GET /api/v1/settlement/deals/:dealId/repayment-info
```

**Display:**
```
💵 REPAYMENT DUE
Principal: $150,000.00 USDC
Yield (8.5%): $12,750.00 USDC
TOTAL DUE: $162,750.00 USDC
Due Date: Oct 31, 2026
[MAKE REPAYMENT]
```

### 10.2 Buyer Makes Repayment
```http
POST /api/v1/settlement/deals/:dealId/buyer-repay
```

**Request:**
```json
{
  "buyerAddress": "0x...",
  "amount": 162750,
  "signature": "0x..."
}
```

**Frontend Flow:**
1. Buyer clicks "Make Repayment"
2. System calculates: Principal + Yield
3. Buyer approves USDC transfer
4. Buyer signs repayment transaction
5. Backend receives USDC into deal wallet
6. Status changes to `READY_FOR_DISTRIBUTION`

**Display:**
```
✅ REPAYMENT COMPLETE
Amount Paid: $162,750.00 USDC
Transaction: 0x...abc
Status: Ready for Distribution
Investors can now claim their returns
```

---

## 11. Investor Claims Payout

### 11.1 Get Claimable Amount
```http
GET /api/v1/settlement/deals/:dealId/investor/:address/claim
```

**Display:**
```
🎁 CLAIM YOUR RETURNS
Deal: POF-ABC12
Your Investment: $50,000
Your Yield: $4,250
TOTAL TO RECEIVE: $54,250 USDC
[CLAIM NOW]
```

### 11.2 Claim Payout
```http
POST /api/v1/settlement/deals/:dealId/investor/:address/claim
```

**Request:**
```json
{
  "investorAddress": "0x...",
  "signature": "0x..."
}
```

**Frontend Flow:**
1. Investor clicks "Claim" button
2. Investor signs claim transaction
3. Backend transfers USDC from deal wallet to investor
4. A-Tokens are burned

**Display:**
```
✅ CLAIM SUCCESSFUL!
Amount Received: $54,250.00 USDC
Transaction: 0x...abc
Tokens Burned: 50,000 POF-ABC12
Thank you for investing with ClearFlow!
```

---

## 12. Implemented Backend Endpoints ✅

All the following endpoints are now implemented in the backend:

### 12.1 Dashboard Aggregations
| Endpoint | Description |
|----------|-------------|
| `GET /dashboard/buyer/:address` | Buyer dashboard with POs, deals, stats |
| `GET /dashboard/supplier/:address` | Supplier dashboard with pending POs, payouts |
| `GET /dashboard/investor/:address` | Investor dashboard with portfolio, contributions, claims |
| `GET /dashboard/admin/:address` | Admin dashboard with all deals and pending actions |

### 12.2 Portfolio & Holdings
| Endpoint | Description |
|----------|-------------|
| `GET /portfolio/:address` | Portfolio summary with totals and yield |
| `GET /portfolio/:address/holdings` | Detailed token holdings per deal |
| `GET /portfolio/:address/contributions` | Contribution history |

### 12.3 Deal Discovery
| Endpoint | Description |
|----------|-------------|
| `GET /deals-discovery` | List deals with filters (status, minYield, maxAmount, country, limit, offset) |
| `GET /deals-discovery/open` | List all open deals for investor discovery |
| `GET /deals-discovery/:dealId` | Deal details with contributions, repayments, payouts |
| `GET /deals-discovery/:dealId/timeline` | Deal audit trail |

### 12.4 Investor Claims
| Endpoint | Description |
|----------|-------------|
| `GET /claims/investor/:address` | All claimable payouts for investor |
| `GET /claims/:dealId/investor/:address` | Claimable amount for specific deal |
| `POST /claims/:dealId/investor/:address/claim` | Claim payout with EIP-712 signature |
| `GET /claims/history/:address` | Claim history (pending and claimed) |

### 12.5 Fiat Onramp (Already Existed)
| Endpoint | Description |
|----------|-------------|
| `GET /ramp/currencies` | Supported fiat currencies |
| `GET /ramp/countries` | Supported countries |
| `POST /ramp/quote` | Get on-ramp quote |
| `POST /ramp/widget` | Create widget URL for payment |
| `POST /ramp/on-ramp/quote` | On-ramp quote (fiat → USDC) |
| `POST /ramp/off-ramp/quote` | Off-ramp quote (USDC → fiat) |
| `GET /ramp/order/:orderId` | Order status |
| `POST /ramp/faucet` | Request test tokens |

### 12.6 Settlement Endpoints (Already Existed)
| Endpoint | Description |
|----------|-------------|
| `GET /settlement/deals/:dealId/status` | Settlement status |
| `POST /settlement/deals/:dealId/buyer-repay` | Buyer makes repayment |
| `POST /settlement/deals/:dealId/payout-release` | Release payout to supplier |

---

## 13. Missing Endpoints (Low Priority)

The following endpoints are **not yet implemented** and can be added later:

### 13.1 User Management
| Endpoint | Description | Priority |
|----------|-------------|----------|
| `POST /users/register` | Register new user | MEDIUM |
| `PUT /users/:address` | Update user profile | LOW |

### 13.2 Notifications
| Endpoint | Description | Priority |
|----------|-------------|----------|
| `GET /notifications` | User notifications | LOW |
| `PUT /notifications/:id/read` | Mark as read | LOW |

---

## Frontend State Management

### Recommended State Structure

```typescript
interface AppState {
  user: {
    address: string | null;
    role: 'BUYER' | 'SUPPLIER' | 'INVESTOR' | 'ADMIN' | null;
    isRegistered: boolean;
  };
  
  dashboard: {
    purchaseOrders: PurchaseOrder[];
    deals: Deal[];
    contributions: Contribution[];
    pendingActions: Action[];
  };
  
  currentDeal: {
    deal: Deal | null;
    contributions: Contribution[];
    timeline: TimelineEvent[];
  };
  
  ui: {
    isLoading: boolean;
    error: string | null;
    successMessage: string | null;
  };
}
```

### Key User Flows

```
┌─────────────────────────────────────────────────────────────┐
│ BUYER FLOW                                                   │
├─────────────────────────────────────────────────────────────┤
│ 1. Onboarding → Register as BUYER                          │
│ 2. Dashboard → View "Create Deal" button on signed PO       │
│ 3. Create Deal → Set parameters, sign EIP-712              │
│ 4. Monitor → Track funding progress, investor contributions │
│ 5. Confirm Delivery → After goods received                 │
│ 6. Repay → Make repayment (principal + yield)               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ SUPPLIER FLOW                                                │
├─────────────────────────────────────────────────────────────┤
│ 1. Onboarding → Register as SUPPLIER                       │
│ 2. Dashboard → View pending POs needing signature          │
│ 3. Sign PO → Review and sign EIP-712                       │
│ 4. Wait → Track deal funding status                        │
│ 5. Payout → Sign payout release (dual signature)           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ INVESTOR FLOW                                               │
├─────────────────────────────────────────────────────────────┤
│ 1. Onboarding → Register as INVESTOR                       │
│ 2. Discover → Browse OPEN deals with yields                │
│ 3. Invest → Buy USDC (Ramp), contribute to deal           │
│ 4. Track → View portfolio, yield accruing                  │
│ 5. Claim → After repayment, claim principal + yield         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ADMIN FLOW                                                   │
├─────────────────────────────────────────────────────────────┤
│ 1. Onboarding → Register as ADMIN                          │
│ 2. Dashboard → View deals needing payout                   │
│ 3. Approve → Sign payout release (dual signature)           │
│ 4. Monitor → Track all deals and settlements               │
└─────────────────────────────────────────────────────────────┘
```

---

## Error Handling

### Common Error Codes

| Code | Meaning | User Message |
|------|---------|--------------|
| `PO_NOT_SIGNED` | PO needs supplier signature | "This PO is waiting for supplier signature" |
| `DEAL_NOT_FUNDED` | Deal hasn't reached target | "This deal needs more funding first" |
| `UNAUTHORIZED` | Wrong role for action | "You're not authorized for this action" |
| `INVALID_SIGNATURE` | EIP-712 signature failed | "Signature verification failed" |
| `INSUFFICIENT_BALANCE` | Not enough USDC | "Insufficient USDC balance" |
| `DEAL_CLOSED` | Deal no longer accepting contributions | "This deal is no longer accepting contributions" |

---

## WebSocket Events (Future)

For real-time updates, subscribe to:

```
ws://api.clearflow.com/ws?address=0x...

Events:
- deal.funded
- deal.payout-released
- deal.repayment-received
- deal.distributed
- contribution.received
- notification.new
```

---

## Appendix: EIP-712 Typed Data

### PO Signing Domain
```json
{
  "name": "ClearFlow",
  "version": "1",
  "chainId": 80002,
  "verifyingContract": "0x..."
}
```

### PO Signing Types
```json
{
  "PurchaseOrder": [
    { "name": "poId", "type": "string" },
    { "name": "buyer", "type": "address" },
    { "name": "supplier", "type": "address" },
    { "name": "amount", "type": "uint256" },
    { "name": "hash", "type": "bytes32" }
  ]
}
```

---

*Last Updated: August 8, 2026*
