import { sepolia as viemSepolia } from 'viem/chains';
import { LOAN_MANAGER_ABI } from '@/abis/LoanManager';
import { LENDING_POOL_ABI } from '@/abis/LendingPool';

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

// Legacy demo faucet (packages/contracts/legacy/src/mocks/DemoFaucet.sol) — testnet demo only,
// not part of the Vestra v1 core.
export const demoFaucetAbi = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "allocation", "type": "uint256" },
      { "internalType": "uint256", "name": "durationMonths", "type": "uint256" },
      { "internalType": "uint256", "name": "cliffMonths", "type": "uint256" }
    ],
    "name": "mintDemoPosition",
    "outputs": [{ "internalType": "address", "name": "vestingWallet", "type": "address" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "uint256", "name": "durationMonths", "type": "uint256" }
    ],
    "name": "lockUSDCAndMint",
    "outputs": [{ "internalType": "address", "name": "vestingWallet", "type": "address" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const loanManagerAbi = LOAN_MANAGER_ABI;
export const lendingPoolAbi = LENDING_POOL_ABI;
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

type Address = `0x${string}`;

// Vestra v1 core addresses, set per deployment with NEXT_PUBLIC_<CONTRACT>_SEPOLIA
// (same naming as NEXT_PUBLIC_LOAN_MANAGER_SEPOLIA) after running
// packages/contracts/script/DeployCore.s.sol. The previous Sepolia deployment is not
// ABI-compatible with v1, so core contracts have no hardcoded fallback.
const NOT_DEPLOYED = '0x0000000000000000000000000000000000000000';
export const CONTRACTS = {
  11155111: {
    usdc:            (process.env.NEXT_PUBLIC_USDC_SEPOLIA             || '0x1c7D4B196Cb0232b30444390089CcEF33C06573D') as Address, // Real Circle USDC on Sepolia
    lendingPool:     (process.env.NEXT_PUBLIC_LENDING_POOL_SEPOLIA     || NOT_DEPLOYED) as Address,
    loanManager:     (process.env.NEXT_PUBLIC_LOAN_MANAGER_SEPOLIA     || NOT_DEPLOYED) as Address,
    valuationEngine: (process.env.NEXT_PUBLIC_VALUATION_ENGINE_SEPOLIA || NOT_DEPLOYED) as Address,
    vestingAdapter:  (process.env.NEXT_PUBLIC_VESTING_ADAPTER_SEPOLIA  || NOT_DEPLOYED) as Address,
    insuranceVault:  (process.env.NEXT_PUBLIC_INSURANCE_VAULT_SEPOLIA  || NOT_DEPLOYED) as Address,
    vestToken:       '0x6a7abfa27ec2654c3103df2e6d22c36423af8b2d' as Address,
    vestingWallet:   '0xAF5976bC206b784B3c43896Ed799c084A140583a' as Address,
    sablierV2Lockup: (process.env.NEXT_PUBLIC_SABLIER_V2_LOCKUP_SEPOLIA || '0x70bc777800bac10145c2b1a1339ce93c07f8b824') as Address, // Official Sablier V2 Lockup Linear
  }
} as const;
