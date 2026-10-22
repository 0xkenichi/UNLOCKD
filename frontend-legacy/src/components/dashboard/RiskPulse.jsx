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
        <div className="holo-card risk-pulse">
            <div className="risk-pulse__head">
                <div>
                    <h3 className="vx-eyebrow">Omega Sentinel</h3>
                    <h2 className="section-title">System Health</h2>
                </div>
                <div className={`tag ${
                    systemStatus === 'NOMINAL' ? 'success' :
                    systemStatus === 'DEGRADED' ? 'warn' :
                    'danger'
                }`}>
                    {systemStatus}
                </div>
            </div>

            <div className="risk-pulse__stats">
                <div className="stat-card">
                    <div className="stat-label">Market Volatility</div>
                    <div className="stat-value">{volatility}%</div>
                    <div className="risk-pulse__bar">
                        <span style={{ width: `${volatility}%` }} />
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Active Alerts</div>
                    <div className="stat-value">{alerts.length}</div>
                    <div className="stat-label">Sentinels online</div>
                </div>
            </div>

            <div className="risk-pulse__alerts">
                {alerts.length === 0 ? (
                    <div className="muted" style={{ textAlign: 'center', padding: '24px 0', fontSize: 13 }}>
                        No active breaches detected.
                    </div>
                ) : (
                    alerts.map(alert => (
                        <div key={alert.id} className="risk-pulse__alert">
                            <div>
                                <span className={`tag ${
                                    alert.level === 'CRITICAL' ? 'danger' : 'warn'
                                }`}>
                                    {alert.level}
                                </span>
                                <span className="vx-serial">
                                    {new Date(alert.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                            <p>
                                {alert.message}
                            </p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default RiskPulse;
