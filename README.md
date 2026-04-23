# CS218 — Decentralised Auction System

**Course:** CS 218 — Programmable & Interoperable Blockchain  
**Project:** Project 5 — Decentralised Auction System  
**Toolchain:** Hardhat · Solidity ^0.8.24 · OpenZeppelin Contracts v5

## Team Members

| Name | Roll Number |
|------|-------------|
| Bothumanchi Praneeth | 240008009 |
| Mahidhar | 240001030 |
| Ashok | 240001050 |
| Shiv Pratap | 240001069 |
| Santhosh | 240004013 |
| Charan | 240001057 |

## Overview

A permissionless English (open ascending-bid) auction platform on Ethereum. Any user can create auctions for named items, place bids, and withdraw losing bids using the **withdrawal (pull) pattern** — the most important reentrancy protection pattern in DeFi.

### Key Features

- **Permissionless** — anyone can create an auction, no admin role needed
- **Withdrawal pattern** — losing bidders pull their own ETH (never pushed)
- **ReentrancyGuard** — OpenZeppelin's reentrancy protection on `withdrawBid`
- **Time-based logic** — auctions expire after a configurable duration
- **Custom errors** — gas-efficient error handling with Solidity custom errors
- **NatSpec documented** — all public functions have `@notice` and `@param` comments

## Setup Instructions

### Prerequisites

- Node.js v18+ ([download](https://nodejs.org))
- MetaMask browser extension ([install](https://metamask.io))

### 1. Install Dependencies

```bash
npm install
```

### 2. Compile Contracts

```bash
npx hardhat compile
```

### 3. Run Tests

```bash
npx hardhat test
```

### 4. Run Tests with Gas Report

```bash
REPORT_GAS=true npx hardhat test
```

### 5. Generate Coverage Report

```bash
npx hardhat coverage
```

### 6. Start Local Blockchain

```bash
npx hardhat node
```

### 7. Deploy Contracts (in a new terminal)

```bash
npx hardhat run scripts/deploy.js --network localhost
```

### 8. Start Frontend (in a new terminal)

```bash
cd frontend
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 9. Configure MetaMask

1. Add a custom network:
   - **Network Name:** Hardhat Local
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency Symbol:** ETH
2. Import a test account from the Hardhat node output (copy any private key)
3. Click **Connect Wallet** in the frontend

## Contract Architecture

```
DecentralisedAuction.sol
├── createAuction()     — Create a new English auction
├── placeBid()          — Place a bid (must exceed current highest)
├── endAuction()        — End expired auction, transfer ETH to seller
├── withdrawBid()       — Losing bidders reclaim their ETH (pull pattern)
├── getAuction()        — View auction details
└── getPendingReturn()  — View pending withdrawal amount

MaliciousReentrant.sol  — Test-only attacker contract for reentrancy verification
```

## Project Structure

```
cs218-auction-system/
├── contracts/
│   ├── DecentralisedAuction.sol   # Main auction contract
│   └── MaliciousReentrant.sol     # Reentrancy test contract
├── test/
│   └── DecentralisedAuction.test.js  # Comprehensive test suite
├── scripts/
│   └── deploy.js                  # Deployment script
├── frontend/                      # React DApp frontend
│   ├── src/
│   │   └── App.jsx
│   ├── public/
│   │   └── index.html
│   └── package.json
├── hardhat.config.js
├── package.json
├── report.pdf
└── README.md
```

## Testing Summary

The test suite covers:

- **Happy path:** create → bid → outbid → end → withdraw
- **Access control:** seller cannot bid on own auction
- **Edge cases:** zero values, empty strings, non-existent auctions, expired deadlines
- **Time-travel:** bids rejected after deadline, endAuction only after expiry
- **Reentrancy attack:** malicious contract attempts re-entry on withdrawBid — blocked by ReentrancyGuard
- **Multiple auctions:** concurrent auctions operate independently
- **Exact amounts:** seller receives exactly the highest bid amount

## Gas Optimisation

- **Custom errors** instead of `require()` strings — saves ~200 gas per revert
- **`unchecked` increment** on `auctionCount` — saves ~100 gas per auction creation
- **`calldata` for string parameters** — avoids copying to memory
- **Optimizer enabled** at 200 runs in Hardhat config

See `report.pdf` for the full gas report with before/after comparison.

## Security Analysis

| Attack | Prevention |
|--------|-----------|
| Reentrancy | OpenZeppelin `ReentrancyGuard` on `withdrawBid` + CEI pattern |
| Front-running | Inherent to English auction design (open bids) |
| Timestamp manipulation | ~15s manipulation insufficient to meaningfully affect auctions |
| Integer overflow | Solidity 0.8+ built-in overflow protection |
| Denial of Service | Pull pattern — contract never pushes ETH to untrusted addresses |
| Self-dealing | Seller cannot bid on their own auction |

## License

MIT
