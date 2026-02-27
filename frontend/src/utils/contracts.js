import {
  arbitrum,
  avalanche,
  avalancheFuji,
  base,
  baseSepolia,
  sepolia
} from 'viem/chains';
import { flowEvm, flowEvmTestnet } from './chains.js';

// Localhost (chainId 31337) - matches deployments/localhost from hardhat node
const LOCALHOST_CHAIN_ID = 31337;
const LOCALHOST_CONTRACTS = {
  valuationEngine: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
  loanManager: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
  lendingPool: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
  termVault: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
  vestingAdapter: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
  usdc: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  testnetPriceFeed: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
};

export const CONTRACTS = {
  [LOCALHOST_CHAIN_ID]: LOCALHOST_CONTRACTS,
  [sepolia.id]: {
    valuationEngine: '0x99F15E90aB6EDe24afa5Da28a1f4E10cd620b351',
    loanManager: '0xE747FC57F6B3F0EA9aDc1CdECe5DDe56d7C726ce',
    lendingPool: '0x8eD7Cc3cE764B7BA57d8DeD29A13F1fD2Fd02a2A',
    termVault: '',
    vestingAdapter: '0xF366308b18156bAd74B1274EB1fFECCA2a1B7959',
    usdc: '0xc9c9083f4794165E9baA920fc9FcBc462864d992',
    testnetPriceFeed: '0xd77FC2abbAa127eFd00E6b775C437a54f0756762',
    vestToken: '0xA9d67A08595FCADbB9A4cbF8032f13fFC9837A6d',
    sampleVestingWallet: ''
  },
  [flowEvmTestnet.id]: {
    valuationEngine: '',
    loanManager: '',
    lendingPool: '',
    termVault: '',
    vestingAdapter: '',
    usdc: '',
    testnetPriceFeed: '',
    vestToken: '',
    sampleVestingWallet: ''
  },
  [flowEvm.id]: {
    valuationEngine: '',
    loanManager: '',
    lendingPool: '',
    termVault: '',
    vestingAdapter: '',
    usdc: '',
    testnetPriceFeed: '',
    vestToken: '',
    sampleVestingWallet: ''
  },
  [baseSepolia.id]: {
    valuationEngine: '',
    loanManager: '',
    lendingPool: '',
    termVault: '',
    vestingAdapter: '',
    usdc: '',
    testnetPriceFeed: '',
    vestToken: '',
    sampleVestingWallet: ''
  },
  [base.id]: {
    valuationEngine: '',
    loanManager: '',
    lendingPool: '',
    termVault: '',
    vestingAdapter: '',
    usdc: '',
    testnetPriceFeed: '',
    vestToken: '',
    sampleVestingWallet: ''
  },
  [arbitrum.id]: {
    valuationEngine: '',
    loanManager: '',
    lendingPool: '',
    termVault: '',
    vestingAdapter: '',
    usdc: '',
    testnetPriceFeed: '',
    vestToken: '',
    sampleVestingWallet: ''
  },
  [avalanche.id]: {
    valuationEngine: '',
    loanManager: '',
    lendingPool: '',
    termVault: '',
    vestingAdapter: '',
    usdc: '',
    testnetPriceFeed: '',
    vestToken: '',
    sampleVestingWallet: ''
  },
  [avalancheFuji.id]: {
    valuationEngine: '',
    loanManager: '',
    lendingPool: '',
    termVault: '',
    vestingAdapter: '',
    usdc: '',
    testnetPriceFeed: '',
    vestToken: '',
    sampleVestingWallet: ''
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
    name: 'LoanCreated',
    type: 'event',
    inputs: [
      { name: 'loanId', type: 'uint256', indexed: true },
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'PrivateLoanCreated',
    type: 'event',
    inputs: [
      { name: 'loanId', type: 'uint256', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'LoanRepaid',
    type: 'event',
    inputs: [
      { name: 'loanId', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'PrivateLoanRepaid',
    type: 'event',
    inputs: [
      { name: 'loanId', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'LoanRepaidWithSwap',
    type: 'event',
    inputs: [
      { name: 'loanId', type: 'uint256', indexed: true },
      { name: 'tokenIn', type: 'address', indexed: true },
      { name: 'amountIn', type: 'uint256', indexed: false },
      { name: 'usdcReceived', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'LoanSettled',
    type: 'event',
    inputs: [
      { name: 'loanId', type: 'uint256', indexed: true },
      { name: 'defaulted', type: 'bool', indexed: false }
    ]
  },
  {
    name: 'PrivateLoanSettled',
    type: 'event',
    inputs: [
      { name: 'loanId', type: 'uint256', indexed: true },
      { name: 'defaulted', type: 'bool', indexed: false }
    ]
  },
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
    name: 'createLoanWithCollateralAmount',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'collateralId', type: 'uint256' },
      { name: 'vestingContract', type: 'address' },
      { name: 'borrowAmount', type: 'uint256' },
      { name: 'collateralAmount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'createPrivateLoan',
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
    name: 'createPrivateLoanWithCollateralAmount',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'collateralId', type: 'uint256' },
      { name: 'vestingContract', type: 'address' },
      { name: 'borrowAmount', type: 'uint256' },
      { name: 'collateralAmount', type: 'uint256' }
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
    name: 'repayPrivateLoan',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'loanId', type: 'uint256' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'repayWithSwap',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'loanId', type: 'uint256' },
      { name: 'tokenIn', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minUsdcOut', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'repayWithSwapBatch',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'loanId', type: 'uint256' },
      { name: 'tokens', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'minUsdcOut', type: 'uint256[]' }
    ],
    outputs: []
  },
  {
    name: 'setAutoRepayOptIn',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'enabled', type: 'bool' }],
    outputs: []
  },
  {
    name: 'settlePrivateAtUnlock',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: []
  },
  {
    name: 'isPrivateLoan',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'autoRepayOptIn',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'getAutoRepayRequiredTokens',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }]
  },
  {
    name: 'hasAutoRepayPermissions',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'borrower', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'autoRepayLtvBoostBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'autoRepayInterestDiscountBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'originationFeeBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'setRepayTokenPriority',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokens', type: 'address[]' }],
    outputs: []
  },
  {
    name: 'getRepayTokenPriority',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }]
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
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'unlockTime', type: 'uint256' },
      { name: 'active', type: 'bool' }
    ]
  },
  {
    // Private-mode loan struct (vault is onchain actor; no borrower stored).
    name: 'privateLoans',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'loanId', type: 'uint256' }],
    outputs: [
      { name: 'vault', type: 'address' },
      { name: 'principal', type: 'uint256' },
      { name: 'interest', type: 'uint256' },
      { name: 'collateralId', type: 'uint256' },
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'unlockTime', type: 'uint256' },
      { name: 'active', type: 'bool' }
    ]
  }
];

/** ABI for reading vesting wallet state (IVestingWalletToken compatible) */
export const vestingWalletAbi = [
  { name: 'token', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'totalAllocation', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'start', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'duration', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'released', type: 'function', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }
];

/** ABI for reading Sablier v2 Lockup stream state (for import flow) */
export const sablierV2LockupAbi = [
  { name: 'getRecipient', type: 'function', stateMutability: 'view', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
  { name: 'getAsset', type: 'function', stateMutability: 'view', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
  { name: 'getStartTime', type: 'function', stateMutability: 'view', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ name: '', type: 'uint40' }] },
  { name: 'getEndTime', type: 'function', stateMutability: 'view', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ name: '', type: 'uint40' }] },
  { name: 'getDepositedAmount', type: 'function', stateMutability: 'view', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ name: '', type: 'uint128' }] },
  { name: 'getWithdrawnAmount', type: 'function', stateMutability: 'view', inputs: [{ name: 'streamId', type: 'uint256' }], outputs: [{ name: '', type: 'uint128' }] },
  // Approval gate for wrapper/operator patterns (interface matches repo mocks).
  { name: 'setApproved', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'streamId', type: 'uint256' }, { name: 'operator', type: 'address' }, { name: 'isApproved', type: 'bool' }], outputs: [] }
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

export const lendingPoolAbi = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: []
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: []
  },
  {
    name: 'deposits',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'totalDeposits',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'totalBorrowed',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'utilizationRateBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'availableLiquidity',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'getInterestRateBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'communityPoolCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'createCommunityPool',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'targetAmount', type: 'uint256' },
      { name: 'maxAmount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'rewardsByBuildingSize', type: 'bool' }
    ],
    outputs: [{ name: 'poolId', type: 'uint256' }]
  },
  {
    name: 'contributeToCommunityPool',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'poolId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'buildingUnits', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'fundCommunityPoolRewards',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'poolId', type: 'uint256' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'claimCommunityPoolRewards',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'poolId', type: 'uint256' }],
    outputs: []
  },
  {
    name: 'claimCommunityPoolRefund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'poolId', type: 'uint256' }],
    outputs: []
  },
  {
    name: 'closeCommunityPool',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'poolId', type: 'uint256' }],
    outputs: []
  },
  {
    name: 'pendingCommunityPoolRewards',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'poolId', type: 'uint256' },
      { name: 'user', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'communityPools',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'name', type: 'string' },
      { name: 'creator', type: 'address' },
      { name: 'targetAmount', type: 'uint256' },
      { name: 'maxAmount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'totalContributed', type: 'uint256' },
      { name: 'totalBuildingUnits', type: 'uint256' },
      { name: 'participantCount', type: 'uint256' },
      { name: 'accRewardPerWeight', type: 'uint256' },
      { name: 'totalRewardFunded', type: 'uint256' },
      { name: 'rewardsByBuildingSize', type: 'bool' },
      { name: 'state', type: 'uint8' }
    ]
  }
];

export const termVaultAbi = [
  { name: 'depositTerm', type: 'function', stateMutability: 'nonpayable', inputs: [
    { name: 'trancheId', type: 'uint32' },
    { name: 'amount', type: 'uint256' }
  ], outputs: [{ name: 'positionId', type: 'uint256' }] },
  { name: 'claimInterest', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'positionId', type: 'uint256' }], outputs: [] },
  { name: 'withdrawAtMaturity', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'positionId', type: 'uint256' }], outputs: [] },
  { name: 'earlyWithdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'positionId', type: 'uint256' }], outputs: [] },
  { name: 'availableRewardBudget', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'tranches', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'uint32' }], outputs: [
    { name: 'termSeconds', type: 'uint64' },
    { name: 'minApyBps', type: 'uint32' },
    { name: 'enabled', type: 'bool' }
  ] },
  { name: 'positions', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }], outputs: [
    { name: 'owner', type: 'address' },
    { name: 'trancheId', type: 'uint32' },
    { name: 'startTime', type: 'uint64' },
    { name: 'endTime', type: 'uint64' },
    { name: 'principal', type: 'uint256' },
    { name: 'guaranteedInterest', type: 'uint256' },
    { name: 'interestClaimed', type: 'uint256' },
    { name: 'closed', type: 'bool' }
  ] },
  { name: 'claimableInterest', type: 'function', stateMutability: 'view', inputs: [{ name: 'positionId', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] }
];

export const erc20Abi = [
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }]
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }]
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }]
  }
];

export const testnetPriceFeedAbi = [
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
  const envKeyChain = `VITE_${name.toUpperCase()}_ADDRESS_${chainId}`;
  const envKey = `VITE_${name.toUpperCase()}_ADDRESS`;
  const envValueChain = import.meta.env?.[envKeyChain];
  const envValue = import.meta.env?.[envKey];
  return envValueChain || envValue || CONTRACTS[chainId]?.[name] || '';
}
