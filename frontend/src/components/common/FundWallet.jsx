import { useEffect, useMemo, useRef } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { EVM_MAINNET_CHAINS, getEvmChainById } from '../../utils/chains.js';
import { useFundingStatus } from '../../utils/useFundingStatus.js';
import OnrampEmbed from './OnrampEmbed.jsx';
import BridgeCard from './BridgeCard.jsx';

export default function FundWallet({ mode = 'borrow', onStatusChange }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const funding = useFundingStatus({ mode });
  const activeChain = getEvmChainById(chainId);
  const chainLabel = activeChain?.name || EVM_MAINNET_CHAINS[0]?.name;

  const statusLabel = useMemo(() => {
    if (funding.ready) return 'Ready';
    if (!address) return 'Connect';
    if (mode === 'repay' && !funding.hasUsdc) return 'Needs USDC';
    return 'Needs Gas';
  }, [address, funding, mode]);

  const emittedStatusRef = useRef('');

  const stableFundingStatus = useMemo(
    () => ({
      ready: Boolean(funding.ready),
      hasGas: Boolean(funding.hasGas),
      hasUsdc: Boolean(funding.hasUsdc),
      reason: funding.reason || '',
      usdcBalance:
        Number.isFinite(Number(funding.usdcBalance)) ? Number(funding.usdcBalance) : 0
    }),
    [funding.ready, funding.hasGas, funding.hasUsdc, funding.reason, funding.usdcBalance]
  );

  useEffect(() => {
    if (!onStatusChange) return;
    const signature = JSON.stringify(stableFundingStatus);
    if (emittedStatusRef.current === signature) return;
    emittedStatusRef.current = signature;
    onStatusChange(stableFundingStatus);
  }, [onStatusChange, stableFundingStatus]);

  return (
    <div className="stack">
      <div className="holo-card" data-guide-id="fund-wallet-status">
        <div className="section-head">
          <div>
            <h3 className="section-title">Fund Wallet</h3>
            <div className="section-subtitle">
              Make sure you have gas and USDC on {chainLabel}.
            </div>
          </div>
          <span className={`tag ${funding.ready ? 'success' : 'warn'}`}>
            {statusLabel}
          </span>
        </div>
        <div className="data-table">
          <div className="table-row header">
            <div>Asset</div>
            <div>Status</div>
            <div>Notes</div>
          </div>
          <div className="table-row">
            <div>Gas</div>
            <div>{funding.hasGas ? 'Ready' : 'Low'}</div>
            <div>Keep 0.0005+ for fees.</div>
          </div>
          <div className="table-row">
            <div>USDC</div>
            <div>{funding.hasUsdc ? 'Ready' : 'Missing'}</div>
            <div>{mode === 'repay' ? 'Required to repay.' : 'Optional.'}</div>
          </div>
        </div>
        {!funding.ready && funding.reason && <div className="muted">{funding.reason}</div>}
      </div>
      <div className="grid-2">
        <OnrampEmbed address={address} chainLabel={chainLabel} />
        <BridgeCard chainLabel={chainLabel} />
      </div>
    </div>
  );
}
