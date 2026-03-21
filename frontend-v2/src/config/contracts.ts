import { 
  sepolia, 
  base, 
  arbitrum, 
  avalanche, 
  baseSepolia, 
  avalancheFuji 
} from 'viem/chains';

export { sepolia, base, baseSepolia };

// Contract Addresses (extracted from v1 frontend src/utils/contracts.js)
export const CONTRACTS = {
  [sepolia.id]: {
    valuationEngine: '0xB45f5d411A03d113fd6dDB7ed3F6800138a52760',
    loanManager: '0x3E6ce9289c20EC7822296aaBf8A48A6a2a857B56',
    lendingPool: '0xFA515A43b9D010a398ff6A3253c1c7A9374f8c95', // SAFE_LENDINGPOOL_WALLET
    insuranceFund: '0x3B31Dd931fcd2C5B8fA2d4963515b25ad6014dDf',
    protocolFees: '0x795937E67da6F4F877D0cbD103F535D589636387',
    termVault: '0x7cB24A9eA6bA427Ec9B57752fc9f8A4DB51d2919',
    vestingAdapter: '0xA8743ABc6BCD80633171Af6AF7091Cf240e77910',
    usdc: '0x3dF11e82a5aBe55DE936418Cf89373FDAE1579C8',
    vestToken: '0xA9d67A08595FCADbB9A4cbF8032f13fFC9837A6d',
    demoFaucet: '0x6EE0a9B7972f43100B9c0757D88BF5A8c7F0bF2E',
    zkShield: '0x0000000000000000000000000000000000000000', 
    sovereignASIWallet: '0x5a82034705DAeda18D8D5c52c73525350Dc7Ad1f',
  },
  [baseSepolia.id]: {
    valuationEngine: '0x99F15E90aB6EDe24afa5Da28a1f4E10cd620b351', 
    loanManager: '0xE747FC57F6B3F0EA9aDc1CdECe5DDe56d7C726ce',   
    lendingPool: '0xFA515A43b9D010a398ff6A3253c1c7A9374f8c95',   // SAFE_LENDINGPOOL_WALLET
    insuranceFund: '0x3B31Dd931fcd2C5B8fA2d4963515b25ad6014dDf',
    protocolFees: '0x795937E67da6F4F877D0cbD103F535D589636387',
    termVault: '0x0000000000000000000000000000000000000000',
    vestingAdapter: '0xF366308b18156bAd74B1274EB1fFECCA2a1B7959',
    usdc: '0x032eF137119E92e9a7091d57F0c850a2E30F1deE', 
    vestToken: '0xA9d67A08595FCADbB9A4cbF8032f13fFC9837A6d',
    znShield: '0x0000000000000000000000000000000000000000',
  },
  // ASI Chain DevNet (Rholang)
  [1111]: {
    valuationEngine: 'rho:id:vestra_valuation_engine',
    loanManager: 'rho:id:vestra_loan_manager',
    lendingPool: 'rho:id:vestra_lending_pool',
    usdc: 'rho:id:vestra_usdc_faucet',
    vestingFactory: 'rho:id:vestra_vesting_factory'
  }
} as const;


// Minimal ABIs for data fetching in v2
export const loanManagerAbi = [
  {
    inputs: [],
    name: 'loanCount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'loanId', type: 'uint256' }],
    name: 'loans',
    outputs: [
      { internalType: 'address', name: 'borrower', type: 'address' },
      { internalType: 'uint256', name: 'principal', type: 'uint256' },
      { internalType: 'uint256', name: 'interest', type: 'uint256' },
      { internalType: 'uint256', name: 'collateralId', type: 'uint256' },
      { internalType: 'uint256', name: 'collateralAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'unlockTime', type: 'uint256' },
      { internalType: 'bool', name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'loanId', type: 'uint256' }],
    name: 'isPrivateLoan',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'loanId', type: 'uint256' }],
    name: 'privateLoans',
    outputs: [
      { internalType: 'address', name: 'borrower', type: 'address' },
      { internalType: 'uint256', name: 'principal', type: 'uint256' },
      { internalType: 'uint256', name: 'interest', type: 'uint256' },
      { internalType: 'uint256', name: 'collateralId', type: 'uint256' },
      { internalType: 'uint256', name: 'collateralAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'unlockTime', type: 'uint256' },
      { internalType: 'bool', name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const usdcAbi = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' }
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export const lendingPoolAbi = [
  {
    inputs: [],
    name: 'totalDeposits',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'uint256', name: 'durationDays', type: 'uint256' }
    ],
    name: 'stake',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'stakeId', type: 'uint256' }],
    name: 'unstake',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'stakeId', type: 'uint256' }],
    name: 'claimYield',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'user', type: 'address' },
      { internalType: 'uint256', name: 'stakeId', type: 'uint256' }
    ],
    name: 'calculateYield',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '', type: 'address' },
      { internalType: 'uint256', name: '', type: 'uint256' }
    ],
    name: 'userStakes',
    outputs: [
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'uint256', name: 'durationDays', type: 'uint256' },
      { internalType: 'uint256', name: 'lockEndTime', type: 'uint256' },
      { internalType: 'uint256', name: 'apyBps', type: 'uint256' },
      { internalType: 'uint256', name: 'lastClaimTime', type: 'uint256' },
      { internalType: 'bool', name: 'isActive', type: 'bool' },
      { internalType: 'bool', name: 'flowEligible', type: 'bool' },
      { internalType: 'uint256', name: 'withdrawnFlow', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'uint256', name: 'targetAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'maxCap', type: 'uint256' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      { internalType: 'bool', name: 'rewardsByBuildingSize', type: 'bool' }
    ],
    name: 'createCommunityPool',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'poolId', type: 'uint256' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'uint256', name: 'buildingUnits', type: 'uint256' }
    ],
    name: 'contributeToCommunityPool',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'poolId', type: 'uint256' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' }
    ],
    name: 'fundCommunityPoolRewards',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'poolId', type: 'uint256' }],
    name: 'claimCommunityPoolRewards',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'poolId', type: 'uint256' }],
    name: 'claimCommunityPoolRefund',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'poolId', type: 'uint256' }],
    name: 'closeCommunityPool',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  }
] as const;

export const demoFaucetAbi = [
  {
    inputs: [
      { internalType: 'uint256', name: 'allocation', type: 'uint256' },
      { internalType: 'uint256', name: 'durationMonths', type: 'uint256' },
      { internalType: 'uint256', name: 'cliffMonths', type: 'uint256' }
    ],
    name: 'mintDemoPosition',
    outputs: [{ internalType: 'address', name: 'vestingWallet', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'uint256', name: 'durationMonths', type: 'uint256' }
    ],
    name: 'lockUSDCAndMint',
    outputs: [{ internalType: 'address', name: 'vestingWallet', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// Helper to get contract info
export function getContract(chainId: number, name: keyof (typeof CONTRACTS)[typeof sepolia.id]) {
  const chainContracts = CONTRACTS[chainId as keyof typeof CONTRACTS];
  if (!chainContracts) return CONTRACTS[sepolia.id][name]; // Fallback to Sepolia
  return (chainContracts as any)[name];
}
