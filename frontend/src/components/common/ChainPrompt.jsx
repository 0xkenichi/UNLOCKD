import { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import {
  ALL_EVM_CHAINS,
  DEFAULT_EVM_CHAIN,
  EVM_MAINNET_CHAINS,
  EVM_TESTNET_CHAINS,
  SOLANA_NETWORKS
} from '../../utils/chains.js';
import { getContractAddress } from '../../utils/contracts.js';
import { useOnchainSession } from '../../utils/onchainSession.js';
import LazySolanaWalletCard from '../solana/LazySolanaWalletCard.jsx';

const supportedChains = [...EVM_MAINNET_CHAINS, ...EVM_TESTNET_CHAINS];

export default function ChainPrompt() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const [attempted, setAttempted] = useState(false);
  const { session, setSession } = useOnchainSession();
  const currentSupported = supportedChains.some((chain) => chain.id === chainId);
  const hasContracts = Boolean(getContractAddress(chainId, 'loanManager'));
  const activeChain = useMemo(
    () => ALL_EVM_CHAINS.find((chain) => chain.id === chainId),
    [chainId]
  );

  useEffect(() => {
    if (
      !isConnected ||
      attempted ||
      session.chainType === 'solana' ||
      (currentSupported && hasContracts)
    ) {
      return;
    }
    setAttempted(true);
    switchChain({ chainId: DEFAULT_EVM_CHAIN.id });
  }, [attempted, currentSupported, hasContracts, isConnected, session.chainType, switchChain]);

  if (currentSupported && hasContracts && session.chainType !== 'solana') {
    return null;
  }

  const availableChains = supportedChains.filter((chain) =>
    Boolean(getContractAddress(chain.id, 'loanManager'))
  );

  return (
    <div className="holo-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Network Switch</h3>
          <div className="section-subtitle">
            Connect to a supported network with deployed contracts.
          </div>
        </div>
      </div>
      {activeChain && (
        <div className="muted">
          Current network: {activeChain.name}
          {hasContracts ? '.' : ' (contracts coming soon).'}
        </div>
      )}
      {availableChains.length > 0 ? (
        <div className="inline-actions">
          {availableChains.map((chain) => (
            <button
              key={chain.id}
              className="button ghost"
              onClick={() => switchChain({ chainId: chain.id })}
              disabled={isPending || chain.id === chainId}
            >
              Switch to {chain.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="muted">No networks with deployed contracts yet.</div>
      )}
      <div className="muted" style={{ marginTop: '12px' }}>
        Or use Solana (read-only matching for now):
      </div>
      <div className="inline-actions">
        {SOLANA_NETWORKS.map((network) => (
          <button
            key={network.id}
            className={`button ghost ${session.chainType === 'solana' ? 'active' : ''}`}
            onClick={() => setSession({ chainType: 'solana', solanaNetworkId: network.id })}
            type="button"
          >
            Switch to {network.name}
          </button>
        ))}
      </div>
      {session.chainType === 'solana' && (
        <>
          <div className="muted" style={{ marginTop: '12px' }}>
            Solana supports vesting discovery and risk scoring; loans settle on Base in this MVP.
          </div>
          <LazySolanaWalletCard />
        </>
      )}
    </div>
  );
}
