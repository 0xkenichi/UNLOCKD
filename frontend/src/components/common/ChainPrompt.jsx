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
      <div className="section-head">
        <div>
          <h3 className="section-title">Network Switch</h3>
          <div className="section-subtitle">
            Supported testnets required for live contract calls.
          </div>
        </div>
        <span className="tag warn">Action required</span>
      </div>
      <div className="data-table">
        <div className="table-row header">
          <div>Network</div>
          <div>Status</div>
          <div>Contracts</div>
          <div>Action</div>
        </div>
        {supportedChains.map((chain) => {
          const isActive = chain.id === chainId;
          const contractsReady = Boolean(getContractAddress(chain.id, 'loanManager'));
          return (
            <div key={chain.id} className="table-row">
              <div>{chain.name}</div>
              <div>
                <span className={`tag ${isActive ? 'success' : ''}`}>
                  {isActive ? 'Connected' : 'Available'}
                </span>
              </div>
              <div>{contractsReady ? 'Deployed' : 'Missing'}</div>
              <div>
                <button
                  className="button ghost"
                  onClick={() => switchChain({ chainId: chain.id })}
                  disabled={isPending}
                >
                  Switch
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="inline-actions">
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
