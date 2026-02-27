# Claim-Rights Wrappers (Real Vesting Standards)

These wrappers let VESTRA escrow claim rights for **real vesting contracts** that do not
expose `releaseTo` or transfer beneficiary roles. The wrapper becomes the on-chain
settlement target used by `VestingAdapter`, while the borrower stays the economic owner.

## Why Wrappers
- Many real standards only allow **beneficiary** or **operator** withdrawals.
- VESTRA needs a callable `releaseTo(...)` at unlock for seizure/settlement.
- Wrappers provide that hook without modifying upstream contracts.

## Supported Patterns
### OpenZeppelin `VestingWallet`
- Wrapper is created first.
- Vesting is deployed with **wrapper as beneficiary**.
- Wrapper exposes `releaseTo(...)` that pulls vested funds into the wrapper
  and forwards the requested amount.

### TokenTimelock (cliff-only)
- Same pattern as OZ: wrapper is beneficiary.
- Wrapper calls `release()` at unlock and forwards the requested amount.

### Sablier v2 Lockup
- Stream recipient keeps ownership.
- Recipient sets wrapper as **approved operator** for the stream.
- Wrapper calls `withdraw(...)` on the stream at unlock.

### Superfluid Streams
- Stream is created to the wrapper (wrapper is recipient).
- Wrapper exposes `releaseTo(...)` once the stream end time is reached.

## Notes / Assumptions
- For OZ/Timelock/Superfluid, the **vesting must be created** with wrapper as beneficiary.
- For Sablier, the recipient must **keep operator approval** for settlement.
- `released(...)` in wrappers tracks amounts forwarded by the wrapper, not
  amounts released into the wrapper. This keeps collateral available until
  settlement.

## VestingAdapter whitelist (optional)
Governance can restrict which vesting contracts can be escrowed:
- `setUseWhitelist(true)` and `setAllowedVestingContract(address, true)` on `VestingAdapter`.
- When `useWhitelist` is false (default), any contract implementing the adapter interface is allowed.

## Claim-rights transfer, secondary market, and auction (planned)

Lenders may hold claim rights after a loan is created. A natural question: can the **lender** sell or auction those claim rights (e.g. to exit the position or to transfer to another liquidity provider)? This is a **planned feature**. Constraints to respect:

- Loan state must remain consistent (e.g. no auction that leaves the protocol with ambiguous ownership or repayment obligations).
- If the borrower repays, claim rights are released back to the borrower; any transfer/auction mechanism must account for loan lifecycle.
- Auction and secondary-market design are tracked in the protocol roadmap. Session notes and build plan: `docs/risk/VESTED_TOKEN_LENDING_SESSION_2026-02-14.md`.

## Demo Scripts
Run a local or testnet seed that deploys wrappers and creates loans:
```
npx hardhat run scripts/vestra-claim-rights-setup.js --network localhost
```
Seed a Sablier-backed wrapper on Sepolia (stream + wrapper + escrow):
```
SEED_SABLIER=1 npx hardhat run scripts/seed-sepolia-vesting.js --network sepolia
```
Then use the printed **Collateral ID** and **wrapper address** in the Borrow UI (Import from Sablier v2).
