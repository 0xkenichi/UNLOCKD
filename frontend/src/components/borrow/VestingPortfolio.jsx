// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { motion, AnimatePresence } from 'framer-motion';

export default function VestingPortfolio({ positions = [], selectedId, onSelect, loading = false, onSwitchToSolana }) {
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
                                Connect your Solana wallet to discover Streamflow/Jupiter streams, or ensure your EVM wallet has active Sablier/Vestra positions.
                            </p>
                        </div>
                        <button className="button ghost" onClick={onSwitchToSolana}>Switch to Solana</button>
                    </div>
                </div>
            </div>
        );
    }

    // Group positions by Protocol
    const grouped = positions.reduce((acc, pos) => {
        const protocol = pos.chain === 'solana' ? 'Streamflow' : 'Sablier / Vestra';
        if (!acc[protocol]) acc[protocol] = [];
        acc[protocol].push(pos);
        return acc;
    }, {});

    return (
        <div className="stack" style={{ marginBottom: 24 }}>
            <div className="section-head">
                <div>
                    <h3 className="section-title">Vesting Portfolio</h3>
                    <div className="section-subtitle">Collateral grouped by protocol type.</div>
                </div>
                <span className="tag success">Live Discovery</span>
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
                            <div style={{ width: 20, height: 20, borderRadius: 4, background: protocol === 'Streamflow' ? '#3B82F6' : '#FFD700', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {protocol[0]}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: 14, opacity: 0.9 }}>{protocol}</span>
                            <span className="muted" style={{ fontSize: 12 }}>({items.length})</span>
                        </div>

                        <div className="holo-card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div className="data-table">
                                <div className="table-row header" style={{ gridTemplateColumns: '1fr 120px 140px 100px', padding: '12px 16px' }}>
                                    <div>Name</div>
                                    <div>Balance</div>
                                    <div style={{ textAlign: 'right' }}>Unlock Date</div>
                                    <div style={{ textAlign: 'right' }}>Action</div>
                                </div>
                                <AnimatePresence>
                                    {items.map((item) => {
                                        const uniqueId = `${item.collateralId}:${item.vestingContract}`;
                                        const isSelected = selectedId === uniqueId;
                                        const unlockDate = item.unlockTime
                                            ? new Date(Number(item.unlockTime) * 1000).toLocaleDateString()
                                            : '--';

                                        return (
                                            <motion.div
                                                key={uniqueId}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className={`table-row ${isSelected ? 'selected-row' : ''}`}
                                                style={{
                                                    gridTemplateColumns: '1fr 120px 140px 100px',
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
                                                        💰
                                                    </div>
                                                    <div className="stack" style={{ gap: 2 }}>
                                                        <span style={{ fontWeight: 600 }}>{item.tokenSymbol || 'Token'}</span>
                                                        <span className="muted" style={{ fontSize: 10 }}>ID: {item.collateralId?.slice(0, 8)}...</span>
                                                    </div>
                                                </div>
                                                <div style={{ fontWeight: 500 }}>
                                                    {parseFloat(item.quantity || 0).toLocaleString()}
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span className="tag" style={{ fontSize: 10, background: 'rgba(59, 130, 246, 0.14)', color: 'var(--primary-300)' }}>
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
