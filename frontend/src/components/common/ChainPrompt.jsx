import { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import {
  ALL_EVM_CHAINS,
  DEFAULT_EVM_CHAIN,
  EVM_MAINNET_CHAINS,
  EVM_TESTNET_CHAINS
} from '../../utils/chains.js';
import { getContractAddress } from '../../utils/contracts.js';

const supportedChains = [...EVM_MAINNET_CHAINS, ...EVM_TESTNET_CHAINS];

export default function ChainPrompt() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const [attempted, setAttempted] = useState(false);
  const currentSupported = supportedChains.some((chain) => chain.id === chainId);
  const hasContracts = Boolean(getContractAddress(chainId, 'loanManager'));
  const activeChain = useMemo(
    () => ALL_EVM_CHAINS.find((chain) => chain.id === chainId),
    [chainId]
  );

  useEffect(() => {
    if (!isConnected || attempted || (currentSupported && hasContracts)) {
      return;
    }
    setAttempted(true);
    switchChain({ chainId: DEFAULT_EVM_CHAIN.id });
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
            Select a supported chain with deployed contracts.
          </div>
        </div>
        <span className="tag warn">Action required</span>
      </div>
      {activeChain && !hasContracts && (
        <div className="muted">
          {activeChain.name} is supported, but contracts are not deployed yet.
        </div>
      )}
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
              <div>{contractsReady ? 'Deployed' : 'Coming soon'}</div>
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
