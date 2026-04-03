// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Activity, TrendingUp, Cpu, Layers, Key, Coins, Repeat, Landmark, Zap, Info } from 'lucide-react';

/**
 * Premium redesigned Node component
 */
const ProNode = ({ id, icon: Icon, title, subtitle, colorVar, activeNode, onHover, x, y }) => {
    const isActive = activeNode === id;
    const isRelated = useMemo(() => {
        if (!activeNode) return false;
        const relationships = {
            borrowers: ['valuator', 'core'],
            lenders: ['pool', 'core'],
            valuator: ['borrowers', 'core'],
            pool: ['lenders', 'core'],
            core: ['borrowers', 'lenders', 'valuator', 'pool', 'vault'],
            vault: ['core']
        };
        return relationships[activeNode]?.includes(id);
    }, [activeNode, id]);

    const isDimmed = activeNode && !isActive && !isRelated;

    return (
        <motion.div
            onMouseEnter={() => onHover(id)}
            onMouseLeave={() => onHover(null)}
            style={{
                position: 'absolute',
                top: `${y}%`,
                left: `${x}%`,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                zIndex: isActive ? 50 : (isRelated ? 30 : 10),
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
                opacity: isDimmed ? 0.3 : 1,
                scale: isActive ? 1.05 : 1,
                y: isActive ? `${y - 1}%` : `${y}%`,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
            <div style={{ position: 'relative' }}>
                <AnimatePresence>
                    {(isActive || isRelated) && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1.2 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            style={{
                                position: 'absolute',
                                inset: -15,
                                borderRadius: '50%',
                                background: `radial-gradient(circle, var(${colorVar}, rgba(59, 130, 246, 0.4)) 0%, transparent 70%)`,
                                filter: 'blur(8px)',
                                opacity: isActive ? 0.5 : 0.2,
                                zIndex: -1
                            }}
                        />
                    )}
                </AnimatePresence>
                
                <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '16px',
                    background: 'var(--glass-bg)',
                    backdropFilter: 'blur(12px)',
                    border: `1px solid ${isActive ? `var(${colorVar})` : 'var(--glass-border)'}`,
                    boxShadow: isActive ? `0 0 20px var(${colorVar}), inset 0 0 10px rgba(255,255,255,0.1)` : 'var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s'
                }}>
                    <Icon 
                        size={32} 
                        color={isActive ? '#fff' : `var(${colorVar})`} 
                        style={{ filter: isActive ? `drop-shadow(0 0 8px #fff)` : 'none', transition: 'all 0.3s' }} 
                    />
                </div>
            </div>
            
            <div style={{ textAlign: 'center', maxWidth: '100px' }}>
                <div style={{ 
                    fontWeight: 800, 
                    fontSize: '11px', 
                    color: isActive ? '#fff' : 'var(--text-primary)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    fontFamily: 'var(--font-display)',
                }}>
                    {title}
                </div>
                {subtitle && (
                    <div style={{ 
                        fontSize: '10px', 
                        color: 'var(--text-muted)', 
                        marginTop: '1px',
                        fontWeight: 600
                    }}>
                        {subtitle}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

const FlowPath = ({ start, end, activeNode, triggerNodes, colorVar, dash = false }) => {
    const isActive = triggerNodes.includes(activeNode);
    const isDimmed = activeNode && !isActive;

    // Direct lines for aligned nodes
    const pathData = `M ${start.x}% ${start.y}% L ${end.x}% ${end.y}%`;

    return (
        <g style={{ transition: 'opacity 0.4s' }}>
            <path
                d={pathData}
                fill="none"
                stroke={isActive ? `var(${colorVar})` : 'var(--border-primary)'}
                strokeWidth={isActive ? 2.5 : 1}
                strokeDasharray={dash ? "5 5" : "none"}
                opacity={isDimmed ? 0.1 : (isActive ? 1 : 0.3)}
                style={{ transition: 'all 0.4s' }}
            />
            {isActive && (
                <motion.circle r="2.5" fill="#fff" filter="blur(1px)">
                    <animateMotion dur="2.5s" repeatCount="indefinite" path={`M ${start.x * 10},${start.y * 10} L ${end.x * 10},${end.y * 10}`} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
                </motion.circle>
            )}
        </g>
    );
};

export default function ArchitectureVisual() {
    const [activeNode, setActiveNode] = useState(null);
    const [viewState, setViewState] = useState('ecosystem');

    const views = {
        ecosystem: { label: 'Full Ecosystem', icon: Layers },
        borrow_flow: { label: 'Borrow flow', icon: Activity },
        yield_flow: { label: 'Yield flow', icon: TrendingUp }
    };

    const nodeData = {
        borrowers: { id: 'borrowers', title: "Vesting Holders", subtitle: "Collateral", icon: Key, colorVar: "--primary-400", x: 15, y: 18 },
        valuator: { id: 'valuator', title: "DPV Valuator", subtitle: "Risk Engine", icon: Cpu, colorVar: "--primary-400", x: 50, y: 18 },
        core: { id: 'core', title: "Vestra Core", subtitle: "Settlement", icon: Shield, colorVar: "--primary-400", x: 85, y: 18 },
        lenders: { id: 'lenders', title: "Liquidity Providers", subtitle: "Assets", icon: Coins, colorVar: "--success-400", x: 15, y: 52 },
        pool: { id: 'pool', title: "Community Pools", subtitle: "Management", icon: Repeat, colorVar: "--success-400", x: 50, y: 52 },
        vault: { id: 'vault', title: "Insurance Vault", subtitle: "Backstop", icon: Landmark, colorVar: "--warning-400", x: 85, y: 52 },
    };

    const infoBlocks = {
        borrowers: { title: "Vesting Asset Holders", desc: "Unlock liquidity from locked tokens (Sablier, Streamflow, etc.) without selling your long-term upside." },
        lenders: { title: "Liquidity Providers", desc: "Supply stable assets into the protocol to earn optimized, risk-adjusted yield from borrowing activities." },
        valuator: { title: "DPV Risk Engine", desc: "Advanced Monte Carlo calculations determine the Discounted Present Value of vesting claims in real-time." },
        pool: { title: "ERC-4626 Pools", desc: "Standardized liquidity vaults that optimize capital allocation and ensure deep liquidity for borrowers." },
        core: { title: "Vestra Settlement Core", desc: "The definitive engine managing loan states, automated unlock captures, and non-custodial debt settlement." },
        vault: { title: "Protocol Safety Vault", desc: "A robust backstop funded by protocol fees to ensure lender security and internal debt liquidation." },
        all: { title: "Vestra V2 Engine", desc: "A streamlined credit infrastructure for the next generation of on-chain assets. Hover nodes to explore." }
    };

    const currentInfo = activeNode ? infoBlocks[activeNode] : infoBlocks.all;

    return (
        <div style={{
            width: '100%',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--border-primary)',
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 1fr) 2.5fr',
            minHeight: '600px',
            overflow: 'hidden',
            fontFamily: 'var(--font-family)',
            boxShadow: 'var(--shadow-lg)'
        }}>
            {/* Left Column: Control & Info */}
            <div style={{
                padding: '32px',
                borderRight: '1px solid var(--border-secondary)',
                background: 'rgba(255,255,255,0.01)',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-400)' }}>
                        <Activity size={18} />
                        <span style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Visualizer</span>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '24px', fontWeight: 800, fontFamily: 'var(--font-display)', color: '#fff' }}>Vestra V2</h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {Object.entries(views).map(([key, view]) => (
                        <button
                            key={key}
                            onClick={() => { setViewState(key); setActiveNode(null); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderRadius: 'var(--radius-md)',
                                background: viewState === key ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                border: `1px solid ${viewState === key ? 'var(--primary-400)' : 'transparent'}`,
                                color: viewState === key ? '#fff' : 'var(--text-muted)',
                                fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left'
                            }}
                        >
                            <view.icon size={16} />
                            {view.label}
                        </button>
                    ))}
                </div>

                <div style={{ marginTop: 'auto', padding: '20px', borderRadius: 'var(--radius-lg)', background: 'var(--surface-glass)', border: '1px solid var(--border-secondary)' }}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeNode || 'all'}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: activeNode ? `var(${nodeData[activeNode].colorVar})` : 'var(--primary-400)' }}>
                                <Info size={16} />
                                <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>Details</span>
                            </div>
                            <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#fff', fontWeight: 800 }}>{currentInfo.title}</h4>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.6 }}>{currentInfo.desc}</p>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Right Column: Interactive Canvas */}
            <div style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, padding: '40px' }}>
                    {/* Stage Headers */}
                    <div style={{ position: 'relative', height: '20px', marginBottom: '20px' }}>
                        {[
                            { label: 'Input Layer', x: 15 },
                            { label: 'Logic Layer', x: 50 },
                            { label: 'Settlement Layer', x: 85 }
                        ].map((stage, i) => (
                            <div 
                                key={i} 
                                style={{ 
                                    position: 'absolute',
                                    left: `${stage.x}%`,
                                    transform: 'translateX(-50%)',
                                    fontSize: '10px', 
                                    fontWeight: 800, 
                                    textTransform: 'uppercase', 
                                    letterSpacing: '0.1em', 
                                    color: 'var(--text-disabled)',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {stage.label}
                            </div>
                        ))}
                    </div>

                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                        {/* Row 1 Paths (Borrow) */}
                        {viewState !== 'yield_flow' && (
                            <>
                                <FlowPath start={nodeData.borrowers} end={nodeData.valuator} activeNode={activeNode} triggerNodes={['borrowers', 'valuator']} colorVar="--primary-400" />
                                <FlowPath start={nodeData.valuator} end={nodeData.core} activeNode={activeNode} triggerNodes={['valuator', 'core']} colorVar="--primary-400" />
                            </>
                        )}
                        
                        {/* Row 2 Paths (Yield) */}
                        {viewState !== 'borrow_flow' && (
                            <>
                                <FlowPath start={nodeData.lenders} end={nodeData.pool} activeNode={activeNode} triggerNodes={['lenders', 'pool']} colorVar="--success-400" />
                                <FlowPath start={nodeData.pool} end={nodeData.vault} activeNode={activeNode} triggerNodes={['pool', 'vault']} colorVar="--success-400" />
                            </>
                        )}

                        {/* Cross Connect (Settlement Safety) */}
                        {viewState === 'ecosystem' && (
                            <FlowPath start={nodeData.core} end={nodeData.vault} activeNode={activeNode} triggerNodes={['core', 'vault']} colorVar="--warning-400" dash={true} />
                        )}
                    </svg>

                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        {viewState !== 'yield_flow' && (
                            <>
                                <ProNode {...nodeData.borrowers} activeNode={activeNode} onHover={setActiveNode} />
                                <ProNode {...nodeData.valuator} activeNode={activeNode} onHover={setActiveNode} />
                                <ProNode {...nodeData.core} activeNode={activeNode} onHover={setActiveNode} />
                            </>
                        )}

                        {viewState !== 'borrow_flow' && (
                            <>
                                <ProNode {...nodeData.lenders} activeNode={activeNode} onHover={setActiveNode} />
                                <ProNode {...nodeData.pool} activeNode={activeNode} onHover={setActiveNode} />
                                <ProNode {...nodeData.vault} activeNode={activeNode} onHover={setActiveNode} />
                            </>
                        )}
                    </div>
                </div>

                {/* Ambient background glow */}
                <div style={{
                    position: 'absolute', inset: 0,
                    background: 'radial-gradient(circle at 70% 50%, rgba(59, 130, 246, 0.05) 0%, transparent 60%)',
                    pointerEvents: 'none', zIndex: 0
                }} />
            </div>
        </div>
    );
}
