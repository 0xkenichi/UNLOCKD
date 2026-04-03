import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Zap, Shield } from 'lucide-react';
import { fetchTestnetPoints } from '../../utils/api';

export default function TestnetPointsBadge({ walletAddress, onOpenLeaderboard }) {
    const [points, setPoints] = useState(null);
    const [loading, setLoading] = useState(false);
    const [prevTotal, setPrevTotal] = useState(0);
    const [justUpdated, setJustUpdated] = useState(false);

    useEffect(() => {
        if (!walletAddress) return;

        const loadPoints = async () => {
            setLoading(true);
            try {
                const data = await fetchTestnetPoints(walletAddress);
                if (data) {
                    if (prevTotal > 0 && data.total_points > prevTotal) {
                        setJustUpdated(true);
                        setTimeout(() => setJustUpdated(false), 2000);
                    }
                    setPoints(data);
                    setPrevTotal(data.total_points);
                }
            } catch (err) {
                console.warn('[testnet-badge] failed to fetch points', err);
            } finally {
                setLoading(false);
            }
        };

        loadPoints();
        const interval = setInterval(loadPoints, 30000); // 30s poll
        return () => clearInterval(interval);
    }, [walletAddress, prevTotal]);

    if (!walletAddress || (!points && !loading)) return null;

    return (
        <div className="testnet-points-badge-container">
            <motion.div 
                className={`testnet-points-badge ${justUpdated ? 'is-pulsing' : ''}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.05 }}
                onClick={onOpenLeaderboard}
            >
                <div className="badge-glow" />
                <div className="badge-content">
                    <div className="badge-icon-stack">
                        <Trophy size={16} className="text-primary-400" />
                        <AnimatePresence>
                            {justUpdated && (
                                <motion.div 
                                    className="update-indicator"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 2, opacity: 0 }}
                                    transition={{ duration: 1 }}
                                >
                                    <Zap size={20} fill="var(--primary-400)" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                    
                    <div className="badge-details">
                        <div className="badge-label">Testnet Points</div>
                        <div className="badge-value">
                            {loading && !points ? '...' : (points?.total_points || 0).toLocaleString()}
                        </div>
                    </div>

                    {points?.multiplier > 1 && (
                        <div className="badge-multiplier" title="Multi-phase reward boost active">
                            <Zap size={10} fill="currentColor" />
                            {points.multiplier.toFixed(1)}x
                        </div>
                    )}
                </div>

                <div className="badge-phase-progress">
                    <div className="progress-fill" style={{ width: '10%' }} />
                </div>
            </motion.div>

            <style jsx>{`
                .testnet-points-badge-container {
                    position: relative;
                }
                .testnet-points-badge {
                    display: flex;
                    flex-direction: column;
                    background: rgba(15, 23, 42, 0.8);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(59, 130, 246, 0.3);
                    border-radius: 12px;
                    padding: 8px 12px;
                    min-width: 140px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), inset 0 0 10px rgba(59, 130, 246, 0.1);
                    overflow: hidden;
                    cursor: pointer;
                    transition: border-color 0.3s;
                }
                .testnet-points-badge:hover {
                    border-color: var(--primary-400);
                }
                .badge-glow {
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%);
                    pointer-events: none;
                }
                .badge-content {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    position: relative;
                    z-index: 1;
                }
                .badge-icon-stack {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .update-indicator {
                    position: absolute;
                    color: var(--primary-400);
                    pointer-events: none;
                }
                .badge-details {
                    display: flex;
                    flex-direction: column;
                }
                .badge-label {
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-secondary);
                    font-weight: 600;
                }
                .badge-value {
                    font-family: var(--font-display);
                    font-size: 18px;
                    color: #fff;
                    line-height: 1;
                    margin-top: 2px;
                    text-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
                }
                .badge-multiplier {
                    margin-left: auto;
                    display: flex;
                    align-items: center;
                    gap: 2px;
                    background: rgba(59, 130, 246, 0.2);
                    color: var(--primary-300);
                    font-size: 10px;
                    font-weight: 700;
                    padding: 2px 6px;
                    border-radius: 20px;
                    border: 1px solid rgba(59, 130, 246, 0.3);
                }
                .badge-phase-progress {
                    margin-top: 8px;
                    height: 2px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 1px;
                    width: 100%;
                }
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, var(--primary-500), var(--primary-300));
                    box-shadow: 0 0 8px var(--primary-500);
                }
                .is-pulsing {
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4); }
                    50% { box-shadow: 0 4px 30px rgba(59, 130, 246, 0.4); border-color: var(--primary-400); }
                    100% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4); }
                }
            `}</style>
        </div>
    );
}
