import { 
  sepolia, 
  base, 
  arbitrum, 
  avalanche, 
  baseSepolia, 
  avalancheFuji 
} from 'viem/chains';

// Contract Addresses (extracted from v1 frontend src/utils/contracts.js)
export const CONTRACTS = {
  [sepolia.id]: {
    valuationEngine: '0xB45f5d411A03d113fd6dDB7ed3F6800138a52760',
    loanManager: '0x3E6ce9289c20EC7822296aaBf8A48A6a2a857B56',
    lendingPool: '0x0914E18f160700d9ee70d0584F5E869e4CA2b6b6',
    termVault: '0x7cB24A9eA6bA427Ec9B57752fc9f8A4DB51d2919',
    vestingAdapter: '0xA8743ABc6BCD80633171Af6AF7091Cf240e77910',
    usdc: '0x3dF11e82a5aBe55DE936418Cf89373FDAE1579C8',
    vestToken: '0xA9d67A08595FCADbB9A4cbF8032f13fFC9837A6d',
    demoFaucet: '0x6EE0a9B7972f43100B9c0757D88BF5A8c7F0bF2E',
    zkShield: '0x0000000000000000000000000000000000000000', // To be deployed
  },
  [baseSepolia.id]: {
    valuationEngine: '0x0000000000000000000000000000000000000000', // Deployments needed
    loanManager: '0x0000000000000000000000000000000000000000',
    lendingPool: '0x0000000000000000000000000000000000000000',
    termVault: '0x0000000000000000000000000000000000000000',
    vestingAdapter: '0x0000000000000000000000000000000000000000',
    usdc: '0x032ef137119E92e9A7091D57F0C850A2e30f1dEE', // Native USDC on Base Sepolia
    vestToken: '0x0000000000000000000000000000000000000000',
    zkShield: '0x0000000000000000000000000000000000000000',
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
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' }
    ],
    name: 'mint',
    outputs: [],
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
      { internalType: 'uint256', name: 'apyBps', type: 'uint256' },
      { internalType: 'uint256', name: 'startTime', type: 'uint256' },
      { internalType: 'uint256', name: 'lockEndTime', type: 'uint256' },
      { internalType: 'uint256', name: 'lastClaimTime', type: 'uint256' },
      { internalType: 'uint256', name: 'durationDays', type: 'uint256' },
      { internalType: 'bool', name: 'isActive', type: 'bool' }
    ],
    stateMutability: 'view',
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
] as const;

// Helper to get contract info
export function getContract(chainId: number, name: keyof (typeof CONTRACTS)[typeof sepolia.id]) {
  const chainContracts = CONTRACTS[chainId as keyof typeof CONTRACTS];
  if (!chainContracts) return CONTRACTS[sepolia.id][name]; // Fallback to Sepolia
  return (chainContracts as any)[name];
}
