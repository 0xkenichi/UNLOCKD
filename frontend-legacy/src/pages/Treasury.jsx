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
    insuranceVaultAbi,
    lendingPoolAbi,
    loanManagerAbi
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
    const loanManagerAddress = getContractAddress(chainId, 'loanManager');
    const insuranceVaultAddress = getContractAddress(chainId, 'insuranceVault');
    const deployed = Boolean(lendingPoolAddress && loanManagerAddress);

    const { data: results, isLoading, isError, refetch } = useReadContracts({
        contracts: deployed
            ? [
                { address: lendingPoolAddress, abi: lendingPoolAbi, functionName: 'totalAssets' },
                { address: lendingPoolAddress, abi: lendingPoolAbi, functionName: 'totalBorrowed' },
                { address: lendingPoolAddress, abi: lendingPoolAbi, functionName: 'utilizationBps' },
                { address: lendingPoolAddress, abi: lendingPoolAbi, functionName: 'borrowRateBps' },
                { address: lendingPoolAddress, abi: lendingPoolAbi, functionName: 'availableLiquidity' },
                { address: loanManagerAddress, abi: loanManagerAbi, functionName: 'reserveFactorBps' },
                ...(insuranceVaultAddress
                    ? [
                        { address: insuranceVaultAddress, abi: insuranceVaultAbi, functionName: 'balance' },
                        { address: insuranceVaultAddress, abi: insuranceVaultAbi, functionName: 'totalCovered' }
                    ]
                    : [])
            ]
            : [],
        query: { enabled: deployed }
    });

    const treasuryData = useMemo(() => {
        if (!results) return null;
        const [
            totalAssets,
            totalBorrowed,
            utilizationBps,
            borrowRateBps,
            availableLiquidity,
            reserveFactorBps,
            insuranceBalance,
            insuranceCovered
        ] = results.map(r => r?.result ?? 0n);

        const lendingRaw = BigInt(totalAssets ?? 0n);
        const borrowedRaw = BigInt(totalBorrowed ?? 0n);
        const utilizBps = BigInt(utilizationBps ?? 0n);
        const borrowBps = BigInt(borrowRateBps ?? 0n);
        const liquidityRaw = BigInt(availableLiquidity ?? 0n);
        const insuranceRaw = BigInt(insuranceBalance ?? 0n);
        const coveredRaw = BigInt(insuranceCovered ?? 0n);
        const rf = Number(reserveFactorBps ?? 0n);

        // Variable supply APY: borrow rate on the borrowed share, net of the reserve factor.
        const supplyApyBps = (Number(borrowBps) * Number(utilizBps)) / 10000 * (1 - rf / 10000);

        return {
            totalRaw: lendingRaw + insuranceRaw,
            lendingRaw,
            borrowedRaw,
            utilizBps,
            borrowBps,
            liquidityRaw,
            insuranceRaw,
            coveredRaw,
            lendingApy: Number((supplyApyBps / 100).toFixed(2))
        };
    }, [results]);

    if (!deployed) {
        return (
            <div className="stack">
                <div className="holo-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <h2 className="section-title" style={{ marginBottom: 8 }}>Treasury</h2>
                    <p className="muted">Vestra contracts are not deployed on this network yet.</p>
                </div>
            </div>
        );
    }

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
                    <Activity size={40} style={{ color: 'var(--danger-400)', margin: '0 auto 16px' }} />
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

    const { totalRaw, lendingRaw, borrowedRaw, utilizBps, borrowBps, liquidityRaw, insuranceRaw, coveredRaw, lendingApy } = treasuryData;

    return (
        <div className="stack">
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'flex-end' }}>
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
                    <div className="stat-delta">Lending pool + insurance vault</div>
                </motion.div>

                <motion.div
                    className="stat-card"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                >
                    <div style={{ marginBottom: 8 }}>
                        <Zap size={20} style={{ color: 'var(--brass-400)' }} />
                    </div>
                    <div className="stat-label">Active Debt</div>
                    <div className="stat-value" style={{ fontSize: 26 }}>{fmtUsd(borrowedRaw)}</div>
                    <div className="stat-delta">Floating rate {fmtPct(borrowBps)} APR</div>
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
                    <div className="stat-delta">Insurance vault · {fmtUsd(coveredRaw)} covered to date</div>
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
                            <div className="section-subtitle">Live pool liquidity and rate metrics.</div>
                        </div>
                    </div>
                </div>
                <div
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 16 }}
                >
                    <div className="stat-card">
                        <div className="stat-label" style={{ marginBottom: 6 }}>Available Liquidity</div>
                        <div className="stat-value" style={{ fontSize: 22, marginBottom: 8 }}>{fmtUsd(liquidityRaw)}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label" style={{ marginBottom: 6 }}>Supply APY (variable)</div>
                        <div className="stat-value" style={{ fontSize: 22, marginBottom: 8 }}>{lendingApy.toFixed(2)}%</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label" style={{ marginBottom: 6 }}>Utilization Rate</div>
                        <div className="stat-value" style={{ fontSize: 22, marginBottom: 8 }}>
                            {fmtPct(utilizBps)}
                        </div>
                        <div style={{ height: 2, background: 'var(--border-secondary)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, Number(utilizBps) / 100)}%`, background: 'var(--brass-400)' }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
