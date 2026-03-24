import { sepolia as viemSepolia } from 'viem/chains';
import { LOAN_MANAGER_ABI } from '@/abis/LoanManager';

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
  },
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  }
] as const;

export const demoFaucetAbi = [
  {
    "inputs": [
      { "internalType": "address", "name": "registry_", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "borrower", "type": "address" },
      { "indexed": false, "internalType": "address", "name": "vestingContract", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "collateralId", "type": "uint256" }
    ],
    "name": "DemoPositionMinted",
    "type": "event"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "allocation", "type": "uint256" },
      { "internalType": "uint64", "name": "durationMonths", "type": "uint64" }
    ],
    "name": "mintDemoPosition",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const loanManagerAbi = LOAN_MANAGER_ABI;
export const sepolia = viemSepolia;

export function getContract(chainId: number, name: string): `0x${string}` {
  const chainContracts = CONTRACTS[chainId as keyof typeof CONTRACTS];
  if (!chainContracts) {
    // Fallback to Sepolia
    const sepoliaContracts = CONTRACTS[11155111];
    return (sepoliaContracts[name as keyof typeof sepoliaContracts] || '0x0000000000000000000000000000000000000000') as `0x${string}`;
  }
  return (chainContracts[name as keyof typeof chainContracts] || '0x0000000000000000000000000000000000000000') as `0x${string}`;
}

export const CONTRACTS = {
  11155111: {
    usdc:            '0xc74e9a55285cd4a02a2601caddcf1f09e22ec537',
    lendingPool:     '0x56c75bea4d17e6ed772ce1c668462e6c4878cdd3',
    loanManager:     '0xfaa8fb747885904f3b622f2986ce7568363e3646',
    valuationEngine: '0xa84B9C4912C33645CB2192BDB321430d2C437Ae3',
    vestingAdapter:  '0xA8743ABc6BCD80633171Af6AF7091Cf240e77910',
    vestToken:       '0xA9d67A08595FCADbB9A4cbF8032f13fFC9837A6d',
    vestingWallet:   '0xAF5976bC206b784B3c43896Ed799c084A140583a',
    insuranceVault:  '0xf344c85C08cA62442380f59f7D3187655e6C4F9a',
    auctionFactory:  '0x10269d602DFCC9180927F54dE32657a572c0F432',
    demoFaucet:      '0x6EE0a9B7972f43100B9c0757D88BF5A8c7F0bF2E',
  }
} as const;
