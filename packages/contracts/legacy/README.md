# Legacy contracts (not built, not deployable)

Everything in this folder was moved out of `src/`, `test/` and `script/` during the
October 2026 audit remediation. It is kept for reference only. Foundry does not compile it.

Why it was removed from the build:

* **It did not compile.** The facet-based loan system (`LoanOriginationFacet`, `LoanRepaymentFacet`,
  `LoanManagerStorage`, `LoanLogicLib`), the auction family (`BaseAuction`, `DutchAuction`,
  `EnglishAuction`, `SealedBidAuction`, `StagedTrancheAuction`, `AuctionFactory`, the old
  `LiquidationAuction`) and `SoloBorrowingVault` called adapter functions that no longer existed or
  decoded return values with the wrong arity. The old `LoanManager.sol` built a 12-field struct with
  10 fields. The old tests used constructors that no longer existed.
* **It had critical design flaws**, including:
  * the old `LendingPool` sent lender deposits to an external treasury wallet, paid lenders no
    interest, hid defaults instead of writing them down, and funded staking APYs from other users'
    principal;
  * anyone could create an auction over someone else's escrowed collateral, or make the insurance
    vault pay off a loan via a non-existent auction id;
  * the insurance vault let the governor or any guardian withdraw at will;
  * a single "OpenClaw" agent vote could set Ω to 0 and trigger mass liquidations;
  * `ZkAiAdapter`, `ZKShield` and `VestraOracleConsumer` accepted any proof / any signer.

The replacement core lives in `../src` and is described in `../ARCHITECTURE.md`. Features that exist
only here (staged tranche auctions, credit registry, isolated pools, term vaults, privacy shields,
claim wrappers for OZ VestingWallet / Superfluid / TokenTimelock) should be re-introduced one at a
time, against the new interfaces, with tests and review.
