// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useState, useEffect, useCallback, useRef } from 'react';
import { logSimulationEvent } from '../../utils/supabaseClient.js';

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 1: Persona Behavioural Engine
// ──────────────────────────────────────────────────────────────────────────────

const PERSONA_TYPES = ['Whale', 'Trend Follower', 'Degen', 'Arb', 'Panic Seller', 'VC'];

function runWhale(currentPrice) {
    if (Math.random() > 0.98) {
        const direction = Math.random() > 0.45 ? 1 : -1;
        const size = currentPrice * (0.05 + Math.random() * 0.10);
        return { delta: direction * size, label: `🐋 Whale ${direction > 0 ? 'Accumulation' : 'Dump'}: ${((size / currentPrice) * 100).toFixed(1)}%` };
    }
    return { delta: 0, label: null };
}

function runBlackSwan(currentPrice) {
    // 0.5% chance of a massive protocol-straining event
    if (Math.random() > 0.995) {
        const isCrash = Math.random() > 0.3;
        const magnitude = isCrash ? -0.18 : 0.15;
        return {
            delta: currentPrice * magnitude,
            label: isCrash ? "🚨 BLACK SWAN: Flash Crash / Liquidity Gap" : "🚀 GOD CANDLE: Short Squeeze"
        };
    }
    return { delta: 0, label: null };
}

function runArb(currentPrice, twap) {
    const deviation = currentPrice - twap;
    if (Math.abs(deviation) > twap * 0.04) {
        const correction = -deviation * (0.15 + Math.random() * 0.2);
        return { delta: correction, label: `🤖 Arb Bot: Correcting ${deviation > 0 ? 'Premium' : 'Discount'}` };
    }
    return { delta: 0, label: null };
}

function runDegen(currentPrice) {
    if (Math.random() > 0.95) {
        const isApe = Math.random() > 0.5;
        const size = currentPrice * (0.02 + Math.random() * 0.05);
        return {
            delta: isApe ? size : -size,
            label: isApe ? `🚀 Degen: Full Ape In` : `📉 Degen: Panic Close`
        };
    }
    return { delta: 0, label: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 2: MVP Valuation & Risk Engine
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Computes Discounted Present Value (DPV) and Borrow Limit based on MVP docs.
 * Formula: DPV = Quantity * Price * (Distance_to_Unlock_Discount) * (Volatility_Haircut)
 */
function computeDPV(quantity, spotPrice, monthsToUnlock, sigma = 0.5) {
    // 1. Time Discount (r=5% annual, 0.41% monthly)
    const r = 0.05 / 12;
    const timeDiscount = 1 / Math.pow(1 + r, monthsToUnlock);

    // 2. Volatility Haircut (5th Percentile Proxy from Monte Carlo Table)
    // For MVP, we map sigma to a conservative multiplier based on months
    // This approximates the Perc5_PV / Mean_PV ratio
    let volMultiplier = 1.0;
    if (sigma <= 0.3) {
        volMultiplier = Math.max(0.4, 1.0 - (monthsToUnlock * 0.015));
    } else if (sigma <= 0.5) {
        volMultiplier = Math.max(0.2, 1.0 - (monthsToUnlock * 0.025));
    } else {
        volMultiplier = Math.max(0.1, 1.0 - (monthsToUnlock * 0.04));
    }

    const rawValue = quantity * spotPrice;
    const dpv = rawValue * timeDiscount * volMultiplier;

    // 3. LTV Logic (LTV = 40% of DPV for extreme safety)
    const borrowLimit = dpv * 0.40;

    return {
        dpv,
        borrowLimit,
        timeDiscount,
        volMultiplier,
        ltv: 0.40
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 2: Main Simulation Hook
// ──────────────────────────────────────────────────────────────────────────────

export function useMarketSimulation() {
    const [isRunning, setIsRunning] = useState(false);
    const [agents, setAgents] = useState(1000);
    const [interestRateBps, setInterestRateBps] = useState(500);
    const [priceHistory, setPriceHistory] = useState([]);
    const [tradeFeed, setTradeFeed] = useState([]);
    const [metrics, setMetrics] = useState({
        currentPrice: 1.0,
        twap: 1.0,
        safetyPrice: 1.0,
        sentiment: 0.5,
        utilization: 0,
        borrowApr: 0.05 // 5% base
    });

    const stateRef = useRef({
        tick: 0,
        externalDelta: 0,
        priceHistory: [],
        sessionId: null
    });

    // ── Session & Telemetry Management ────────────────────────────────────────
    const initSession = useCallback(() => {
        const sid = `sid_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        window.sessionStorage.setItem('vestra_sid', sid);
        stateRef.current.sessionId = sid;
        logSimulationEvent('SESSION_START', { chain: 'Base-Sepolia', timestamp: new Date().toISOString() });
    }, []);

    // ── External Market Impact (Slippage) ─────────────────────────────────────
    const injectMarketImpact = useCallback((deltaPercent, reason) => {
        const impact = stateRef.current.currentPrice * deltaPercent;
        stateRef.current.externalDelta += impact;

        setTradeFeed(prev => [{
            id: Date.now(),
            time: new Date().toLocaleTimeString(),
            text: reason,
            type: deltaPercent < 0 ? 'sell' : 'buy',
            highlight: true,
        }, ...prev].slice(0, 20));

        logSimulationEvent('USER_IMPACT', { deltaPercent, reason });
    }, []);

    // ── Simulation Controls ───────────────────────────────────────────────────
    const startSimulation = useCallback((initialPrice = 1.0) => {
        initSession();
        stateRef.current.tick = 0;
        setMetrics({ currentPrice: initialPrice, twap: initialPrice, safetyPrice: initialPrice, sentiment: 0.5 });
        setPriceHistory([{ time: 0, price: initialPrice }]);
        setIsRunning(true);
    }, [initSession]);

    const resumeSimulation = useCallback(() => setIsRunning(true), []);

    const updateSimulationPrice = useCallback((newPrice) => {
        const oldPrice = stateRef.current.currentPrice;
        stateRef.current.currentPrice = newPrice;
        setMetrics(prev => ({ ...prev, currentPrice: newPrice }));
        logSimulationEvent('PRICE_FORCE', { old: oldPrice, new: newPrice });
    }, []);

    // ── Core Market Heartbeat (Stochastic Engine) ─────────────────────────────
    useEffect(() => {
        if (!isRunning) return;

        const interval = setInterval(async () => {
            const { currentPrice, tick, externalDelta, sessionId } = stateRef.current;
            const events = [];
            let totalDelta = externalDelta;
            stateRef.current.externalDelta = 0;

            // 1. Black Swan & Persona Execution
            const swan = runBlackSwan(currentPrice);
            if (swan.label) {
                totalDelta += swan.delta;
                events.push(swan);
                logSimulationEvent('BLACK_SWAN', { label: swan.label, delta: swan.delta });
            }

            // Scale active personas based on ASI guided agent count
            const activePersonas = Math.max(1, Math.min(10, Math.floor(agents / 200)));
            for (let i = 0; i < activePersonas; i++) {
                const whale = runWhale(currentPrice);
                const arb = runArb(currentPrice, metrics.twap);
                const degen = runDegen(currentPrice);

                totalDelta += (whale.delta + arb.delta + degen.delta);
                if (whale.label) events.push(whale);
                if (arb.label) events.push(arb);
            }

            // 2. Final Price Calculation
            const newPrice = Math.max(0.001, currentPrice + totalDelta);
            const newTick = tick + 1;

            // 3. Linear Weighted Moving Average (LWMA) TWAP - 50 Tick Window
            const newHistory = [...stateRef.current.priceHistory.slice(-49), { time: newTick, price: newPrice }];
            const sumWeights = (newHistory.length * (newHistory.length + 1)) / 2;
            const newTwap = newHistory.reduce((acc, curr, idx) => acc + (curr.price * (idx + 1)), 0) / sumWeights;

            // 4. Utilization & Interest Rate Logic
            // Simulate pool utilization based on state (mocked for demo)
            const mockUtilization = Math.min(0.95, 0.4 + (Math.random() * 0.2));
            const baseApr = 0.05;
            const slope = 0.15; // 15% spread
            const newBorrowApr = baseApr + (mockUtilization * slope);

            // 5. Update Refs & State
            stateRef.current.tick = newTick;
            stateRef.current.currentPrice = newPrice;
            stateRef.current.priceHistory = newHistory;

            setMetrics(prev => ({
                currentPrice: newPrice,
                twap: newTwap,
                safetyPrice: Math.min(newPrice, newTwap),
                sentiment: Math.max(-1, Math.min(1, prev.sentiment + (totalDelta / currentPrice))),
                utilization: mockUtilization,
                borrowApr: newBorrowApr
            }));
            setPriceHistory(newHistory);

            // 6. Sync with ASI Backend (MeTTa)
            try {
                const res = await fetch('http://localhost:3000/api/simulation/state');
                const data = await res.json();
                if (data.ok) {
                    if (data.volatility) setAgents(data.volatility);
                    if (data.interestRateBps) setInterestRateBps(data.interestRateBps);
                    logSimulationEvent('ASI_SYNC', { rate: data.interestRateBps, omega: data.omega });
                }
            } catch (e) { /* Backend offline */ }

            // 7. Update Feed
            if (events.length > 0) {
                setTradeFeed(prev => [
                    ...events.map(e => ({ id: Math.random(), time: new Date().toLocaleTimeString(), text: e.label, type: e.delta > 0 ? 'buy' : 'sell' })),
                    ...prev
                ].slice(0, 20));
            }

        }, 3000); // 3s Ticks for realistic dashboard movement

        return () => clearInterval(interval);
    }, [isRunning, agents, metrics.twap, metrics.sentiment]);

    return {
        isRunning,
        startSimulation,
        resumeSimulation,
        injectMarketImpact,
        updateSimulationPrice,
        computeDPV,
        agents,
        interestRateBps,
        metrics,
        priceHistory,
        tradeFeed,
    };
}