// ABI definitions for Vestra Protocol backend

const fs = require('fs');
const path = require('path');

// Core protocol ABIs are generated from the compiled contracts in packages/contracts/abi
// and are the single source of truth. Do not hand-write core function signatures here.
const CORE_ABI_DIR = path.join(__dirname, '..', '..', 'contracts', 'abi');

const loadCoreAbi = (name) => {
  const parsed = JSON.parse(fs.readFileSync(path.join(CORE_ABI_DIR, `${name}.json`), 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.abi;
};

const loanManagerAbi = loadCoreAbi('LoanManager');
const lendingPoolAbi = loadCoreAbi('LendingPool');
const vestingAdapterAbi = loadCoreAbi('VestingAdapter');
const valuationEngineAbi = loadCoreAbi('ValuationEngine');
const vestingRegistryAbi = loadCoreAbi('VestingRegistry');
const insuranceVaultAbi = loadCoreAbi('InsuranceVault');
const preTgeOracleAbi = loadCoreAbi('PreTGEOracle');

const CORE_ABIS = {
  LoanManager: loanManagerAbi,
  LendingPool: lendingPoolAbi,
  VestingAdapter: vestingAdapterAbi,
  ValuationEngine: valuationEngineAbi,
  VestingRegistry: vestingRegistryAbi,
  InsuranceVault: insuranceVaultAbi,
  PreTGEOracle: preTgeOracleAbi
};

// LoanManager.Status
const LOAN_STATUS = ['None', 'Active', 'Auction', 'Repaid', 'Liquidated'];

// VestingAdapter.Protocol
const VESTING_PROTOCOL = {
  SABLIER_V2: 0,
  STREAMFLOW_EVM: 1,
  GENERIC_ERC721: 2
};

const erc20Abi = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
];

const erc20ReadAbi = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

const vestingWalletReadAbi = [
  'function token() view returns (address)',
  'function totalAllocation() view returns (uint256)',
  'function start() view returns (uint256)',
  'function duration() view returns (uint256)',
  'function released(address) view returns (uint256)'
];

module.exports = {
  CORE_ABIS,
  loadCoreAbi,
  loanManagerAbi,
  lendingPoolAbi,
  vestingAdapterAbi,
  valuationEngineAbi,
  vestingRegistryAbi,
  insuranceVaultAbi,
  preTgeOracleAbi,
  LOAN_STATUS,
  VESTING_PROTOCOL,
  erc20Abi,
  erc20ReadAbi,
  vestingWalletReadAbi
};
