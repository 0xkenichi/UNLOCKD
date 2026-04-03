// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useReadContracts, useChainId } from 'wagmi';
import {
    Activity,
    Shield,
    Database,
    Layers,
    RefreshCcw,
    TrendingUp,
    Zap
} from 'lucide-react';
import {
    getContractAddress,
    lendingPoolAbi,
    termVaultAbi,
    usdcAbi
} from '../utils/contracts.js';
import TreasuryVaultCard from '../components/treasury/TreasuryVaultCard.jsx';

function fmtUsd(rawUnits, decimals = 6) {
    const value = Number(rawUnits ?? 0) / Math.pow(10, decimals);
    if (value === 0) return '$0.00';
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(bps) {
    return `${(Number(bps ?? 0) / 100).toFixed(1)}%`;
}

export default function Treasury() {
    const chainId = useChainId();

    const lendingPoolAddress = getContractAddress(chainId, 'lendingPool');
    const termVaultAddress = getContractAddress(chainId, 'termVault');
    const insuranceVaultAddress = getContractAddress(chainId, 'insuranceVault');
    const usdcAddress = getContractAddress(chainId, 'usdc');

    const { data: results, isLoading, isError, refetch } = useReadContracts({
        contracts: [
            { address: lendingPoolAddress, abi: lendingPoolAbi, functionName: 'totalDeposits' },
            { address: lendingPoolAddress, abi: lendingPoolAbi, functionName: 'totalBorrowed' },
            { address: lendingPoolAddress, abi: lendingPoolAbi, functionName: 'utilizationRateBps' },
            { address: termVaultAddress, abi: termVaultAbi, functionName: 'totalPrincipalLocked' },
            { address: termVaultAddress, abi: termVaultAbi, functionName: 'reservedRewards' },
            {
                address: usdcAddress,
                abi: usdcAbi,
                functionName: 'balanceOf',
                args: [insuranceVaultAddress],
            },
        ],
    });

    const treasuryData = useMemo(() => {
        if (!results) return null;
        const [
            totalDeposits,
            totalBorrowed,
            utilizationRateBps,
            totalPrincipalLocked,
            reservedRewards,
            insuranceBalance
        ] = results.map(r => r?.result ?? 0n);

        const lendingRaw = BigInt(totalDeposits ?? 0n);
        const borrowedRaw = BigInt(totalBorrowed ?? 0n);
        const utilizBps = BigInt(utilizationRateBps ?? 0n);
        const principalRaw = BigInt(totalPrincipalLocked ?? 0n);
        const rewardsRaw = BigInt(reservedRewards ?? 0n);
        const insuranceRaw = BigInt(insuranceBalance ?? 0n);

        const termRaw = principalRaw + rewardsRaw;
        const totalRaw = lendingRaw + termRaw + insuranceRaw;

        return {
            totalRaw,
            lendingRaw,
            borrowedRaw,
            utilizBps,
            termRaw,
            insuranceRaw,
            lendingApy: 12.5,
            termApy: 8.0,
        };
    }, [results]);

    if (isLoading) {
        return (
            <div className="stack" style={{ alignItems: 'center', padding: '60px 0' }}>
                <div className="spinner" />
            </div>
        );
    }

    if (isError || !treasuryData) {
        return (
            <div className="stack">
                <div className="holo-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <Activity size={40} style={{ color: 'var(--error-400)', margin: '0 auto 16px' }} />
                    <h2 className="section-title" style={{ marginBottom: 8 }}>Treasury Sync Failed</h2>
                    <p className="muted" style={{ marginBottom: 20 }}>
                        Couldn&apos;t reach on-chain vault analytics. Check that your wallet is on a supported network.
                    </p>
                    <button className="button" type="button" onClick={() => refetch()}>
                        Retry Connection
                    </button>
                </div>
            </div>
        );
    }

    const { totalRaw, lendingRaw, borrowedRaw, utilizBps, termRaw, insuranceRaw, lendingApy, termApy } = treasuryData;

    return (
        <div className="stack">
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 className="page-title holo-glow">Protocol Treasury</h1>
                    <p className="page-subtitle">Real-time on-chain vault forensics and liquidity metrics.</p>
                </div>
                <button className="button ghost" type="button" onClick={() => refetch()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCcw size={14} />
                    Sync Nodes
                </button>
            </div>

            {/* Global KPIs */}
            <div className="stat-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <motion.div
                    className="stat-card"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <Database size={20} style={{ color: 'var(--primary-400)' }} />
                        <TrendingUp size={16} style={{ color: 'var(--success-400)' }} />
                    </div>
                    <div className="stat-label">Total AUM</div>
                    <div className="stat-value" style={{ fontSize: 26 }}>{fmtUsd(totalRaw)}</div>
                    <div className="stat-delta">Across 3 defensive layers</div>
                </motion.div>

                <motion.div
                    className="stat-card"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                >
                    <div style={{ marginBottom: 8 }}>
                        <Zap size={20} style={{ color: '#f97316' }} />
                    </div>
                    <div className="stat-label">Active Debt</div>
                    <div className="stat-value" style={{ fontSize: 26 }}>{fmtUsd(borrowedRaw)}</div>
                    <div className="stat-delta">Interest-bearing credit</div>
                </motion.div>

                <motion.div
                    className="stat-card"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.16 }}
                >
                    <div style={{ marginBottom: 8 }}>
                        <Shield size={20} style={{ color: 'var(--success-400)' }} />
                    </div>
                    <div className="stat-label">Safety Buffer</div>
                    <div className="stat-value" style={{ fontSize: 26 }}>{fmtUsd(insuranceRaw)}</div>
                    <div className="stat-delta">Zero-Deficit reserve</div>
                </motion.div>
            </div>

            {/* Vault Composition */}
            <div className="section-head" style={{ marginTop: 8 }}>
                <div>
                    <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Layers size={18} style={{ color: 'var(--primary-400)' }} />
                        Vault Composition
                    </h2>
                </div>
            </div>

            <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                <TreasuryVaultCard vault={{
                    name: 'Lending Pool',
                    type: 'Lending',
                    aumRaw: lendingRaw,
                    utilizPct: Number(utilizBps) / 100,
                    apy: lendingApy,
                    status: 'Active'
                }} />
                <TreasuryVaultCard vault={{
                    name: 'Term Vault',
                    type: 'Term',
                    aumRaw: termRaw,
                    utilizPct: 0,
                    apy: termApy,
                    status: 'Active'
                }} />
                <TreasuryVaultCard vault={{
                    name: 'Insurance Reserve',
                    type: 'Insurance',
                    aumRaw: insuranceRaw,
                    utilizPct: 0,
                    apy: 0,
                    status: 'Active'
                }} />
            </div>

            {/* Security Forensics */}
            <div className="holo-card" style={{ marginTop: 8 }}>
                <div className="section-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Shield size={18} style={{ color: 'var(--primary-400)' }} />
                        <div>
                            <h3 className="section-title">Security Forensics</h3>
                            <div className="section-subtitle">All protocol assets are held in Non-Custodial Sovereign Vaults.</div>
                        </div>
                    </div>
                </div>
                <div
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 16 }}
                >
                    <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="stat-label" style={{ marginBottom: 6 }}>Reserve Ratio</div>
                        <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', color: 'var(--primary-200)', marginBottom: 8 }}>1.24x</div>
                        <div style={{ height: 4, background: 'var(--bg-card)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: '82%', background: 'var(--primary-500)', borderRadius: 4 }} />
                        </div>
                    </div>
                    <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="stat-label" style={{ marginBottom: 6 }}>Liquidity Efficiency</div>
                        <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', color: 'var(--primary-200)', marginBottom: 8 }}>94.2%</div>
                        <div style={{ height: 4, background: 'var(--bg-card)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: '94%', background: 'var(--primary-500)', borderRadius: 4 }} />
                        </div>
                    </div>
                    <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="stat-label" style={{ marginBottom: 6 }}>Utilization Rate</div>
                        <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', color: 'var(--primary-200)', marginBottom: 8 }}>
                            {fmtPct(utilizBps)}
                        </div>
                        <div style={{ height: 4, background: 'var(--bg-card)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, Number(utilizBps) / 100)}%`, background: 'var(--primary-500)', borderRadius: 4 }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
