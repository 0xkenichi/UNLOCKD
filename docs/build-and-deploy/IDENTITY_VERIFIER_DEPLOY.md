# Identity Verifier Deploy (Testnets)
Date: January 28, 2030  
Scope: Deploy mock Semaphore verifier on Sepolia/Base Sepolia and wire into LoanManager.

## What Changed
- `IdentityVerifierMock` is deployed as part of `deploy/000_full_deploy.js`.
- `LoanManager` now receives the verifier address and an identity LTV boost (bps).

## Deploy (Sepolia / Base Sepolia)
Set optional LTV boost (default 500 bps = +5%):

```
export IDENTITY_BOOST_BPS=500
```

Run deploy:

```
npx hardhat deploy --network sepolia --tags full
```

or

```
npx hardhat deploy --network baseSepolia --tags full
```

## Post-Deploy Checks
- `IdentityVerifierMock` appears in `deployments/<network>/`.
- `LoanManager.identityVerifier()` matches the deployed verifier.
- `LoanManager.identityBoostBps()` returns configured boost.

