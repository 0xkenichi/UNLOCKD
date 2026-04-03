import { useChainId } from 'wagmi';
import { CONTRACTS } from '@/config/contracts';

export function useContracts() {
  const chainId = useChainId();
  const contracts = CONTRACTS[chainId as keyof typeof CONTRACTS];
  if (!contracts) return CONTRACTS[11155111]; // Fallback to Sepolia
  return contracts;
}
