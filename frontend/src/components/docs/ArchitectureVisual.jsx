import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Lock, Landmark, Briefcase, Coins, Key, TrendingUp, Cpu, Activity, Layers, Repeat, ArrowRight } from 'lucide-react';

// Premium glowing node component
const NextGenNode = ({ id, icon: Icon, title, subtitle, color, x, y, activeKey, onHover, floatDelay = 0 }) => {
    const isActive = activeKey === id || activeKey === 'all';
    const isDimmed = activeKey !== null && activeKey !== id && activeKey !== 'all';

    return (
        <motion.div
            onMouseEnter={() => onHover(id)}
            onMouseLeave={() => onHover(null)}
            style={{
                position: 'absolute',
                top: y,
                left: x,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                zIndex: isActive ? 10 : 2,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
                opacity: isDimmed ? 0.3 : 1,
                scale: isActive ? 1.05 : 1,
                y: isActive ? -5 : [0, -4, 0],
            }}
            transition={{
                y: isActive ? { type: 'spring', stiffness: 300, damping: 20 } : { duration: 4, repeat: Infinity, ease: 'easeInOut', delay: floatDelay },
                opacity: { duration: 0.3 },
                scale: { duration: 0.3 }
            }}
        >
            <div style={{ position: 'relative' }}>
                {isActive && (
                    <motion.div
                        layoutId="node-glow"
                        style={{
                            position: 'absolute', inset: -20, borderRadius: '50%',
                            background: `radial-gradient(circle, rgba(${color}, 0.4) 0%, transparent 70%)`,
                            zIndex: -1
                        }}
                    />
                )}
                <div
                    style={{
                        width: '64px', height: '64px', borderRadius: '20px',
                        background: `linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)`,
                        border: `1px solid rgba(${color}, ${isActive ? 0.6 : 0.2})`,
                        boxShadow: isActive ? `0 8px 32px rgba(${color}, 0.3), inset 0 0 20px rgba(${color}, 0.2)` : '0 4px 16px rgba(0,0,0,0.2)',
                        backdropFilter: 'blur(10px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)'
                    }}
                >
                    <Icon size={32} color={`rgb(${color})`} strokeWidth={isActive ? 2 : 1.5} style={{ transition: 'all 0.3s' }} />
                </div>
            </div>
            <div style={{ textAlign: 'center', width: '100px' }}>
                <div style={{ fontWeight: 700, fontSize: '12px', color: isActive ? '#fff' : '#e2e8f0', letterSpacing: '0.01em', transition: 'color 0.3s' }}>{title}</div>
                {subtitle && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{subtitle}</div>}
            </div>
        </motion.div>
    );
};

// Advanced animated flow line with moving particles
const AdvancedFlowLine = ({ id, start, end, control, color, activeKey, triggerKeys, dash = false }) => {
    const isActive = triggerKeys.includes(activeKey) || activeKey === 'all';
    const pathData = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;

    return (
        <g>
            {/* Base faint line */}
            <path
                d={pathData}
                fill="none"
                stroke={dash ? `rgba(255,255,255,0.1)` : `rgba(${color}, 0.1)`}
                strokeWidth={isActive ? 2 : 1}
                strokeDasharray={dash ? "4 4" : "none"}
                style={{ transition: 'stroke-width 0.3s ease' }}
            />

            {/* Animated gradient flow */}
            {isActive && !dash && (
                <motion.path
                    d={pathData}
                    fill="none"
                    stroke={`url(#grad-${id})`}
                    strokeWidth="3"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                />
            )}

            {/* Moving Particles */}
            {isActive && (
                <>
                    <motion.circle r="3" fill="#fff" filter="blur(1px)">
                        <animateMotion dur="2s" repeatCount="indefinite" path={pathData} />
                    </motion.circle>
                    <motion.circle r="2" fill={`rgb(${color})`} filter={`drop-shadow(0 0 4px rgb(${color}))`}>
                        <animateMotion dur="2s" repeatCount="indefinite" begin="0.5s" path={pathData} />
                    </motion.circle>
                </>
            )}

            <defs>
                <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={`rgba(${color}, 0)`} />
                    <stop offset="50%" stopColor={`rgba(${color}, 0.8)`} />
                    <stop offset="100%" stopColor={`rgba(${color}, 0.2)`} />
                </linearGradient>
            </defs>
        </g>
    );
};

export default function ArchitectureVisual() {
    const [activeNode, setActiveNode] = useState(null);
    const [viewState, setViewState] = useState('ecosystem'); // ecosystem, borrow_flow, yield_flow

    const views = {
        ecosystem: { label: 'Full Ecosystem', icon: Layers },
        borrow_flow: { label: 'Borrow Engine', icon: Activity },
        yield_flow: { label: 'Yield & Vaults', icon: TrendingUp }
    };

    const nodeData = {
        borrowers: { title: "Vesting Holders", subtitle: "Borrowers", icon: Key, color: "59, 130, 246", x: "18%", y: "25%", floatDelay: 0 },
        lenders: { title: "Liquidity Providers", subtitle: "Suppliers", icon: Coins, color: "16, 185, 129", x: "82%", y: "25%", floatDelay: 0.5 },
        valuator: { title: "DPV Valuator", subtitle: "Risk Engine", icon: Cpu, color: "236, 72, 153", x: "32%", y: "50%", floatDelay: 0.2 },
        pool: { title: "Community Pools", subtitle: "Lending logic", icon: Repeat, color: "16, 185, 129", x: "82%", y: "50%", floatDelay: 0.7 },
        core: { title: "Vestra Core", subtitle: "Settlement", icon: Shield, color: "139, 92, 246", x: "50%", y: "75%", floatDelay: 0.3 },
        vault: { title: "Insurance Vault", subtitle: "Backstop", icon: Landmark, color: "245, 158, 11", x: "82%", y: "75%", floatDelay: 0.8 },
    };

    const infoBlocks = {
        borrowers: { title: "Vesting Asset Holders", desc: "Users holding locked tokens (e.g. Sablier, OpenZeppelin) borrow stable liquidity against their unvested allocations." },
        lenders: { title: "Liquidity Providers", desc: "Users deposit USDC into Community Pools to earn a continuous stream of interest from borrower activities." },
        valuator: { title: "DPV Risk Engine", desc: "A Monte Carlo-trained evaluation system that computes the Discounted Present Value of unvested tokens based on TWAP and volatility." },
        pool: { title: "Community Pools", desc: "ERC-4626 standard vaults holding lender deposits. They distribute yield dynamically based on utilization rates." },
        core: { title: "Vestra Core Mechanics", desc: "The central nervous system that orchestrates loan origination, collateral locking, and automatic settlement at the token unlock date." },
        vault: { title: "Insurance Vault (Backstop)", desc: "Funded by a portion of protocol interest. It acts as a strict-recourse backstop, liquidating bad debt internally to protect lenders." },
        all: { title: "Vestra V2 Engine", desc: "Select a tab or hover over the ecosystem nodes to explore the technical flow of liquidity and risk mitigation." }
    };

    const currentInfo = activeNode ? infoBlocks[activeNode] : infoBlocks.all;

    return (
        <div style={{
            width: '100%',
            background: 'linear-gradient(180deg, rgba(4, 7, 14, 0.4) 0%, rgba(13, 17, 26, 0.8) 100%)',
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: 'var(--font-family)'
        }}>

            {/* Dynamic Background Noise/Glow */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(circle at 50% 100%, rgba(59, 130, 246, 0.08) 0%, transparent 60%)',
                pointerEvents: 'none', zIndex: 0
            }} />

            {/* Header Tabs */}
            <div style={{
                display: 'flex', gap: '8px', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: 'rgba(255,255,255,0.02)', position: 'relative', zIndex: 20
            }}>
                {Object.entries(views).map(([key, view]) => (
                    <button
                        key={key}
                        onClick={() => { setViewState(key); setActiveNode(null); }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '12px',
                            border: '1px solid transparent',
                            background: viewState === key ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            borderColor: viewState === key ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
                            color: viewState === key ? '#fff' : '#94a3b8',
                            fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                        }}
                    >
                        <view.icon size={16} />
                        {view.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', '@media(min-width: 900px)': { gridTemplateColumns: 'minmax(250px, 1fr) 2.5fr' }, minHeight: '440px' }}>

                {/* Left Side: Info Panel */}
                <div style={{ padding: '32px', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 10 }}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeNode || viewState}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                                <Cpu size={20} color="#60a5fa" />
                            </div>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                                {currentInfo.title}
                            </h4>
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px', lineHeight: 1.5 }}>
                                {currentInfo.desc}
                            </p>

                            <div style={{ marginTop: '32px', display: 'flex', alignItems: 'center', gap: '8px', color: '#60a5fa', fontSize: '13px', fontWeight: 600, cursor: 'pointer', width: 'fit-content' }}>
                                Explore Technical Spec <ArrowRight size={14} />
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Right Side: Interactive Node Canvas */}
                <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '440px', zIndex: 5 }}>

                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                        {/* Background structural lines */}
                        <path d="M 18% 25% L 18% 75% L 50% 75%" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="4 4" />
                        <path d="M 82% 25% L 82% 75% L 50% 75%" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="4 4" />

                        {(viewState === 'ecosystem' || viewState === 'borrow_flow') && (
                            <>
                                <AdvancedFlowLine id="b-v" start={{ x: "18%", y: "25%" }} control={{ x: "18%", y: "50%" }} end={{ x: "32%", y: "50%" }} color="59, 130, 246" activeKey={activeNode} triggerKeys={['borrowers', 'valuator']} />
                                <AdvancedFlowLine id="v-c" start={{ x: "32%", y: "50%" }} control={{ x: "32%", y: "75%" }} end={{ x: "50%", y: "75%" }} color="236, 72, 153" activeKey={activeNode} triggerKeys={['valuator', 'core']} />
                            </>
                        )}

                        {(viewState === 'ecosystem' || viewState === 'yield_flow') && (
                            <>
                                <AdvancedFlowLine id="l-p" start={{ x: "82%", y: "25%" }} control={{ x: "82%", y: "40%" }} end={{ x: "82%", y: "50%" }} color="16, 185, 129" activeKey={activeNode} triggerKeys={['lenders', 'pool']} />
                                <AdvancedFlowLine id="p-c" start={{ x: "82%", y: "50%" }} control={{ x: "70%", y: "50%" }} end={{ x: "50%", y: "75%" }} color="16, 185, 129" activeKey={activeNode} triggerKeys={['pool', 'core']} />
                                <AdvancedFlowLine id="c-v" start={{ x: "50%", y: "75%" }} control={{ x: "65%", y: "75%" }} end={{ x: "82%", y: "75%" }} color="245, 158, 11" activeKey={activeNode} triggerKeys={['core', 'vault']} dash={true} />
                            </>
                        )}
                    </svg>

                    {/* Render Nodes based on viewState */}
                    <AnimatePresence>
                        {(viewState === 'ecosystem' || viewState === 'borrow_flow') && (
                            <>
                                <NextGenNode {...nodeData.borrowers} activeKey={activeNode} onHover={setActiveNode} />
                                <NextGenNode {...nodeData.valuator} activeKey={activeNode} onHover={setActiveNode} />
                            </>
                        )}

                        {(viewState === 'ecosystem' || viewState === 'yield_flow') && (
                            <>
                                <NextGenNode {...nodeData.lenders} activeKey={activeNode} onHover={setActiveNode} />
                                <NextGenNode {...nodeData.pool} activeKey={activeNode} onHover={setActiveNode} />
                                <NextGenNode {...nodeData.vault} activeKey={activeNode} onHover={setActiveNode} />
                            </>
                        )}

                        <NextGenNode {...nodeData.core} activeKey={activeNode} onHover={setActiveNode} />
                    </AnimatePresence>

                </div>
            </div>
        </div>
    );
}
