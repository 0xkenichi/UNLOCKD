// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useState, useMemo } from 'react';
import HoloCard from '../common/HoloCard.jsx';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function GovernanceSimulator() {
    const [ltvBoost, setLtvBoost] = useState(15);
    const [interestRate, setInterestRate] = useState(8);
    const [riskTolerance, setRiskTolerance] = useState(5);

    const simulationData = useMemo(() => {
        const data = [];
        let currentTvl = 1_000_000;
        let currentDefaults = 0;

        for (let month = 1; month <= 12; month++) {
            const growthFactor = 1 + (ltvBoost / 100) * 0.5 - (interestRate / 100) * 0.2;
            const riskFactor = (ltvBoost / 100) * (riskTolerance / 10) * 0.3;
            currentTvl = currentTvl * growthFactor;
            currentDefaults = currentDefaults + (currentTvl * riskFactor);
            data.push({
                name: `M${month}`,
                tvl: Math.round(currentTvl),
                defaults: Math.round(currentDefaults)
            });
        }
        return data;
    }, [ltvBoost, interestRate, riskTolerance]);

    return (
        <HoloCard distort={0.2}>
            <div className="section-head" style={{ marginBottom: 20 }}>
                <div>
                    <h3 className="section-title holo-glow">Proposal Simulator</h3>
                    <div className="section-subtitle">Model parameter changes before voting</div>
                </div>
                <span className="chip">Interactive</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
                {/* Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                        <label className="stat-label" style={{ display: 'block', marginBottom: 6 }}>
                            Max LTV Boost ({ltvBoost}%)
                        </label>
                        <input
                            type="range"
                            min="0" max="50"
                            value={ltvBoost}
                            onChange={(e) => setLtvBoost(Number(e.target.value))}
                            style={{ width: '100%', accentColor: 'var(--primary-500)' }}
                        />
                    </div>
                    <div>
                        <label className="stat-label" style={{ display: 'block', marginBottom: 6 }}>
                            Base Interest Rate ({interestRate}%)
                        </label>
                        <input
                            type="range"
                            min="1" max="25"
                            value={interestRate}
                            onChange={(e) => setInterestRate(Number(e.target.value))}
                            style={{ width: '100%', accentColor: 'var(--primary-500)' }}
                        />
                    </div>
                    <div>
                        <label className="stat-label" style={{ display: 'block', marginBottom: 6 }}>
                            Risk Tolerance ({riskTolerance}/10)
                        </label>
                        <input
                            type="range"
                            min="1" max="10"
                            value={riskTolerance}
                            onChange={(e) => setRiskTolerance(Number(e.target.value))}
                            style={{ width: '100%', accentColor: 'var(--primary-500)' }}
                        />
                    </div>
                    <button className="button" type="button" style={{ width: '100%' }}>
                        Draft Proposal
                    </button>
                </div>

                {/* Chart */}
                <div style={{
                    height: 250,
                    background: 'rgba(0,0,0,0.4)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    padding: '16px 16px 8px'
                }}>
                    <div className="stat-label" style={{ marginBottom: 10, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Projected 12-Month Impact
                    </div>
                    <ResponsiveContainer width="100%" height="85%">
                        <LineChart data={simulationData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                            <XAxis dataKey="name" stroke="#A0A0A0" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis
                                yAxisId="left"
                                stroke="#3b82f6"
                                fontSize={10}
                                tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="#ef4444"
                                fontSize={10}
                                tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#001F3F', borderColor: '#3b82f630', borderRadius: 8 }}
                                itemStyle={{ fontSize: 12 }}
                                labelStyle={{ fontSize: 12, color: '#A0A0A0', marginBottom: 4 }}
                            />
                            <Line yAxisId="left" type="monotone" dataKey="tvl" name="Projected TVL" stroke="#3b82f6" strokeWidth={2} dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="defaults" name="Est. Defaults" stroke="#ef4444" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </HoloCard>
    );
}
