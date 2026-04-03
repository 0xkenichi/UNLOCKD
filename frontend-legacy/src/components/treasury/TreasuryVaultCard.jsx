// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { Shield, TrendingUp, Zap, Clock } from 'lucide-react';

function fmtUsd(rawBigInt) {
    const value = Number(rawBigInt ?? 0n) / 1e6;
    if (value === 0) return '$0.00';
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TreasuryVaultCard({ vault }) {
    const { name, type, aumRaw, utilizPct, apy, status } = vault;

    const IconMap = { Lending: Zap, Term: Clock, Insurance: Shield };
    const Icon = IconMap[type] || TrendingUp;

    const utilizDisplay = `${(Number(utilizPct ?? 0)).toFixed(1)}%`;
    const utilizWidth = `${Math.min(100, Number(utilizPct ?? 0))}%`;

    return (
        <motion.div
            className="holo-card"
            whileHover={{ y: -3, boxShadow: '0 12px 30px rgba(59, 130, 246, 0.2)' }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
            {/* Header */}
            <div className="section-head" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        padding: 8,
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(59,130,246,0.12)',
                        border: '1px solid rgba(59,130,246,0.25)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Icon size={18} style={{ color: 'var(--primary-400)' }} />
                    </div>
                    <div>
                        <div className="section-title" style={{ fontSize: 15 }}>{name}</div>
                        <div className="section-subtitle" style={{ fontSize: 11 }}>{type} Vault</div>
                    </div>
                </div>
                <span className={`tag ${status === 'Active' ? 'success' : 'warn'}`}>{status}</span>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <div className="stat-label">AUM</div>
                    <div className="stat-value" style={{ fontSize: 20 }}>{fmtUsd(aumRaw)}</div>
                </div>
                <div>
                    <div className="stat-label">APY</div>
                    <div className="stat-value" style={{ fontSize: 20, color: 'var(--success-400)' }}>
                        {apy > 0 ? `${apy}%` : '—'}
                    </div>
                </div>
            </div>

            {/* Utilization bar */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className="stat-label" style={{ fontSize: 11 }}>Utilization</span>
                    <span style={{ fontSize: 12, color: 'var(--primary-300)' }}>{utilizDisplay}</span>
                </div>
                <div style={{ height: 4, background: 'var(--bg-card)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: utilizWidth }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        style={{
                            height: '100%',
                            background: 'var(--primary-500)',
                            borderRadius: 4,
                            boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)'
                        }}
                    />
                </div>
            </div>
        </motion.div>
    );
}

TreasuryVaultCard.propTypes = {
    vault: PropTypes.shape({
        name: PropTypes.string.isRequired,
        type: PropTypes.string.isRequired,
        aumRaw: PropTypes.oneOfType([PropTypes.bigint, PropTypes.number]),
        utilizPct: PropTypes.number,
        apy: PropTypes.number,
        status: PropTypes.string.isRequired,
    }).isRequired,
};
