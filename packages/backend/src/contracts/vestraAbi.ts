/**
 * vestraAbi.ts
 * Typed (viem) subsets of the Vestra v1 core ABIs used by the TS services.
 * The full ABIs live in packages/contracts/abi/*.json; vestraAbi.test.ts checks
 * that every item here matches them exactly, so a contract change fails CI.
 */
import { parseAbi } from 'viem';

export const LOAN_MANAGER_ABI = parseAbi([
  'struct Loan { address borrower; address nftContract; uint256 streamId; uint256 escrowId; address token; uint256 quantity; uint256 unlockTime; uint256 principal; uint256 scaledDebt; uint64 openedAt; uint64 maturity; uint8 rank; uint8 status; }',
  'function nextLoanId() view returns (uint256)',
  'function getLoan(uint256 loanId) view returns (Loan)',
  'function auctions(uint256) view returns (uint64 startTime, uint64 duration, uint256 startPrice, uint256 floorPrice, uint256 debt, uint256 principal, uint256 claim, uint256 mark)',
  'function isLiquidatable(uint256 loanId) view returns (bool)',
  'function debtOf(uint256 loanId) view returns (uint256)',
  'function currentRateBps() view returns (uint256)',
  'function startLiquidation(uint256 loanId)',
  'function restartAuction(uint256 loanId)',
  'event LoanOpened(uint256 indexed loanId, address indexed borrower, address indexed token, uint256 escrowId, uint256 principal, uint256 fee, uint256 maturity, uint256 pv)',
  'event LoanRepaid(uint256 indexed loanId, address indexed payer, uint256 principalPaid, uint256 interestPaid, bool closed)',
  'event LiquidationStarted(uint256 indexed loanId, address indexed caller, uint256 debt, uint256 startPrice, uint256 mark)',
  'event AuctionRestarted(uint256 indexed loanId, uint256 startPrice, uint256 floorPrice)',
  'event LoanLiquidated(uint256 indexed loanId, address indexed winner, uint256 price, uint256 insuranceCovered, uint256 lenderLoss, uint256 borrowerSurplus)',
]);

export const LENDING_POOL_EVENTS_ABI = parseAbi([
  'event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
  'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
]);

// LoanManager.Status
export enum LoanStatus {
  None = 0,
  Active = 1,
  Auction = 2,
  Repaid = 3,
  Liquidated = 4,
}
