# ⚙️ Aether Pay - Core Engine & Smart Contracts

This directory contains the foundational smart contracts and backend infrastructure for **Aether Pay**. It is built with a focus on enterprise-level security, precise accounting, and seamless integration with third-party DeFi protocols.

## 🧠 Core Mechanics

At its heart, the `AetherPay.sol` smart contract acts as a non-custodial vault and yield router.

* **Auto-Staking:** When a buyer makes a payment, the USDC is immediately supplied to the Aave V3 pool on behalf of the protocol.
* **The Shares System:** Merchants are issued "Shares" representing their ownership of the underlying assets. This standardizes accounting and protects the system from rounding errors (the 1-wei dust phenomenon) common in Ray Math calculations.
* **Revenue Extraction:** During withdrawal, the contract cleanly separates the principal amount from the generated yield. It returns the principal to the merchant, distributes the majority of the yield as profit, and automatically routes a defined protocol fee (e.g., 30% of the yield) to the protocol's Treasury.

## 🛠️ Tech Stack & Tooling

* **Framework:** Hardhat V2
* **State Management:** Hardhat Ignition (Replacing legacy `hardhat-deploy`)
* **Type Safety:** TypeChain & TypeScript
* **Blockchain Interaction:** Ethers.js v6
* **Testing & Simulation:** Mainnet Forking / Base Sepolia Testnet

## 📜 Interaction Scripts

We rely on highly robust, environment-agnostic interaction scripts to simulate and verify real-world behaviors on the blockchain:

1. **`01-buyerFlow.ts`**: Simulates the customer journey. It handles ERC20 approvals, executes the `pay()` function, and validates the routing of funds directly into Aave's liquidity pools.
2. **`02-merchantFlow.ts`**: Acts as the automated cashier. It reads the dynamic Treasury address, executes the `withdraw()` function, and generates a post-flight ledger report proving the exact distribution of principal, merchant yield, and Treasury revenue.

*Note: Deployment addresses are managed dynamically through Hardhat Ignition's state files, ensuring our scripts remain clean and hardcode-free.*