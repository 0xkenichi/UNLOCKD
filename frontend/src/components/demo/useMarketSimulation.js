import { useState, useEffect, useCallback, useRef } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Agent Persona Behavioural Engine
// Each persona runs independently every tick and returns a price delta.
// ──────────────────────────────────────────────────────────────────────────────

const PERSONA_TYPES = ['Whale', 'Trend Follower', 'Degen', 'Arb', 'Panic Seller', 'VC'];

function runWhale(currentPrice, trend) {
    // Rare but massive impact. Triggers roughly 3% of ticks.
    if (Math.random() > 0.97) {
        const direction = Math.random() > 0.45 ? 1 : -1; // Slight upward bias
        const size = currentPrice * (0.04 + Math.random() * 0.08); // 4–12% swing
        return { delta: direction * size, label: `Whale ${direction > 0 ? 'accumulated' : 'dumped'} ${(size / currentPrice * 100).toFixed(1)}%` };
    }
    return { delta: 0, label: null };
}

function runTrendFollower(currentPrice, trend, prevPrice) {
    // Amplifies recent direction. Creates FOMO and panic spirals.
    const recentTrend = currentPrice - prevPrice;
    if (Math.abs(recentTrend) > currentPrice * 0.005) {
        const follow = recentTrend * (0.3 + Math.random() * 0.4); // 30–70% amplification
        return { delta: follow, label: `Trend Follower ${follow > 0 ? 'chasing rally' : 'panic selling'}` };
    }
    return { delta: 0, label: null };
}

function runDegen(currentPrice) {
    // Pure noise. High frequency, small size. Always active.
    const noise = (Math.random() - 0.5) * currentPrice * 0.025;
    const side = noise > 0 ? 'longed' : 'shorted';
    return {
        delta: noise,
        label: Math.random() > 0.6 ? `Degen ${side} with 50x leverage` : null
    };
}

function runArb(currentPrice, twap) {
    // Tries to revert price back toward TWAP when overextended.
    const deviation = currentPrice - twap;
    if (Math.abs(deviation) > twap * 0.05) {
        const correction = -deviation * (0.1 + Math.random() * 0.15);
        return { delta: correction, label: `Arb bot correcting ${deviation > 0 ? 'premium' : 'discount'} vs TWAP` };
    }
    return { delta: 0, label: null };
}

function runVC(currentPrice, tick) {
    // VCs lock up, sell at unlock. Simulate a cliff unlock every ~60 ticks.
    if (tick % 60 === 59) {
        const dump = -currentPrice * (0.06 + Math.random() * 0.05);
        return { delta: dump, label: `VC cliff unlock — selling allocation` };
    }
    return { delta: 0, label: null };
}

function runPanicSeller(currentPrice, health) {
    // If the market is falling (health < 0), this persona amplifies it.
    if (health < 0 && Math.random() > 0.7) {
        const panic = currentPrice * -(0.01 + Math.random() * 0.025);
        return { delta: panic, label: `Panic seller capitulating` };
    }
    return { delta: 0, label: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Simulation Hook
// ──────────────────────────────────────────────────────────────────────────────

export function useMarketSimulation() {
    const [isRunning, setIsRunning] = useState(false);
    const [agents, setAgents] = useState(10);
    const [priceHistory, setPriceHistory] = useState([]);
    const [metrics, setMetrics] = useState({ currentPrice: 1.0, ath: 1.0, atl: 1.0, twap: 1.0 });
    const [tradeFeed, setTradeFeed] = useState([]);

    const stateRef = useRef({
        agents: 10,
        currentPrice: 1.0,
        priceHistory: [],
        twap: 1.0,
        tick: 0,
        externalDelta: 0, // injected from protocol actions
    });

    useEffect(() => {
        stateRef.current.agents = agents;
    }, [agents]);

    useEffect(() => {
        stateRef.current.currentPrice = metrics.currentPrice;
        stateRef.current.twap = metrics.twap;
    }, [metrics.currentPrice, metrics.twap]);

    useEffect(() => {
        stateRef.current.priceHistory = priceHistory;
    }, [priceHistory]);

    // ── External market impact injection ────────────────────────────────────────
    // Call this from DemoDashboard to inject a protocol-level price delta.
    const injectMarketImpact = useCallback((deltaPercent, reason) => {
        stateRef.current.externalDelta += deltaPercent;
        setTradeFeed(prev => [{
            id: Date.now(),
            time: new Date().toLocaleTimeString(),
            text: reason,
            type: deltaPercent < 0 ? 'sell' : 'buy',
            highlight: true,
        }, ...prev].slice(0, 20));
    }, []);

    const startSimulation = useCallback((initialPrice = 1.0) => {
        stateRef.current.tick = 0;
        stateRef.current.externalDelta = 0;
        setMetrics({ currentPrice: initialPrice, ath: initialPrice, atl: initialPrice, twap: initialPrice });
        setPriceHistory([{ time: 0, price: initialPrice }]);
        setTradeFeed([{ id: 0, time: new Date().toLocaleTimeString(), text: 'Market opened — agents active', type: 'info' }]);
        setIsRunning(true);
    }, []);

    const pauseSimulation = useCallback(() => setIsRunning(false), []);
    const resumeSimulation = useCallback(() => setIsRunning(true), []);
    const resetSimulation = useCallback(() => {
        setIsRunning(false);
        setPriceHistory([]);
        setTradeFeed([]);
        setMetrics({ currentPrice: 1.0, ath: 1.0, atl: 1.0, twap: 1.0 });
        stateRef.current.tick = 0;
        stateRef.current.externalDelta = 0;
    }, []);

    useEffect(() => {
        if (!isRunning) return;

        const interval = setInterval(() => {
            const { currentPrice, priceHistory: hist, twap, tick, agents: numAgents, externalDelta } = stateRef.current;
            const prevPrice = hist.length > 1 ? hist[hist.length - 2].price : currentPrice;
            const trend = currentPrice - prevPrice;
            const marketHealth = trend / (currentPrice || 1);

            // ── Run Persona Engines ────────────────────────────────────────────────
            const events = [];
            let totalDelta = externalDelta; // Start with injected protocol impact
            stateRef.current.externalDelta = 0; // Consume it

            // Scale number of active personas with the agent count slider
            const activeAgents = Math.max(1, Math.floor(numAgents / 15));

            for (let i = 0; i < activeAgents; i++) {
                const type = PERSONA_TYPES[i % PERSONA_TYPES.length];
                let result = { delta: 0, label: null };

                if (type === 'Whale') result = runWhale(currentPrice, trend);
                else if (type === 'Trend Follower') result = runTrendFollower(currentPrice, trend, prevPrice);
                else if (type === 'Degen') result = runDegen(currentPrice);
                else if (type === 'Arb') result = runArb(currentPrice, twap);
                else if (type === 'VC') result = runVC(currentPrice, tick);
                else if (type === 'Panic Seller') result = runPanicSeller(currentPrice, marketHealth);

                totalDelta += result.delta;
                if (result.label) events.push({ type, label: result.label, delta: result.delta });
            }

            // ── Compute Next Price ─────────────────────────────────────────────────
            let newPrice = Math.max(0.001, currentPrice + totalDelta);

            // ── Update History ─────────────────────────────────────────────────────
            const newTick = tick + 1;
            const newHistory = [...hist.slice(-100), { time: newTick, price: newPrice }];
            const prices = newHistory.map(d => d.price);
            const newTwap = prices.reduce((s, p) => s + p, 0) / prices.length;

            stateRef.current.tick = newTick;
            stateRef.current.priceHistory = newHistory;

            setPriceHistory(newHistory);
            setMetrics(prev => ({
                currentPrice: newPrice,
                ath: Math.max(prev.ath, newPrice),
                atl: Math.min(prev.atl, newPrice),
                twap: newTwap,
            }));

            // ── Emit top feed events ───────────────────────────────────────────────
            if (events.length > 0) {
                const top = events.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 2);
                setTradeFeed(prev => [
                    ...top.map(e => ({
                        id: Date.now() + Math.random(),
                        time: new Date().toLocaleTimeString(),
                        text: e.label,
                        type: e.delta > 0 ? 'buy' : 'sell',
                    })),
                    ...prev,
                ].slice(0, 20));
            }

        }, 1000);

        return () => clearInterval(interval);
    }, [isRunning]);

    return {
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
    };
}
