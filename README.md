# RiceChain

RiceChain is a React, MetaMask, and Solidity dApp for rice supply-chain traceability. Participants register wallet profiles, farmers register rice products, farmers transfer ownership to traders, traders assign transporters and vendors for shipment, transporters record shipment updates, and vendors confirm delivery. MetaMask is used for wallet identity and blockchain transaction approval only; the app does not implement cryptocurrency payments.

## Setup

Install dependencies:

```sh
npm install
```

Create `.env` from `.env.example` and fill in Sepolia values:

```sh
cp .env.example .env
```

Frontend variables:

- `VITE_RICECHAIN_CONTRACT_ADDRESS`: `RiceChain` contract address deployed from Remix.
- `VITE_RICECHAIN_DEPLOY_BLOCK`: optional deployment block to make event loading faster.

## Smart Contract

Compile and test:

```sh
npm run compile
npm run test:contracts
```

Deploy with Remix and MetaMask:

1. Open [Remix](https://remix.ethereum.org).
2. Create or upload `contracts/RiceChain.sol`.
3. Compile with Solidity `0.8.28` or another compatible `0.8.x` compiler.
4. Open **Deploy & Run Transactions**.
5. Set **Environment** to **Injected Provider - MetaMask**.
6. Connect MetaMask and switch MetaMask to **Sepolia**.
7. Deploy the `RiceChain` contract.
8. Copy the deployed contract address into `.env`.

Example `.env`:

```env
VITE_RICECHAIN_CONTRACT_ADDRESS=0xYourRemixDeployedAddress
VITE_RICECHAIN_DEPLOY_BLOCK=0
```

The deployer wallet only needs Sepolia ETH in MetaMask for gas. No RPC URL or exported private key is required.

## Frontend

Run the dApp:

```sh
npm run dev
```

Open the Vite URL in a browser with MetaMask installed, connect a wallet, switch to Sepolia, save a participant profile, and use the role-specific traceability workflow cards.

- Register product
- Transfer ownership
- Assign shipment
- Update shipment
- Confirm delivery

Traceability history is loaded from `TraceEventRecorded` contract events and links each action to its Sepolia transaction hash.
