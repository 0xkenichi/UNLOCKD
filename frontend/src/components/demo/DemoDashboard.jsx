// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useMarketSimulation } from './useMarketSimulation.js';
import { formatUnits } from 'viem';
import { logSimulationEvent } from '../../utils/supabaseClient.js';

export default function DemoDashboard({ vestingContract }) {
    const {
        isRunning,
        startSimulation,
        pauseSimulation,
        resumeSimulation,
        resetSimulation,
        injectMarketImpact,
        agents,
        setAgents,
        metrics,
        priceHistory,
        tradeFeed,
    } = useMarketSimulation();

    const [lockedPercentage, setLockedPercentage] = useState(0);
    const [walletUSDC, setWalletUSDC] = useState(0);
    const [debt, setDebt] = useState(0);
    const [status, setStatus] = useState('ACTIVE'); // ACTIVE, LIQUIDATED
    const [seizedTokens, setSeizedTokens] = useState(0);
    const [liquidationHistory, setLiquidationHistory] = useState([]); // Track liq events on chart
    const sessionStart = useRef(Date.now());

    const totalCollateral = parseFloat(formatUnits(vestingContract?.allocation || '0', 6));
    const availableTotal = Math.max(0, totalCollateral - seizedTokens);
    const lockedTokens = availableTotal * (lockedPercentage / 100);
    const unboundCollateral = availableTotal - lockedTokens;
    const lockedValue = lockedTokens * metrics.currentPrice;

    const maxBorrow = lockedValue * 0.40; // LTV = 40%
    const liquidationThreshold = 0.80; // 80% LTV triggers liquidation
    const healthFactor = debt > 0 ? (lockedValue * liquidationThreshold) / debt : Infinity;

    // Liquidation Price = debt / (lockedTokens * liquidationThreshold)
    const liquidationPrice = debt > 0 && lockedTokens > 0
        ? debt / (lockedTokens * liquidationThreshold)
        : null;

    // ── Start on mount ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isRunning && priceHistory.length === 0) {
            startSimulation(1.0);
            logSimulationEvent('session_start', { ts: new Date().toISOString(), collateral: totalCollateral, token: vestingContract?.tokenName });
        }
    }, [isRunning, priceHistory, startSimulation, totalCollateral, vestingContract]);

    // ── Real-time Liquidation Engine ────────────────────────────────────────────
    useEffect(() => {
        if (status !== 'ACTIVE' || debt === 0 || healthFactor >= 1.0) return;

        const seizedValue = lockedTokens * metrics.currentPrice;

        logSimulationEvent('liquidation', {
            price: metrics.currentPrice,
            debt,
            tokens_seized: lockedTokens,
            seized_value: seizedValue,
            session_duration_s: Math.round((Date.now() - sessionStart.current) / 1000),
        });

        // ── Cascade: Protocol dumps seized collateral → flash crash ───────────────
        const cascadeImpact = -(lockedTokens / (totalCollateral || 1)) * 0.12; // Up to -12% depending on size
        injectMarketImpact(cascadeImpact, `⚡ Vestra Protocol liquidating ${Math.round(lockedTokens).toLocaleString()} tokens — cascade sell`);

        // ── Record event marker on chart ───────────────────────────────────────────
        const lastTick = priceHistory[priceHistory.length - 1];
        if (lastTick) {
            setLiquidationHistory(prev => [...prev, { time: lastTick.time, price: lastTick.price }]);
        }

        setSeizedTokens(prev => prev + lockedTokens);
        setLockedPercentage(0);
        setDebt(0);
        setWalletUSDC(0); // Strict penalty: USDC seized too
        setStatus('LIQUIDATED');
    }, [healthFactor, debt, status, metrics.currentPrice, lockedTokens, injectMarketImpact, priceHistory, totalCollateral]);

    // ── Borrow Handler ──────────────────────────────────────────────────────────
    const handleBorrow = () => {
        if (status !== 'ACTIVE') return;
        const borrowAmount = maxBorrow - debt;
        if (borrowAmount <= 0) return;

        setDebt(prev => prev + borrowAmount);
        setWalletUSDC(prev => prev + borrowAmount);

        // Large borrow creates fear / sell pressure in the market
        const sellPressure = -(borrowAmount / (totalCollateral * metrics.currentPrice)) * 0.03;
        injectMarketImpact(sellPressure, `Loan of $${borrowAmount.toFixed(0)} opened — sell pressure from leverage`);

        logSimulationEvent('borrow', { amount: borrowAmount, ltv: debt > 0 ? (debt / lockedValue) : 0, price: metrics.currentPrice });
    };

    // ── Repay Handler ───────────────────────────────────────────────────────────
    const handleRepay = () => {
        if (walletUSDC < debt) return;

        logSimulationEvent('repay', { amount: debt, remaining_usdc: walletUSDC - debt });

        // Repaying signals confidence → slight buy pressure
        injectMarketImpact(0.005, `Loan repaid — reduced protocol risk, slight buy signal`);

        setWalletUSDC(prev => prev - debt);
        setDebt(0);
    };

    // ── UI ──────────────────────────────────────────────────────────────────────
    return (
        <div className="demo-v2-dashboard">

            {/* Header Metrics Bar */}
            <div className="demo-v2-header card-panel">
                <div className="contract-badge">MOCK VESTING: {vestingContract?.tokenName || 'VestraToken'}</div>
                <div className="metrics-row">
                    <div className="metric">
                        <label>Price</label>
                        <span className={priceHistory.length > 1 && metrics.currentPrice > (priceHistory[priceHistory.length - 2]?.price || 0) ? 'positive' : 'negative'}>
                            ${metrics.currentPrice.toFixed(4)}
                        </span>
                    </div>
                    <div className="metric">
                        <label>TWAP</label>
                        <span>${metrics.twap.toFixed(4)}</span>
                    </div>
                    <div className="metric">
                        <label>ATH</label>
                        <span className="positive">${metrics.ath.toFixed(4)}</span>
                    </div>
                    <div className="metric">
                        <label>ATL</label>
                        <span className="negative">${metrics.atl.toFixed(4)}</span>
                    </div>
                    <div className="metric">
                        <label>Market Cap</label>
                        <span className="muted">${(totalCollateral * metrics.currentPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                </div>
            </div>

            <div className="demo-v2-grid">

                {/* Left Column */}
                <div className="demo-v2-left">
                    <div className="card-panel">
                        <div className="panel-header">
                            <h3>Live Market</h3>
                            <div className="agent-controls">
                                <label>Volatility Agents:</label>
                                <input type="range" min="1" max="100" value={agents} onChange={e => setAgents(parseInt(e.target.value))} />
                                <span className="badge">{agents}</span>
                            </div>
                        </div>

                        <div style={{ height: 320, width: '100%', marginTop: '0.75rem' }}>
                            <ResponsiveContainer>
                                <LineChart data={priceHistory}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                                    <XAxis dataKey="time" hide />
                                    <YAxis domain={['auto', 'auto']} width={50} tickFormatter={v => `$${v.toFixed(2)}`} />
                                    <Tooltip
                                        formatter={v => [`$${parseFloat(v).toFixed(4)}`, 'Price']}
                                        labelFormatter={() => ''}
                                        contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}
                                    />
                                    <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                                    {/* TWAP reference line */}
                                    <ReferenceLine y={metrics.twap} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'TWAP', fill: '#f59e0b', fontSize: 10 }} />
                                    {/* Liquidation threshold line */}
                                    {liquidationPrice && (
                                        <ReferenceLine y={liquidationPrice} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'LIQ', fill: '#ef4444', fontSize: 10 }} />
                                    )}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '11px', color: 'var(--text-muted)' }}>
                            <span>━ TWAP</span>
                            {liquidationPrice && <span style={{ color: '#ef4444' }}>╍ Liquidation ${liquidationPrice.toFixed(4)}</span>}
                        </div>
                    </div>

                    {/* Trade Feed */}
                    <div className="card-panel feed-panel">
                        <h3>Live Order Feed</h3>
                        <div className="feed-list">
                            {tradeFeed.length === 0 && <p className="muted">Waiting for agents...</p>}
                            {tradeFeed.map((t, i) => (
                                <div key={t.id ?? i} className={`feed-item ${t.type} ${t.highlight ? 'highlight' : ''}`}>
                                    <span className="time">{t.time}</span>
                                    <span className="text">{t.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="demo-v2-right">

                    {/* Mock Wallet */}
                    <div className="card-panel wallet-state">
                        <h3>Mock Wallet</h3>
                        <div className="balance-row">
                            <span className="label">Unbound Collateral</span>
                            <span className="value">{unboundCollateral.toLocaleString(undefined, { maximumFractionDigits: 0 })} {vestingContract?.tokenName}</span>
                        </div>
                        <div className="balance-row">
                            <span className="label">Locked Collateral</span>
                            <span className="value muted">{lockedTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} {vestingContract?.tokenName}</span>
                        </div>
                        {seizedTokens > 0 && (
                            <div className="balance-row">
                                <span className="label">Seized by Protocol</span>
                                <span className="value" style={{ color: 'var(--danger-400)' }}>
                                    {seizedTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} {vestingContract?.tokenName}
                                </span>
                            </div>
                        )}
                        <div className="balance-row">
                            <span className="label">USDC Balance</span>
                            <span className="value positive">${walletUSDC.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    {/* Protocol Operations */}
                    <div className="card-panel actions-panel">
                        <h3>Protocol Operations</h3>

                        {status === 'LIQUIDATED' ? (
                            <div className="liquidation-alert">
                                <h4>LIQUIDATION EVENT TRIGGERED</h4>
                                <p>Your position was below health threshold. The protocol executed a cascade sell of your locked collateral. Your USDC and tokens are now cleared.</p>
                                <button className="button primary" onClick={() => {
                                    setStatus('ACTIVE');
                                    resumeSimulation();
                                }}>
                                    Acknowledge & Continue
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="lock-slider">
                                    <label>Lock Collateral <span style={{ float: 'right', color: 'var(--primary-400)' }}>{lockedPercentage}%</span></label>
                                    <input
                                        type="range" min="0" max="100" value={lockedPercentage}
                                        onChange={e => setLockedPercentage(parseInt(e.target.value))}
                                        disabled={debt > 0}
                                    />
                                    <span className="helper-text">Value: ${lockedValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                </div>

                                <div className="health-metrics">
                                    <div className="hm-card">
                                        <span className="label">Max Borrow</span>
                                        <span className="value">${maxBorrow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div className="hm-card">
                                        <span className="label">Debt</span>
                                        <span className={`value ${debt > 0 ? 'error' : ''}`}>${debt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div className="hm-card">
                                        <span className="label">Health</span>
                                        <span className={`value ${healthFactor < 1.2 ? 'error' : healthFactor < 1.5 ? 'warning' : 'positive'}`}>
                                            {healthFactor === Infinity ? '∞' : healthFactor.toFixed(2)}
                                        </span>
                                    </div>
                                </div>

                                <div className="button-group">
                                    <button className="button primary" disabled={lockedTokens === 0 || maxBorrow <= debt} onClick={handleBorrow}>
                                        Max Borrow
                                    </button>
                                    <button className="button outline" disabled={debt === 0 || walletUSDC < debt} onClick={handleRepay}>
                                        Repay Debt
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Session Stats */}
                    <div className="card-panel">
                        <h3>Protocol Analytics</h3>
                        <div className="balance-row">
                            <span className="label">Liquidations This Session</span>
                            <span className="value">{liquidationHistory.length}</span>
                        </div>
                        <div className="balance-row">
                            <span className="label">Total Seized</span>
                            <span className="value" style={{ color: seizedTokens > 0 ? 'var(--danger-400)' : 'inherit' }}>
                                {seizedTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens
                            </span>
                        </div>
                        <div className="balance-row">
                            <span className="label">TWAP vs Spot</span>
                            <span className={`value ${Math.abs(metrics.currentPrice - metrics.twap) > metrics.twap * 0.05 ? 'error' : 'positive'}`}>
                                {((metrics.currentPrice / metrics.twap - 1) * 100).toFixed(2)}%
                            </span>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
