import { useState, useMemo } from 'react';
import HoloCard from '../common/HoloCard.jsx';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function GovernanceSimulator() {
    const [ltvBoost, setLtvBoost] = useState(15);
    const [interestRate, setInterestRate] = useState(8);
    const [riskTolerance, setRiskTolerance] = useState(5);

    const simulationData = useMemo(() => {
        const data = [];
        let currentTvl = 1000000;
        let currentDefaults = 0;

        for (let month = 1; month <= 12; month++) {
            // Very basic mock simulation logic
            const growthFactor = 1 + (ltvBoost / 100) * 0.5 - (interestRate / 100) * 0.2;
            const riskFactor = (ltvBoost / 100) * (riskTolerance / 10) * 0.3;

            currentTvl = currentTvl * growthFactor;
            currentDefaults = currentDefaults + (currentTvl * riskFactor);

            data.push({
                name: `Month ${month}`,
                tvl: Math.round(currentTvl),
                defaults: Math.round(currentDefaults)
            });
        }
        return data;
    }, [ltvBoost, interestRate, riskTolerance]);

    return (
        <HoloCard distort={0.2} className="col-span-1 md:col-span-2">
            <div className="section-head mb-6">
                <div>
                    <h3 className="section-title holo-glow">Proposal Simulator</h3>
                    <div className="section-subtitle">Model parameter changes before voting</div>
                </div>
                <span className="chip">Interactive</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Max LTV Boost ({ltvBoost}%)</label>
                        <input
                            type="range"
                            min="0" max="50"
                            value={ltvBoost}
                            onChange={(e) => setLtvBoost(Number(e.target.value))}
                            className="w-full accent-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Base Interest Rate ({interestRate}%)</label>
                        <input
                            type="range"
                            min="1" max="25"
                            value={interestRate}
                            onChange={(e) => setInterestRate(Number(e.target.value))}
                            className="w-full accent-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Risk Tolerance Threshold ({riskTolerance}/10)</label>
                        <input
                            type="range"
                            min="1" max="10"
                            value={riskTolerance}
                            onChange={(e) => setRiskTolerance(Number(e.target.value))}
                            className="w-full accent-blue-500"
                        />
                    </div>
                    <button className="button w-full" type="button">
                        Draft Proposal
                    </button>
                </div>

                <div className="col-span-2 h-[250px] bg-black/40 rounded-lg p-4 border border-white/10">
                    <h4 className="text-xs text-gray-400 mb-4 uppercase tracking-wider">Projected 12-Month Impact</h4>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={simulationData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                            <XAxis dataKey="name" stroke="#A0A0A0" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis yAxisId="left" stroke="#3b82f6" fontSize={10} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
                            <YAxis yAxisId="right" orientation="right" stroke="#ef4444" fontSize={10} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#001F3F', borderColor: '#3b82f630', borderRadius: '8px' }}
                                itemStyle={{ fontSize: '12px' }}
                                labelStyle={{ fontSize: '12px', color: '#A0A0A0', marginBottom: '4px' }}
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
