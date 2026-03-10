// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useWallet } from '@solana/wallet-adapter-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';
import { useOnchainSession } from '../utils/onchainSession.js';
import { useScanner } from '../utils/ScannerContext.jsx';

const CHAIN_COLORS = {
    evm: 'var(--primary-400)',
    solana: '#9945FF',
    base: '#0052FF',
    arbitrum: '#12AAFF',
    avalanche: '#E84142',
    optimism: '#FF0420',
    polygon: '#8247E5',
    ethereum: 'var(--primary-400)',
    eth: 'var(--primary-400)',
    bsc: '#F3BA2F',
    flow: '#00EF8B',
    zksync: '#4E529A',
};

const CHAIN_LABELS = {
    evm: 'Ethereum / EVM',
    eth: 'Ethereum',
    solana: 'Solana',
    base: 'Base',
    arbitrum: 'Arbitrum',
    avalanche: 'Avalanche',
    optimism: 'Optimism',
    polygon: 'Polygon',
    bsc: 'BNB Chain',
    flow: 'Flow EVM',
    zksync: 'zkSync Era',
};

function formatUsd(value) {
    if (!value || isNaN(value)) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function formatBalance(value, decimals = 4) {
    if (!value || isNaN(value)) return '0';
    return value.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function shortAddr(addr) {
    if (!addr || addr === 'native') return addr;
    return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

// ─── Chain Distribution Bar ───────────────────────────────────────────────────
function ChainDistributionBar({ breakdown, total }) {
    if (!total || total === 0) return null;
    return (
        <div className="holo-card" style={{ padding: '20px 24px' }}>
            <div className="section-head" style={{ marginBottom: 12 }}>
                <div className="section-title">Chain Distribution</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(breakdown).map(([chain, value]) => {
                    const pct = Math.round((value / total) * 100);
                    return (
                        <div key={chain}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                                <span style={{ color: CHAIN_COLORS[chain] || 'var(--text-primary)', fontWeight: 500 }}>
                                    {CHAIN_LABELS[chain] || chain}
                                </span>
                                <span className="muted">{formatUsd(value)} ({pct}%)</span>
                            </div>
                            <div style={{ height: 6, background: 'var(--bg-card)', borderRadius: 4, overflow: 'hidden' }}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.6, ease: 'easeOut' }}
                                    style={{
                                        height: '100%',
                                        background: CHAIN_COLORS[chain] || 'var(--primary-400)',
                                        borderRadius: 4,
                                        boxShadow: `0 0 8px ${CHAIN_COLORS[chain] || 'var(--primary-400)'}66`
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Asset Row ────────────────────────────────────────────────────────────────
function AssetRow({ token, index }) {
    return (
        <motion.tr
            key={token.contractAddress}
            initial={{ opacity: 0, translateY: 6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ delay: index * 0.04, duration: 0.25 }}
            style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
            <td style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: `${CHAIN_COLORS[token.chain] || 'var(--primary-400)'}22`,
                        border: `1px solid ${CHAIN_COLORS[token.chain] || 'var(--primary-400)'}55`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 12, color: CHAIN_COLORS[token.chain] || 'var(--primary-400)',
                        flexShrink: 0
                    }}>
                        {token.symbol.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{token.symbol}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{token.name?.slice(0, 28)}</div>
                    </div>
                </div>
            </td>
            <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: 13 }}>
                <span className="tag" style={{
                    fontSize: 10,
                    background: `${CHAIN_COLORS[token.chain] || 'var(--primary-400)'}18`,
                    color: CHAIN_COLORS[token.chain] || 'var(--primary-400)',
                    border: `1px solid ${CHAIN_COLORS[token.chain] || 'var(--primary-400)'}44`
                }}>
                    {CHAIN_LABELS[token.chain] || token.chain}
                </span>
            </td>
            <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 500, fontSize: 14 }}>
                {formatBalance(token.balance)}
            </td>
            <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: 13 }} className="muted">
                {formatUsd(token.priceUsd)}
            </td>
            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontSize: 14 }}>
                {token.valueUsd > 0 ? formatUsd(token.valueUsd) : <span className="muted">—</span>}
            </td>
        </motion.tr>
    );
}

// ─── Vested Position Row ─────────────────────────────────────────────────────
function VestedRow({ pos, index }) {
    return (
        <motion.tr
            initial={{ opacity: 0, translateY: 6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ delay: index * 0.04, duration: 0.25 }}
            style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
            <td style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                        🔒
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{pos.protocol}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                            {shortAddr(pos.contractAddress)}
                            {pos.streamId ? ` · Stream #${pos.streamId}` : ''}
                        </div>
                    </div>
                </div>
            </td>
            <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                <span className="tag" style={{ fontSize: 10, background: 'rgba(251,191,36,0.1)', color: '#f59e0b', border: '1px solid rgba(251,191,36,0.3)' }}>
                    Vested
                </span>
            </td>
            <td colSpan={3} style={{ padding: '12px 16px 12px 8px', textAlign: 'right' }}>
                {pos.loanId ? (
                    <span className="tag success" style={{ fontSize: 10 }}>Loan Active</span>
                ) : (
                    <span className="muted" style={{ fontSize: 12 }}>Eligible for collateral</span>
                )}
            </td>
        </motion.tr>
    );
}

// ─── Main Scanner Page ────────────────────────────────────────────────────────
export default function Scanner() {
    // Read from global shared context — no duplicate polling
    const { loading, data, error, lastUpdated, refetch, primaryAddress } = useScanner();

    const { summary, assets, linkedWallets } = data;
    const liquidAssets = assets.liquid || [];
    const vestedPositions = assets.vested || [];
    const defiPositions = assets.defi || [];
    const totalNet = summary.totalNetWorthUsd || 0;
    const totalDefi = summary.totalDefiUsd || 0;
    const chainBreakdown = summary.chainBreakdown || {};

    const sortedLiquid = useMemo(
        () => [...liquidAssets].sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0)),
        [liquidAssets]
    );

    return (
        <motion.div
            className="stack page-minimal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
        >
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="page-title holo-glow">Portfolio Scanner</h1>
                    <p className="page-subtitle">Unified multi-chain asset discovery.</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {lastUpdated && (
                        <span className="muted" style={{ fontSize: 11 }}>
                            Updated {new Date(lastUpdated).toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        className="button ghost"
                        onClick={refetch}
                        disabled={loading}
                        style={{ borderRadius: 'var(--radius-full)', padding: '6px 16px', fontSize: 12 }}
                    >
                        {loading ? 'Scanning...' : '⟳ Refresh'}
                    </button>
                </div>
            </div>

            {/* Not Connected */}
            {!primaryAddress && (
                <div className="holo-card" style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <div style={{ fontSize: 42, marginBottom: 16 }}>🔭</div>
                    <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Connect Your Wallet</h3>
                    <p className="muted" style={{ maxWidth: 420, margin: '0 auto', fontSize: 13 }}>
                        Connect your EVM or Solana wallet using the standard bridges below to scan your live portfolio.
                    </p>
                    <div style={{
                        marginTop: 32,
                        display: 'flex',
                        gap: 16,
                        justifyContent: 'center',
                        flexWrap: 'wrap'
                    }}>
                        <ConnectButton />
                        <WalletMultiButton style={{
                            background: '#9945FF',
                            borderRadius: 'var(--radius-full)',
                            fontWeight: 600,
                            padding: '0 24px',
                            height: 40,
                            border: '1px solid rgba(153,69,255,0.4)',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 0 15px rgba(153,69,255,0.2)'
                        }} />
                    </div>
                </div>
            )}

            {/* Loading Skeleton */}
            {primaryAddress && loading && liquidAssets.length === 0 && (
                <div className="holo-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
                    <div className="loading-row"><div className="spinner" /></div>
                    <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
                        Scanning EVM + Solana portfolio… querying Alchemy, Helius & Dune
                    </p>
                </div>
            )}

            {/* Error Banner */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="error-banner"
                    >
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content */}
            {primaryAddress && (liquidAssets.length > 0 || vestedPositions.length > 0 || defiPositions.length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 24, alignItems: 'start' }}>
                    {/* Left Column */}
                    <div className="stack" style={{ gap: 24 }}>
                        {/* Liquid Assets Table */}
                        {sortedLiquid.length > 0 && (
                            <div className="holo-card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div className="section-head" style={{ padding: '16px 20px 0' }}>
                                    <div>
                                        <div className="section-title">Liquid Assets</div>
                                        <div className="section-subtitle">{sortedLiquid.length} token{sortedLiquid.length !== 1 ? 's' : ''} detected</div>
                                    </div>
                                    <span className="tag success">Live</span>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                                            {['Asset', 'Network', 'Balance', 'Price', 'Value'].map((h) => (
                                                <th
                                                    key={h}
                                                    className="muted"
                                                    style={{
                                                        padding: h === 'Asset' ? '10px 16px' : '10px 8px',
                                                        textAlign: h === 'Asset' ? 'left' : 'right',
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.05em'
                                                    }}
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedLiquid.map((token, i) => (
                                            <AssetRow key={`${token.chain}-${token.contractAddress}`} token={token} index={i} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Vested positions */}
                        {vestedPositions.length > 0 && (
                            <div className="holo-card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div className="section-head" style={{ padding: '16px 20px 0' }}>
                                    <div>
                                        <div className="section-title">Locked / Vested Assets</div>
                                        <div className="section-subtitle">EVM vesting streams discovered onchain</div>
                                    </div>
                                    <span className="tag" style={{ background: 'rgba(251,191,36,0.1)', color: '#f59e0b' }}>
                                        {vestedPositions.length} stream{vestedPositions.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                                            {['Protocol', 'Type', 'Status'].map((h, i) => (
                                                <th
                                                    key={h}
                                                    className="muted"
                                                    colSpan={h === 'Status' ? 3 : 1}
                                                    style={{
                                                        padding: h === 'Protocol' ? '10px 16px' : '10px 8px',
                                                        textAlign: h === 'Protocol' ? 'left' : 'right',
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.05em'
                                                    }}
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {vestedPositions.map((pos, i) => (
                                            <VestedRow key={`${pos.contractAddress}-${i}`} pos={pos} index={i} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* DeFi Positions table */}
                        {defiPositions.length > 0 && (
                            <div className="holo-card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div className="section-head" style={{ padding: '16px 20px 0' }}>
                                    <div>
                                        <div className="section-title">DeFi Positions</div>
                                        <div className="section-subtitle">Dune Analytics · live on-chain query</div>
                                    </div>
                                    <span className="tag" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                                        {defiPositions.length} position{defiPositions.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                                            {['Protocol', 'Type / Pair', 'Value', 'APY'].map((h) => (
                                                <th key={h} className="muted" style={{
                                                    padding: h === 'Protocol' ? '10px 16px' : '10px 8px',
                                                    textAlign: h === 'Protocol' ? 'left' : 'right',
                                                    fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em'
                                                }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {defiPositions.map((pos, i) => (
                                            <motion.tr
                                                key={`defi-${i}`}
                                                initial={{ opacity: 0, translateY: 6 }}
                                                animate={{ opacity: 1, translateY: 0 }}
                                                transition={{ delay: i * 0.04, duration: 0.25 }}
                                                style={{ borderBottom: '1px solid var(--border-primary)' }}
                                            >
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>⚡</div>
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: 14 }}>{pos.protocol}</div>
                                                            <div className="muted" style={{ fontSize: 11 }}>{pos.description?.slice(0, 32)}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                                                    <span className="tag" style={{ fontSize: 10 }}>{pos.type || pos.protocol}</span>
                                                </td>
                                                <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600, fontSize: 14 }}>
                                                    {pos.valueUsd > 0 ? formatUsd(pos.valueUsd) : <span className="muted">—</span>}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right' }} className="muted">
                                                    {pos.apy ? `${(pos.apy * 100).toFixed(2)}%` : '—'}
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Empty state when loaded but nothing found */}
                        {!loading && liquidAssets.length === 0 && vestedPositions.length === 0 && defiPositions.length === 0 && (
                            <div className="holo-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
                                <div style={{ fontSize: 36, marginBottom: 12 }}>🌐</div>
                                <h4 style={{ fontWeight: 600, marginBottom: 8 }}>No Assets Found</h4>
                                <p className="muted" style={{ fontSize: 13 }}>
                                    No liquid or vested tokens were detected for this wallet on the current network.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Right Column – Summary */}
                    <div className="stack" style={{ gap: 16 }}>
                        {/* Net Worth Card */}
                        <div className="holo-card" style={{
                            padding: '24px',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(139,92,246,0.06) 100%)',
                            border: '1px solid rgba(59,130,246,0.25)'
                        }}>
                            <div className="section-title" style={{ marginBottom: 6 }}>Total Net Worth</div>
                            <div style={{ fontSize: 32, fontWeight: 700, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.5px' }}>
                                {formatUsd(totalNet)}
                            </div>
                            {totalDefi > 0 && (
                                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                                    +{formatUsd(totalDefi)} DeFi positions
                                </div>
                            )}
                            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Live · Prices may be delayed up to 60s</div>
                        </div>

                        {/* Wallet info + linked wallets */}
                        <div className="holo-card" style={{ padding: 20 }}>
                            <div className="section-title" style={{ marginBottom: 10 }}>Scanning</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span className="muted" style={{ fontSize: 12 }}>Primary wallet</span>
                                    <code style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                        {primaryAddress ? `${primaryAddress.slice(0, 10)}…${primaryAddress.slice(-6)}` : '—'}
                                    </code>
                                </div>
                                {linkedWallets && (linkedWallets.evm?.length > 1 || linkedWallets.solana?.length > 0) && (
                                    <div style={{ marginTop: 6, padding: '8px 10px', background: 'rgba(59,130,246,0.06)', borderRadius: 6, border: '1px solid rgba(59,130,246,0.15)' }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--primary-400)' }}>Linked wallets</div>
                                        {linkedWallets.evm?.map((a) => (
                                            <div key={a} style={{ fontSize: 10 }} className="muted">EVM: {a.slice(0, 10)}…{a.slice(-6)}</div>
                                        ))}
                                        {linkedWallets.solana?.map((a) => (
                                            <div key={a} style={{ fontSize: 10, color: '#9945FF' }}>◎ {a.slice(0, 10)}…{a.slice(-6)}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <ChainDistributionBar breakdown={chainBreakdown} total={totalNet} />

                        {/* Asset counts */}
                        <div className="holo-card" style={{ padding: 20 }}>
                            <div className="section-title" style={{ marginBottom: 10 }}>Summary</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {[
                                    { label: 'Liquid tokens', value: liquidAssets.length },
                                    { label: 'Vested streams', value: vestedPositions.length },
                                    { label: 'DeFi positions', value: defiPositions.length || (data?.meta?.hasDuneData ? 0 : '—') }
                                ].map(({ label, value }) => (
                                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span className="muted" style={{ fontSize: 13 }}>{label}</span>
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
