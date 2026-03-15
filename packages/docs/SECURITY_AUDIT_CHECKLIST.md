# Security Audit Checklist - Vestra Core Integration

## 1. Oracle & Price Feeds
- [ ] Median-of-three consensus implemented?
- [ ] Deviation threshold (2.5%) enforced?
- [ ] Fallback to on-chain TWAP verified?
- [ ] Low-latency Pyth pull pattern integrated?

## 2. Smart Contracts
- [ ] Slither analysis run on `VestaOracleConsumer.sol`?
- [ ] Integer overflow/underflow protection (Solidity 0.8+)?
- [ ] Access control for privileged functions?
- [ ] Reentrancy guards on state-changing methods?

## 3. Privacy & ZK
- [ ] ERC-5564 stealth addresses used for sensitive queries?
- [ ] ZK-proof verification logic mathematically sound?
- [ ] Relayer privacy: No ID leak in metadata?

## 4. AI Risk Model
- [ ] Model weights signed and verified?
- [ ] Input data sanitized against adversarial manipulation?
- [ ] ZK-coprocessor inference verified?

## 5. Infrastructure
- [ ] Docker images scanned for vulnerabilities?
- [ ] Helm charts use secure secrets management?
- [ ] Rate limiting enforced on gRPC/BullMQ workers?
