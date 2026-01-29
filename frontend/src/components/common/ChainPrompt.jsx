import { useEffect, useState } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { sepolia, baseSepolia } from 'viem/chains';
import { getContractAddress } from '../../utils/contracts.js';

const supportedChains = [sepolia, baseSepolia];

export default function ChainPrompt() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const [attempted, setAttempted] = useState(false);
  const currentSupported = supportedChains.some((chain) => chain.id === chainId);
  const hasContracts = Boolean(getContractAddress(chainId, 'loanManager'));

  useEffect(() => {
    if (!isConnected || attempted || (currentSupported && hasContracts)) {
      return;
    }
    setAttempted(true);
    switchChain({ chainId: sepolia.id });
  }, [attempted, currentSupported, hasContracts, isConnected, switchChain]);

  if (currentSupported && hasContracts) {
    return null;
  }

  return (
    <div className="holo-card">
      <h3 className="holo-title">Network Switch</h3>
      <div className="muted">
        Switch to a supported testnet for live contract interactions.
      </div>
      <div className="faucet-quick">
        {supportedChains.map((chain) => (
          <button
            key={chain.id}
            className="button"
            onClick={() => switchChain({ chainId: chain.id })}
            disabled={isPending}
          >
            Switch to {chain.name}
          </button>
        ))}
      </div>
    </div>
  );
}
