import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Shield, Zap, TrendingUp, Users, Award } from 'lucide-react';
import { fetchTestnetLeaderboard } from '../../utils/api';

const PHASES = [
    { id: 'genesis', name: 'Phase 1: Genesis', range: '0 - 1,000 Users', weight: '10%' },
    { id: 'liquidity', name: 'Phase 2: Liquidity', range: '1,000 - 5,000 Users', weight: '30%' },
    { id: 'privacy', name: 'Phase 3: Privacy', range: '5,000 - 8,000 Users', weight: '40%' },
    { id: 'terminal', name: 'Phase 4: Terminal', range: '8,000 - 10,000 Users', weight: '20%' },
];

export default function TestnetLeaderboard() {
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPhase, setCurrentPhase] = useState('genesis');

    useEffect(() => {
        const loadBoard = async () => {
            setLoading(true);
            try {
                const data = await fetchTestnetLeaderboard(50);
                setLeaderboard(data || []);
            } catch (err) {
                console.error('[leaderboard] failed to fetch', err);
            } finally {
                setLoading(false);
            }
        };
        loadBoard();
    }, []);

    const totalUsers = 150; // Mock current count for progress
    const progressToGoal = (totalUsers / 1000) * 100; // Phase 1 goal is 1000

    return (
        <section className="testnet-leaderboard page">
            <div className="page-header">
                <div>
                    <h1>$CREDT Incentivized Testnet</h1>
                    <p className="muted">
                        2% of total $CREDT supply allocated to the top 10,000 pioneers. 
                        Hardening the protocol, building the future of credit.
                    </p>
                </div>
                <div className="phase-tracker">
                    <div className="phase-badge active">Phase 1: Genesis</div>
                    <div className="phase-stats">
                        <Users size={14} className="text-primary-400" />
                        <span>{totalUsers} / 1,000 Target</span>
                    </div>
                </div>
            </div>

            <div className="phases-grid">
                {PHASES.map((p) => (
                    <div key={p.id} className={`phase-card ${currentPhase === p.id ? 'active' : ''}`}>
                        <div className="phase-title">{p.name}</div>
                        <div className="phase-subtitle">{p.range}</div>
                        <div className="phase-weight">Weight: {p.weight}</div>
                        {currentPhase === p.id && (
                            <div className="phase-progress-track">
                                <motion.div 
                                    className="phase-progress-bar"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progressToGoal}%` }}
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="leaderboard-section">
                <div className="holo-card">
                    <div className="section-head">
                        <div className="flex items-center gap-2">
                            <Trophy size={20} className="text-yellow-400" />
                            <h3 className="section-title">Top Protocol Contributors</h3>
                        </div>
                        <div className="tag success">Live Standings</div>
                    </div>

                    <div className="data-table">
                        <div className="table-row header">
                            <div style={{ width: '60px' }}>Rank</div>
                            <div>Pioneer Address</div>
                            <div style={{ textAlign: 'right' }}>Total Points</div>
                            <div className="hidden-mobile">Multipliers</div>
                            <div style={{ textAlign: 'right' }}>Activity</div>
                        </div>

                        {loading ? (
                            <div className="loading-shimmer-list">
                                {[1, 2, 3, 4, 5].map(i => <div key={i} className="shimmer-row" />)}
                            </div>
                        ) : (
                            leaderboard.map((user, index) => (
                                <motion.div 
                                    key={user.wallet_address}
                                    className="table-row"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                >
                                    <div style={{ width: '60px' }} className="rank-cell">
                                        {index === 0 && <Award size={16} className="text-yellow-400" />}
                                        {index === 1 && <Award size={16} className="text-slate-300" />}
                                        {index === 2 && <Award size={16} className="text-orange-400" />}
                                        {index > 2 && `#${index + 1}`}
                                    </div>
                                    <div className="address-cell mono text-primary-300">
                                        {user.wallet_address.slice(0, 6)}...{user.wallet_address.slice(-4)}
                                    </div>
                                    <div style={{ textAlign: 'right' }} className="points-cell text-white font-bold">
                                        {user.total_points.toLocaleString()}
                                    </div>
                                    <div className="hidden-mobile">
                                        <div className="multiplier-tags">
                                            {user.multiplier > 1 && <span className="tag-outline"><Zap size={10} /> {user.multiplier}x</span>}
                                            {user.privacy_points > 0 && <span className="tag-outline"><Shield size={10} /> Private</span>}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }} className="activity-cell">
                                        <div className="activity-dots">
                                            <TrendingUp size={14} className="text-green-500" />
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <style jsx>{`
                .testnet-leaderboard {
                    padding: 20px;
                }
                .phase-tracker {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    gap: 8px;
                }
                .phase-badge {
                    padding: 4px 12px;
                    border-radius: 20px;
                    background: rgba(59, 130, 246, 0.1);
                    border: 1px solid rgba(59, 130, 246, 0.3);
                    color: var(--primary-400);
                    font-size: 12px;
                    font-weight: 700;
                }
                .phase-badge.active {
                    background: var(--primary-500);
                    color: #fff;
                    box-shadow: 0 0 15px rgba(59, 130, 246, 0.4);
                }
                .phase-stats {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 13px;
                    color: var(--text-secondary);
                }
                .phases-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                    margin: 32px 0;
                }
                .phase-card {
                    padding: 20px;
                    background: rgba(30, 41, 59, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 16px;
                    position: relative;
                    overflow: hidden;
                }
                .phase-card.active {
                    border-color: rgba(59, 130, 246, 0.4);
                    background: rgba(59, 130, 246, 0.05);
                }
                .phase-title {
                    font-family: var(--font-display);
                    font-size: 16px;
                    color: #fff;
                    margin-bottom: 4px;
                }
                .phase-subtitle {
                    font-size: 12px;
                    color: var(--text-secondary);
                    margin-bottom: 8px;
                }
                .phase-weight {
                    font-size: 11px;
                    color: var(--primary-400);
                    font-weight: 700;
                    text-transform: uppercase;
                }
                .phase-progress-track {
                    margin-top: 16px;
                    height: 4px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 2px;
                    overflow: hidden;
                }
                .phase-progress-bar {
                    height: 100%;
                    background: var(--primary-500);
                    box-shadow: 0 0 10px var(--primary-500);
                }
                .leaderboard-section {
                    margin-top: 40px;
                }
                .rank-cell {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 800;
                    color: var(--text-secondary);
                }
                .multiplier-tags {
                    display: flex;
                    gap: 8px;
                }
                .tag-outline {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 2px 8px;
                    border-radius: 4px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    font-size: 10px;
                    color: var(--text-secondary);
                }
                .shimmer-row {
                    height: 48px;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
                    background-size: 200% 100%;
                    animation: shimmer 2s infinite;
                    border-radius: 8px;
                    margin-bottom: 8px;
                }
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                @media (max-width: 768px) {
                    .hidden-mobile { display: none; }
                }
            `}</style>
        </section>
    );
}
