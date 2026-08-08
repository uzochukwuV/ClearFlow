# ClearFlow Backend - Build Plan

**Project:** Purchase Order Financing Protocol  
**Stack:** Node.js + TypeScript + Express + PostgreSQL + Prisma  
**Integrations:** Cleanverse (KYC, A-Token, Fiat Ramp) + Circle (USDC Wallets)

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    CLEARFLOW BACKEND                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────┐    ┌──────────────┐    ┌─────────────┐   │
│  │   REST API   │    │  WebSocket   │    │   Workers   │   │
│  │   Express    │    │   Server     │    │   (Bull)    │   │
│  └──────────────┘    └──────────────┘    └─────────────┘   │
│         │                   │                 │              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    SERVICES                          │   │
│  │  Identity │ Deal │ Funding │ Payout │ FiatRamp     │   │
│  │  Signature │ Token │ Wallet │ Notification        │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              EXTERNAL APIS                           │   │
│  │  Cleanverse (A-Pass, A-Token, Fiat) │ Circle (USDC)│   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   DATABASE                           │   │
│  │              PostgreSQL + Redis                       │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

---

## Build Phases (In Order)

| Phase | Name | Description |
|-------|------|-------------|
| **Phase 1** | Foundation | Project setup, database schema, config |
| **Phase 2** | Identity | Cleanverse A-Pass KYC integration |
| **Phase 3** | Purchase Orders | PO creation, dual-signature signing |
| **Phase 4** | Circle Wallet | Deal wallet creation & management |
| **Phase 5** | A-Token | Cleanverse compliance token issuance |
| **Phase 6** | Funding | Contributions, attribution, state machine |
| **Phase 7** | Fiat Ramp | Cleanverse fiat on/off-ramp |
| **Phase 8** | Deal Closure | Close funding, mint tokens, supplier payout |
| **Phase 9** | Delivery & Repayment | Attestation, buyer repayment, investor settlement |
| **Phase 10** | Default & Compliance | Freeze accounts, audit trail |

---

## Division of Responsibilities

| Layer | Provider |
|-------|----------|
| Identity/KYC | Cleanverse |
| Compliance Token | Cleanverse |
| Fiat → USDC | Cleanverse |
| USDC → Fiat | Cleanverse |
| USDC Wallets | Circle |
| USDC Transfers | Circle |

---

## PHASE 1: Foundation & Core Infrastructure

### 1.1 Project Setup
```
Task: Initialize Node.js/TypeScript project
```
- [ ] Initialize npm project: `npm init`
- [ ] Install dependencies:
  ```bash
  npm install express cors helmet morgan express-async-handler
  npm install typescript ts-node @types/node @types/express @types/cors @types/morgan
  npm install prisma @prisma/client
  npm install zod zod-to-json-schema
  npm install pino pino-pretty
  npm install bull ioredis
  npm install uuid @types/uuid
  npm install dotenv
  ```
- [ ] Initialize TypeScript: `npx tsc --init`
- [ ] Configure `tsconfig.json` (target: ES2022, strict mode)
- [ ] Configure ESLint + Prettier

### 1.2 Project Structure
```
src/
├── config/           # Environment, constants
├── controllers/      # Route handlers
├── services/         # Business logic
│   ├── identity/     # Cleanverse A-Pass
│   ├── deal/         # Deal management
│   ├── funding/      # Contributions
│   ├── payment/      # Circle transfers
│   ├── fiatRamp/     # Cleanverse fiat
│   ├── token/        # A-Token
│   └── signature/    # EIP-191 signing
├── middleware/       # Auth, validation, error handling
├── routes/          # Express routes
├── jobs/            # Bull queue workers
├── utils/           # Helpers, crypto
├── types/           # TypeScript types
└── app.ts           # Express app setup
```

### 1.3 Environment Configuration
```typescript
// src/config/env.ts
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/clearflow

# Redis (for Bull queue)
REDIS_URL=redis://localhost:6379

# Cleanverse
CLEANVERSE_API_ID=
CLEANVERSE_API_KEY=
CLEANVERSE_BASE_URL=https://uatapi.cleanverse.com/api/cooperate
CLEANVERSE_ADMIN_WALLET=0x...

# Circle
CIRCLE_API_KEY=
CIRCLE_BASE_URL=https://api.circle.com
CIRCLE_WALLET_SET_ID=
CIRCLE_ENTITY_SECRET=
CIRCLE_WEBHOOK_SECRET=

# App
PORT=3000
NODE_ENV=development
JWT_SECRET=
```

### 1.4 Database Schema (Prisma)
```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserType {
  BUYER
  SUPPLIER
  INVESTOR
  PLATFORM
}

enum ApassStatus {
  PENDING
  ACTIVE
  FROZEN
  EXPIRED
}

enum PoStatus {
  DRAFT
  PENDING_SIGNATURE
  SIGNED
  CANCELLED
}

enum DealStatus {
  DRAFT
  OPEN
  CLOSED_FUNDED
  CLOSED_SHORTFALL
  FUNDED
  AWAITING_DELIVERY
  DELIVERED
  AWAITING_REPAYMENT
  COMPLETED
  DEFAULTED
  CANCELLED
}

enum ContributionType {
  CRYPTO       // USDC direct via Circle
  FIAT         // Fiat via Cleanverse on-ramp
}

enum ContributionStatus {
  PENDING
  CONFIRMED
  REFUNDED
  FAILED
}

enum DeliveryStatus {
  PENDING
  BUYER_CONFIRMED
  SUPPLIER_CONFIRMED
  CONFIRMED
}

model User {
  id              String       @id @default(uuid())
  walletAddress   String       @unique
  chain           String       @default("polygon")
  userType        UserType
  apassId         String?      @unique
  apassStatus     ApassStatus  @default(PENDING)
  apassTier       Int?
  apassCountries  String[]
  email           String?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  // Relations
  purchaseOrdersAsBuyer    PurchaseOrder[] @relation("BuyerOrders")
  purchaseOrdersAsSupplier PurchaseOrder[] @relation("SupplierOrders")
  contributions     Contribution[]
  investorPayouts  InvestorPayout[]

  @@index([walletAddress])
  @@index([apassId])
}

model PurchaseOrder {
  id              String    @id @default(uuid())
  poReference     String
  buyerId         String
  supplierId      String
  amount          Decimal   @db.Decimal(20, 2)
  currency        String    @default("USD")
  quantity        Int
  advanceAmount   Decimal   @db.Decimal(20, 2)  // Amount to raise
  advancePercent  Int       // e.g., 80 for 80%
  deliveryDate    DateTime
  status          PoStatus  @default(DRAFT)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relations
  buyer           User      @relation("BuyerOrders", fields: [buyerId], references: [id])
  supplier        User      @relation("SupplierOrders", fields: [supplierId], references: [id])
  signatures      POSignature[]
  deal            Deal?

  @@unique([buyerId, poReference])
  @@index([buyerId])
  @@index([supplierId])
}

model POSignature {
  id              String    @id @default(uuid())
  purchaseOrderId String
  signer          UserType  // BUYER or SUPPLIER
  signerId        String
  hash            String    // EIP-191 hash of canonical PO
  signature       String    // EIP-191 signature
  signedAt        DateTime  @default(now())

  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id])

  @@unique([purchaseOrderId, signer])
  @@index([hash])
}

model Deal {
  id                  String      @id @default(uuid())
  purchaseOrderId     String      @unique
  targetAmount        Decimal     @db.Decimal(20, 2)
  runningTotal        Decimal     @db.Decimal(20, 2)  @default(0)
  currency            String      @default("USDC")
  fundingDeadline      DateTime
  yieldPercent        Int         // e.g., 5 for 5%
  status              DealStatus  @default(DRAFT)

  // Circle wallet info
  circleWalletId      String?
  circleWalletAddress String?

  // A-Token info
  atokenRequestId     String?
  atokenSymbol        String?
  atokenAddress       String?
  totalSupply         Decimal     @db.Decimal(20, 2)  @default(0)

  // Compliance rules
  minInvestorTier     Int         @default(1)
  eligibleCountries   String[]    @default([])

  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt

  purchaseOrder       PurchaseOrder   @relation(fields: [purchaseOrderId], references: [id])
  contributions       Contribution[]
  deliveries          Delivery[]
  repayments          Repayment[]
  investorPayouts     InvestorPayout[]

  @@index([status])
  @@index([circleWalletId])
}

model Contribution {
  id              String             @id @default(uuid())
  dealId          String
  investorId      String
  amount          Decimal            @db.Decimal(20, 2)
  currency        String             @default("USDC")
  type            ContributionType
  status          ContributionStatus @default(PENDING)

  // Attribution
  txHash          String?
  fromAddress     String?            // Investor wallet
  toAddress       String?            // Deal wallet

  // Fiat ramp tracking
  rampOrderId     String?
  rampQuoteToken  String?

  confirmedAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  deal            Deal      @relation(fields: [dealId], references: [id])
  investor        User      @relation(fields: [investorId], references: [id])

  @@index([dealId])
  @@index([investorId])
  @@index([txHash])
  @@index([rampOrderId])
}

model Delivery {
  id              String         @id @default(uuid())
  dealId          String
  status          DeliveryStatus @default(PENDING)

  // Attestation signatures
  buyerSignature      String?
  buyerSignedAt       DateTime?
  supplierSignature   String?
  supplierSignedAt     DateTime?

  notes           String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  deal            Deal           @relation(fields: [dealId], references: [id])

  @@index([dealId])
}

model Repayment {
  id              String    @id @default(uuid())
  dealId          String
  amount          Decimal   @db.Decimal(20, 2)
  currency        String    @default("USDC")
  txHash          String?
  paidAt          DateTime?
  createdAt       DateTime  @default(now())

  deal            Deal      @relation(fields: [dealId], references: [id])

  @@index([dealId])
  @@index([txHash])
}

model InvestorPayout {
  id              String    @id @default(uuid())
  dealId          String
  investorId      String
  principal       Decimal   @db.Decimal(20, 2)
  yield           Decimal   @db.Decimal(20, 2)
  total           Decimal   @db.Decimal(20, 2)
  tokenAmount     Decimal   @db.Decimal(20, 2)

  status          String    @default("PENDING") // PENDING, PROCESSING, COMPLETED, FAILED
  txHash          String?
  bankAccountId   String?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  deal            Deal      @relation(fields: [dealId], references: [id])
  investor        User      @relation(fields: [investorId], references: [id])

  @@index([dealId])
  @@index([investorId])
}

model AuditLog {
  id              String    @id @default(uuid())
  entityType      String    // User, Deal, Contribution, etc.
  entityId        String
  action          String    // CREATED, UPDATED, SIGNED, FUNDED, etc.
  actor           String?   // wallet address or system
  details         Json?     // Additional context
  createdAt       DateTime  @default(now())

  @@index([entityType, entityId])
  @@index([action])
  @@index([createdAt])
}
```

### 1.5 Express App Setup
```typescript
// src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import { config } from './config/env';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Routes
import identityRoutes from './routes/identity';
import purchaseOrderRoutes from './routes/purchaseOrder';
import dealRoutes from './routes/deal';
import contributionRoutes from './routes/contribution';
import paymentRoutes from './routes/payment';
import webhookRoutes from './routes/webhook';

app.use('/api/v1/identity', identityRoutes);
app.use('/api/v1/purchase-orders', purchaseOrderRoutes);
app.use('/api/v1/deals', dealRoutes);
app.use('/api/v1/contributions', contributionRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

export default app;
```

### 1.6 Error Handling
```typescript
// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import pino from 'pino';

const logger = pino();

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, code: err.code }
    });
  }

  logger.error({ err, req: req.url }, 'Unhandled error');

  return res.status(500).json({
    success: false,
    error: { message: 'Internal server error' }
  });
};
```

### 1.7 Bull Queue Setup
```typescript
// src/jobs/queue.ts
import Bull from 'bull';
import { config } from '../config/env';

export const jobQueue = new Bull('clearflow', config.REDIS_URL);

// Processors
jobQueue.process('poll-apass-status', 5, async (job) => {
  // Poll Cleanverse for A-Pass status
});

jobQueue.process('poll-atoken-issuance', 5, async (job) => {
  // Poll Cleanverse for A-Token issuance
});

jobQueue.process('poll-ramp-order', 5, async (job) => {
  // Poll Cleanverse for fiat ramp order status
});

jobQueue.process('check-deal-deadline', async (job) => {
  // Check and close deals past funding deadline
});

jobQueue.process('check-delivery-deadline', async (job) => {
  // Check for overdue deliveries and trigger defaults
});
```

### 1.8 Utility Functions
```typescript
// src/utils/crypto.ts
import { ethers } from 'ethers';
import { keccak256, toUtf8Bytes, parseUnits, formatUnits } from 'ethers/lib/utils';

// Canonicalize PO terms for signing
export function canonicalizePO(po: {
  buyerAddress: string;
  supplierAddress: string;
  quantity: number;
  amount: string;
  deliveryDate: string;
  poReference: string;
}): string {
  return JSON.stringify({
    buyer_address: po.buyerAddress.toLowerCase(),
    supplier_address: po.supplierAddress.toLowerCase(),
    quantity: po.quantity,
    amount: po.amount,
    delivery_date: po.deliveryDate,
    po_reference: po.poReference
  });
}

// Hash for EIP-191 signing
export function hashPO(po: object): string {
  const canonical = canonicalizePO(po as any);
  return keccak256(toUtf8Bytes(canonical));
}

// Format USDC amounts (6 decimals)
export function formatUSDC(amount: bigint): string {
  return formatUnits(amount, 6);
}

export function parseUSDC(amount: string): bigint {
  return parseUnits(amount, 6);
}

// Verify EIP-191 signature
export function verifySignature(
  hash: string,
  signature: string,
  expectedAddress: string
): boolean {
  const recovered = ethers.utils.verifyMessage(
    ethers.utils.arrayify(hash),
    signature
  );
  return recovered.toLowerCase() === expectedAddress.toLowerCase();
}
```

---

## PHASE 1 Checklist

- [x] Project initialized with TypeScript
- [x] Dependencies installed
- [x] Project structure created
- [x] Environment config with zod validation
- [x] Prisma schema created (8 models)
- [x] Express app with middleware setup
- [x] Error handling middleware
- [x] Bull queue initialized
- [x] Crypto utilities (EIP-191, hashing)
- [x] Health check endpoint
- [x] TypeScript compiles successfully

### Created Files

```
src/
├── config/
│   ├── constants.ts      # App constants & enums
│   ├── database.ts       # Prisma client
│   ├── env.ts           # Environment validation
│   └── logger.ts        # Pino logger
├── controllers/          # (Placeholder for Phase 2+)
├── services/            # (Placeholder for Phase 2+)
├── middleware/
│   ├── asyncHandler.ts  # Async route wrapper
│   ├── errorHandler.ts  # Global error handler
│   └── validateRequest.ts # Zod validation
├── jobs/
│   └── queue.ts         # Bull queue setup
├── routes/
│   ├── index.ts         # Route aggregator
│   ├── health.ts        # Health endpoints
│   ├── identity.ts     # Placeholder
│   ├── deal.ts         # Placeholder
│   ├── purchaseOrder.ts # Placeholder
│   ├── contribution.ts  # Placeholder
│   ├── payment.ts       # Placeholder
│   └── webhook.ts      # Webhook handlers
├── utils/
│   └── crypto.ts        # EIP-191 signing utilities
├── types/
│   └── api.ts           # API types
├── app.ts              # Express app
└── server.ts           # Entry point

prisma/
└── schema.prisma       # Database schema (8 models)

Configuration:
├── .env.example         # Environment template
├── .gitignore          # Git ignore
├── tsconfig.json       # TypeScript config
└── package.json        # NPM scripts
```

---

## Next Steps

After Phase 1 is complete:

### → Phase 2: Identity Service (Cleanverse A-Pass)
- [x] Create Cleanverse API client with AES encryption
- [x] Implement A-Pass service (generate, query, verify, freeze)
- [x] Implement A-Token service (launch, poll, rules)
- [x] Implement Fiat Ramp service (quote, widget, order)
- [x] Implement Audit service (transactions, travel rule)
- [x] Implement Validator service (compliance pool)
- [ ] Implement `/identity/onboard` - A-Pass generation endpoint
- [ ] Implement `/identity/:wallet/status` - Check A-Pass status endpoint
- [ ] Add webhook handler for A-Pass status updates
- [ ] Set up background job to poll A-Pass status

### Phase 3: Purchase Orders
- Implement PO creation with validation
- Implement dual-signature signing (EIP-191)
- Signature verification logic

### Phase 4: Circle Wallet
- Create Circle API client
- Implement deal wallet creation
- Set up wallet set management

### Phase 5: A-Token
- Cleanverse A-Token issuance
- Compliance rules setup

### Phase 6: Funding
- Contribution tracking
- Attribution from Circle webhooks
- Funding state machine

### Phase 7: Fiat Ramp
- Cleanverse fiat on-ramp integration
- Cleanverse fiat off-ramp integration

### Phase 8-10: Completion
- Deal closure & supplier payout
- Delivery attestation
- Buyer repayment & investor settlement
- Default handling & compliance

---

## Running the Project

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Start development server
npm run dev

# Build for production
npm run build
npm start
```

---

*Last Updated: 2026-08-08*
*Phase 1 Complete ✅*
