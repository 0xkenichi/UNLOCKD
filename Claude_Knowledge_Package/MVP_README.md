# Vestra Protocol - Sovereign Data Layer

Production-grade Data Oracle & Vesting Feed Service for the $CRDT protocol.

## One-Command Testnet Spin-Up

To deploy the entire sovereign stack (Backend, Relayer, Redis, DB):

```bash
docker-compose up --build -d
```

## Monorepo Structure

- `/packages/backend`: Node.js/TS service with BullMQ + gRPC.
- `/packages/contracts`: Solidity contracts (EVM) + Anchor (Solana).
- `/packages/relayer`: ZK-friendly relayer with PyTorch risk-predictive AI.
- `/packages/sdk`: Client SDK for multi-chain data consumption.

## Core Features

1. **Vesting Feeds**: Native support for Streamflow (Solana), Superfluid, and Sablier.
2. **Oracle Consensus**: Median-of-three consensus across RedStone, Pyth, and Chainlink.
3. **AI Risk Engine (Omega Ω)**: Neural network-based predictive risk multiplier.
4. **Privacy**: ERC-5564 stealth addresses and ZK-proofs for non-custodial valuation.

## Testing

```bash
npm test # Runs all workspace tests
```

---

*Vestra Command Center - 2026*
