// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { motion, AnimatePresence } from 'framer-motion';

export default function VestingPortfolio({ positions = [], selectedId, onSelect, loading = false, onSwitchToSolana, isSolanaConnected = false }) {
    if (loading && positions.length === 0) {
        return (
            <div className="holo-card" style={{ padding: '24px', textAlign: 'center' }}>
                <div className="loading-row"><div className="spinner" /></div>
                <p className="muted" style={{ marginTop: 12 }}>Scanning multi-chain vesting protocols...</p>
            </div>
        );
    }

    if (positions.length === 0 && !loading) {
        return (
            <div className="stack" style={{ marginBottom: 24 }}>
                <div className="section-head">
                    <div>
                        <h3 className="section-title">Collateral Discovery</h3>
                        <div className="section-subtitle">Real-time scan for vesting and lockup streams.</div>
                    </div>
                </div>
                <div className="holo-card" style={{
                    padding: '40px 24px',
                    textAlign: 'center',
                    border: '1px solid var(--border-primary)',
                    background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.05) 0%, rgba(0, 0, 0, 0) 100%)',
                    borderRadius: '16px'
                }}>
                    <div className="stack" style={{ gap: 16, alignItems: 'center' }}>
                        <div style={{ fontSize: '32px' }}>🔍</div>
                        <div>
                            <h4 style={{ fontSize: '18px', fontWeight: 600, marginBottom: 8 }}>No Assets Detected</h4>
                            <p className="muted" style={{ maxWidth: '460px', margin: '0 auto', fontSize: '13px' }}>
                                {isSolanaConnected
                                    ? 'No vesting streams found on your connected EVM or Solana wallets.'
                                    : 'Connect your Solana wallet to discover Streamflow/Jupiter streams, or ensure your EVM wallet has active Sablier/Vestra positions.'}
                            </p>
                        </div>
                        {!isSolanaConnected && (
                            <button className="button ghost" onClick={onSwitchToSolana}>Connect Solana Wallet</button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Group positions by Protocol
    const grouped = positions.reduce((acc, pos) => {
        let protocol = 'Other';
        if (pos.chain === 'solana') protocol = 'Streamflow';
        else if (pos.protocol === 'Sablier Lockup') protocol = 'Sablier (Vesting)';
        else if (pos.protocol === 'Sablier Flow') protocol = 'Sablier (Flow)';
        else if (pos.protocol === 'Sablier') protocol = 'Sablier';
        else protocol = pos.protocol || 'Vestra / Other';

        if (!acc[protocol]) acc[protocol] = [];
        acc[protocol].push(pos);
        return acc;
    }, {});

    return (
        <div className="stack" style={{ marginBottom: 24 }}>
            <div className="section-head">
                <div>
                    <h3 className="section-title">Vesting Portfolio</h3>
                    <div className="section-subtitle">Collateral grouped by protocol and stream type.</div>
                </div>
                <span className="tag success">Multi-Chain Scan</span>
            </div>

            <div className="stack" style={{ gap: 20 }}>
                {Object.entries(grouped).map(([protocol, items]) => (
                    <div key={protocol} className="protocol-group">
                        <div className="protocol-header" style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 12,
                            padding: '0 8px'
                        }}>
                            <div style={{ 
                                width: 20, 
                                height: 20, 
                                borderRadius: 4, 
                                background: protocol.includes('Sablier') ? '#6B21A8' : '#3B82F6', 
                                fontSize: 10, 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                color: 'white'
                            }}>
                                {protocol[0]}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: 14, opacity: 0.9 }}>{protocol}</span>
                            <span className="muted" style={{ fontSize: 12 }}>({items.length})</span>
                        </div>

                        <div className="holo-card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div className="data-table">
                                <div className="table-row header" style={{ gridTemplateColumns: '1.2fr 1fr 1fr 100px', padding: '12px 16px' }}>
                                    <div>Asset & Chain</div>
                                    <div>Available / Rate</div>
                                    <div style={{ textAlign: 'right' }}>Unlock / Status</div>
                                    <div style={{ textAlign: 'right' }}>Action</div>
                                </div>
                                <AnimatePresence>
                                    {items.map((item) => {
                                        const uniqueId = item.loanId || `${item.collateralId}:${item.vestingContract}`;
                                        const isSelected = selectedId === uniqueId;
                                        const isFlow = item.protocol === 'Sablier Flow';
                                        
                                        const unlockDate = item.unlockTime && item.unlockTime > 0
                                            ? new Date(Number(item.unlockTime) * 1000).toLocaleDateString()
                                            : isFlow ? 'Continuous' : '--';

                                        const chainName = item.chainId === 11155111 ? 'Sepolia' : 
                                                         item.chainId === 8453 ? 'Base' :
                                                         item.chainId === 10 ? 'Optimism' : 
                                                         item.chain === 'solana' ? 'Solana' : 'EVM';

                                        return (
                                            <motion.div
                                                key={uniqueId}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className={`table-row ${isSelected ? 'selected-row' : ''}`}
                                                style={{
                                                    gridTemplateColumns: '1.2fr 1fr 1fr 100px',
                                                    padding: '14px 16px',
                                                    cursor: 'pointer',
                                                    background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                                                    borderLeft: isSelected ? '3px solid var(--primary-400)' : '3px solid transparent'
                                                }}
                                                onClick={() => onSelect(uniqueId)}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{
                                                        width: 28,
                                                        height: 28,
                                                        borderRadius: '50%',
                                                        background: 'var(--bg-card)',
                                                        border: '1px solid var(--border-primary)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 14
                                                    }}>
                                                        {isFlow ? '🌊' : '⏳'}
                                                    </div>
                                                    <div className="stack" style={{ gap: 2 }}>
                                                        <span style={{ fontWeight: 600 }}>{item.tokenSymbol || 'Token'}</span>
                                                        <span className="muted" style={{ fontSize: 9 }}>
                                                            {chainName} • ID: {item.collateralId?.slice(0, 6)}...
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="stack" style={{ gap: 2 }}>
                                                    <div style={{ fontWeight: 500 }}>
                                                        {parseFloat(item.quantity || 0).toLocaleString()}
                                                    </div>
                                                    {isFlow && item.ratePerSecond && (
                                                        <span className="muted" style={{ fontSize: 9 }}>
                                                            {item.ratePerSecond} / sec
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span className="tag" style={{ 
                                                        fontSize: 10, 
                                                        background: isFlow ? 'rgba(16, 185, 129, 0.14)' : 'rgba(59, 130, 246, 0.14)', 
                                                        color: isFlow ? '#10B981' : 'var(--primary-300)' 
                                                    }}>
                                                        {unlockDate}
                                                    </span>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <button className={`button ${isSelected ? '' : 'ghost'}`} style={{ padding: '4px 12px', fontSize: 11 }}>
                                                        {isSelected ? 'Selected' : 'Select'}
                                                    </button>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
