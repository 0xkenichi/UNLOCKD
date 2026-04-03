"use client";

import React, { useState, useEffect } from 'react';
import { api } from '@/utils/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Activity, ShieldAlert, Zap, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const RiskPulse = () => {
    const [alerts, setAlerts] = useState<any[]>([]);
    const [systemStatus, setSystemStatus] = useState('NOMINAL');
    const [volatility, setVolatility] = useState(10);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [alertData, simData] = await Promise.all([
                    api.fetchOmegaAlerts(),
                    api.fetchSimulationState()
                ]);
                
                if (alertData) {
                    setAlerts(alertData.alerts || []);
                    const hasCritical = (alertData.alerts || []).some((a: any) => a.level === 'CRITICAL');
                    const hasWarning = (alertData.alerts || []).some((a: any) => a.level === 'WARNING');
                    setSystemStatus(hasCritical ? 'CRITICAL' : hasWarning ? 'DEGRADED' : 'NOMINAL');
                }
                
                if (simData) {
                    setVolatility(simData.volatility || 10);
                }
            } catch (err) {
                console.error('Failed to fetch risk status', err);
            } finally {
                setLoading(false);
            }
        };

        const interval = setInterval(fetchData, 5000);
        fetchData();
        return () => clearInterval(interval);
    }, []);

    const statusColors: Record<string, string> = {
        NOMINAL: 'text-accent-teal border-accent-teal/30 bg-accent-teal/10',
        DEGRADED: 'text-accent-orange border-accent-orange/30 bg-accent-orange/10',
        CRITICAL: 'text-accent-red border-accent-red/30 bg-accent-red/10 animate-pulse-fast'
    };

    return (
        <Card variant="glass" className="border border-white/5 bg-surface/30 backdrop-blur-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle className="text-sm font-black uppercase italic tracking-widest text-secondary flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" />
                        Omega Sentinel
                    </CardTitle>
                    <h2 className="text-xl font-black text-white uppercase italic tracking-tighter mt-1">System Health</h2>
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-black border tracking-widest ${statusColors[systemStatus] || statusColors.NOMINAL}`}>
                    {systemStatus}
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                        <div className="text-[10px] text-secondary uppercase font-black tracking-widest mb-1 opacity-50">Volatility</div>
                        <div className="text-2xl font-mono font-black text-white">{volatility}%</div>
                        <div className="mt-3 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                                className="h-full bg-accent-teal shadow-glow-teal" 
                                initial={{ width: 0 }}
                                animate={{ width: `${volatility}%` }}
                                transition={{ duration: 1 }}
                            />
                        </div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                        <div className="text-[10px] text-secondary uppercase font-black tracking-widest mb-1 opacity-50">Active Alerts</div>
                        <div className="text-2xl font-mono font-black text-white italic">{alerts.length}</div>
                        <div className="text-[8px] text-secondary font-black uppercase mt-2 tracking-tighter opacity-30">SENTINELS ONLINE</div>
                    </div>
                </div>

                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-accent-teal opacity-50" />
                        </div>
                    ) : alerts.length === 0 ? (
                        <div className="text-center py-8 text-secondary text-[10px] uppercase font-black italic opacity-30 tracking-widest">
                            No active breaches detected
                        </div>
                    ) : (
                        <AnimatePresence initial={false}>
                            {alerts.map((alert, i) => (
                                <motion.div 
                                    key={alert.id || i}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="p-3 rounded-xl bg-black/40 border-l-2 border-l-accent-teal border border-white/5 flex flex-col gap-1"
                                >
                                    <div className="flex justify-between items-center">
                                        <span className={`text-[9px] font-black uppercase tracking-widest ${
                                            alert.level === 'CRITICAL' ? 'text-accent-red' : 'text-accent-orange'
                                        }`}>
                                            {alert.level}
                                        </span>
                                        <span className="text-[8px] text-secondary font-mono opacity-50">
                                            {new Date(alert.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-white/80 font-medium leading-tight italic">
                                        {alert.message}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
