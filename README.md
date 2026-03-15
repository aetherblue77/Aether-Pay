# 🌌 Aether Pay

**The Enterprise-Grade Decentralized Payment Gateway with Auto-Yield.**

Welcome to the core repository of **Aether Pay**. 
Traditional payment gateways let your money sit idle. Aether Pay redefines commerce by instantly routing merchant revenue into decentralized liquidity pools (like Aave V3), ensuring that every dollar processed is a dollar generating yield.

Built for mass adoption, designed for maximum capital efficiency.

## 🚀 The Vision
Our mission is to eliminate the friction between Web2 e-commerce and Web3 DeFi. Aether Pay allows buyers to pay seamlessly, while merchants automatically earn interest on their revenue without needing to understand the complexities of crypto staking or yield farming.

## 🏗️ Architecture Overview

This repository is organized into a monorepo structure, dividing the enterprise architecture into two main branches:

### 1. `backend/` (The Vault & Yield Engine)
The blockchain brain of Aether Pay. This directory contains our immutable smart contracts, deployment modules via Hardhat Ignition, and the interaction scripts that handle the complex math of shares, principal, and yield extraction. 
👉 [Explore the Backend Architecture](./backend/README.md)

### 2. `frontend/` (The User Experience) *(Work in Progress)*
The bridge to the masses. This directory will house our intuitive, abstraction-layer UI. It is designed to allow buyers to pay effortlessly using Account Abstraction (AA)—eliminating the need for seed phrases or complex gas fee calculations.

## 🛡️ Built With
* **Network:** Base (Layer 2)
* **DeFi Integration:** Aave V3 Liquidity Pools
* **Smart Contracts:** Solidity, Hardhat, Ethers.js

---
*Aether Pay is currently in active development on the Base Sepolia Testnet.*