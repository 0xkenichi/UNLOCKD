# Vestra Protocol Product Requirements Document (PRD)

## 1. Overview
Vestra Protocol is a decentralized liquidity layer designed to unlock the trapped capital within vested token streams and multi-chain digital portfolios. The system provides a zero-knowledge enhanced, cross-chain capable architecture where users can borrow liquidity against their locked token allocations, or supply stablecoins to earn risk-adjusted yield.

## 2. Objectives
- **Unlock Liquidity:** Enable users with vested tokens (e.g., Team Allocations, Seed Investments) to borrow stable liquidity (USDC) instantly.
- **Privacy & Sovereignty:** Provide an anti-surveillance, zero-knowledge identity integration so high-net-worth lenders and borrowers can interact without exposing capital history.
- **Multi-Chain Asset Discovery:** Automatically scan and aggregate users' assets across EVM, Flow EVM, and Solana using industry-leading indexing (Alchemy, Dune Analytics, Helius).

## 3. Core Protocol Components

### 3.1 Vestra Frontend Suite
- **Dashboard:** High-level overview of borrowing power, supply APY, and multichain total net worth.
- **Portfolio & Global Scanner:** Automatically resolves assets (liquid, vested streams, and DeFi positions) on EVM and Solana directly inside the portfolio screen.
- **Borrowing Engine:** Collateralize recognized vested streams or liquid tokens to mint synthetic purchasing power or borrow established stablecoins.
- **Treasury:** A transparent interface showing Protocol Reserves, Lending Pool liquidity, and total protocol revenue capture.
- **Auction Engine / Liquidations:** Decentralized clearinghouse where bad debt or defaulted loans are liquidated algorithmically.

### 3.2 Smart Contracts (V7 Facet Architecture)
- **LendingPool:** Manages supplier USDC deposits, yielding interest back to depositors.
- **LoanManager:** Tracks collateral, originates individual loans, enforces LTV maximums, and accrues interest.
- **AuctionFactory:** Facilitates Dutch and Sealed-Bid auctions to sell off collateralized NFT streams upon liquidation.
- **VestraAccessControl:** Hierarchical, upgradable admin management.

## 4. Testnet Flow & Goals
During the Testnet launch phase, Vestra will support:
1. Connecting a Testnet wallet (Sepolia or Flow EVM).
2. Supplying "Mock USDC" into the Lending Pool.
3. Automatically resolving "Mock Vested Streams" as valid collateral.
4. Allowing testnet users to issue themselves a loan using their Testnet streams.

## 5. Value Accrual Mechanism
Vestra accrues value primarily through:
- **Origination Fees:** Charged at the time a loan is minted.
- **Interest Spreads:** A margin captured between what the borrower pays and what the supplier receives.
- **Liquidation Penalties:** Extracting value from under-collateralized loans.
- **SDK Builder Fees:** Independent developers utilizing `@vestra/sdk` can set a builder fee that routes a portion of loan origination revenue to their dApp treasury.

## 6. Success Metrics
- 100% smart contract test suite pass rate without catastrophic math overflow.
- Successful liquidation processing of defaulted loans in a test environment.
- Sub-2 second multi-chain indexing speed for global portfolio scanning.
