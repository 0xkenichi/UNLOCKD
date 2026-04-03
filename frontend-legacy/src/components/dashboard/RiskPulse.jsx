// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import React, { useState, useEffect } from 'react';
import { apiGet } from '../../utils/api';

const RiskPulse = () => {
    const [alerts, setAlerts] = useState([]);
    const [systemStatus, setSystemStatus] = useState('NOMINAL');
    const [volatility, setVolatility] = useState(10);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [alertData, simData] = await Promise.all([
                    apiGet('/api/omega/alerts'),
                    apiGet('/api/simulation/state')
                ]);
                
                if (alertData.ok) {
                    setAlerts(alertData.alerts);
                    const hasCritical = alertData.alerts.some(a => a.level === 'CRITICAL');
                    const hasWarning = alertData.alerts.some(a => a.level === 'WARNING');
                    setSystemStatus(hasCritical ? 'CRITICAL' : hasWarning ? 'DEGRADED' : 'NOMINAL');
                }
                
                if (simData.ok) {
                    setVolatility(simData.volatility);
                }
            } catch (err) {
                console.error('Failed to fetch risk status', err);
            }
        };

        const interval = setInterval(fetchData, 5000);
        fetchData();
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="immersive-core-card p-6 rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl hover:shadow-[0_0_30px_rgba(59,130,246,0.2)] transition-all duration-500">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-xs font-mono text-blue-400 tracking-widest uppercase mb-1">Omega Sentinel</h3>
                    <h2 className="text-2xl font-bold text-white tracking-tight">System Health</h2>
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-tighter border ${
                    systemStatus === 'NOMINAL' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' :
                    systemStatus === 'DEGRADED' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' :
                    'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse'
                }`}>
                    {systemStatus}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className="text-[10px] text-slate-400 uppercase mb-1">Market Volatility</div>
                    <div className="text-xl font-mono text-white">{volatility}%</div>
                    <div className="mt-2 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-blue-500 transition-all duration-1000" 
                            style={{ width: `${volatility}%` }}
                        />
                    </div>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className="text-[10px] text-slate-400 uppercase mb-1">Active Alerts</div>
                    <div className="text-xl font-mono text-white">{alerts.length}</div>
                    <div className="text-[9px] text-slate-500 mt-2">SENTINELS ONLINE</div>
                </div>
            </div>

            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                {alerts.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-xs italic">
                        No active breaches detected.
                    </div>
                ) : (
                    alerts.map(alert => (
                        <div key={alert.id} className="p-3 rounded-lg bg-black/40 border-l-2 border-l-blue-500 border border-white/5 flex flex-col gap-1">
                            <div className="flex justify-between items-center">
                                <span className={`text-[9px] font-bold ${
                                    alert.level === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'
                                }`}>
                                    {alert.level}
                                </span>
                                <span className="text-[8px] text-slate-500 font-mono">
                                    {new Date(alert.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                            <div className="text-[11px] text-slate-300 leading-tight">
                                {alert.message}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default RiskPulse;
