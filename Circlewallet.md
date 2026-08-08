https://developers.circle.com/wallets/dev-controlled

For our product this maps directly to:

PO created
    ↓
Create Circle deal wallet
    ↓
Investors send USDC
    ↓
Deal wallet holds funds
    ↓
Funding target reached
    ↓
Deal wallet pays supplier
    ↓
Buyer eventually repays
    ↓
Deal wallet pays investors

 Wallet set architecture

Circle uses a wallet set as a container for developer-controlled wallets.

We should create one wallet set for the application:

PO Financing Wallet Set
        │
        ├── PO-0001 Deal Wallet
        ├── PO-0002 Deal Wallet
        ├── PO-0003 Deal Wallet
        └── ...

Circle's documentation states that wallets in a wallet set share the entity secret, and EVM wallets in the same set share the same address index system.

Source:https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet