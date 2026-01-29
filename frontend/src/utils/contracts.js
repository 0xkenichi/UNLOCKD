import { sepolia, baseSepolia } from 'viem/chains';

export const CONTRACTS = {
  [sepolia.id]: {
    valuationEngine: '0x99F15E90aB6EDe24afa5Da28a1f4E10cd620b351',
    loanManager: '0xb961Bc8AAeCC1B32C4ec2341F99cD802b95862f2',
    vestingAdapter: '0x96966cA06C6AD57aa45A8D25a322849ec975B282',
    usdc: '0x0A204F3f3e65F7a0ec6Db731DfF28012c5a61Ee6',
    mockPriceFeed: '0xd77FC2abbAa127eFd00E6b775C437a54f0756762'
  },
  [baseSepolia.id]: {
    valuationEngine: '',
    loanManager: '',
    vestingAdapter: '',
    usdc: '',
    mockPriceFeed: ''
  }
};

export const valuationEngineAbi = [
  {
    name: 'computeDPV',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'quantity', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'unlockTime', type: 'uint256' }
    ],
    outputs: [
      { name: 'pv', type: 'uint256' },
      { name: 'ltvBps', type: 'uint256' }
    ]
  }
];

export const loanManagerAbi = [
  {
    name: 'loanCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'createLoan',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'collateralId', type: 'uint256' },
      { name: 'vestingContract', type: 'address' },
      { name: 'borrowAmount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'repayLoan',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'loanId', type: 'uint256' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'loans',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [
      { name: 'borrower', type: 'address' },
      { name: 'principal', type: 'uint256' },
      { name: 'interest', type: 'uint256' },
      { name: 'collateralId', type: 'uint256' },
      { name: 'unlockTime', type: 'uint256' },
      { name: 'active', type: 'bool' }
    ]
  }
];

export const vestingAdapterAbi = [
  {
    name: 'escrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'collateralId', type: 'uint256' },
      { name: 'vestingContract', type: 'address' },
      { name: 'borrower', type: 'address' }
    ],
    outputs: []
  },
  {
    name: 'getDetails',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'collateralId', type: 'uint256' }],
    outputs: [
      { name: 'quantity', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'unlockTime', type: 'uint256' }
    ]
  }
];

export const usdcAbi = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }]
  }
];

export const erc20Abi = [
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }]
  }
];

export const mockPriceFeedAbi = [
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }]
  },
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'uint80' },
      { name: '', type: 'int256' },
      { name: '', type: 'uint256' },
      { name: '', type: 'uint256' },
      { name: '', type: 'uint80' }
    ]
  }
];

export function getContractAddress(chainId, name) {
  const envKey = `VITE_${name.toUpperCase()}_ADDRESS`;
  const envValue = import.meta.env?.[envKey];
  return CONTRACTS[chainId]?.[name] || envValue || '';
}
