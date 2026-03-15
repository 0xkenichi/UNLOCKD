"use client";

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Activity, 
  TrendingUp, 
  Cpu, 
  Layers, 
  Key, 
  Coins, 
  Repeat, 
  Landmark, 
  Zap, 
  Info 
} from 'lucide-react';

interface NodeProps {
  id: string;
  icon: any;
  title: string;
  subtitle: string;
  colorVar: string;
  activeNode: string | null;
  onHover: (id: string | null) => void;
  x: number;
  y: number;
}

const ProNode = ({ id, icon: Icon, title, subtitle, colorVar, activeNode, onHover, x, y }: NodeProps) => {
  const isActive = activeNode === id;
  const isRelated = useMemo(() => {
    if (!activeNode) return false;
    const relationships: Record<string, string[]> = {
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
      <div className="relative">
        <AnimatePresence>
          {(isActive || isRelated) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1.2 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute -inset-4 rounded-full blur-xl opacity-30"
              style={{
                background: `radial-gradient(circle, ${colorVar} 0%, transparent 70%)`,
              }}
            />
          )}
        </AnimatePresence>
        
        <div 
          className="w-16 h-16 rounded-2xl bg-surface-soft backdrop-blur-xl border flex items-center justify-center transition-all duration-300"
          style={{
            borderColor: isActive ? colorVar : 'rgba(255,255,255,0.05)',
            boxShadow: isActive ? `0 0 20px ${colorVar}44` : 'none',
          }}
        >
          <Icon 
            size={32} 
            className="transition-all duration-300"
            style={{ 
              color: isActive ? '#fff' : colorVar,
              filter: isActive ? `drop-shadow(0 0 8px ${colorVar})` : 'none' 
            }} 
          />
        </div>
      </div>
      
      <div className="text-center max-w-[120px]">
        <div 
          className="font-bold text-[10px] uppercase tracking-wider transition-colors duration-300"
          style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.6)' }}
        >
          {title}
        </div>
        {subtitle && (
          <div className="text-[9px] text-secondary mt-0.5 font-medium">
            {subtitle}
          </div>
        )}
      </div>
    </motion.div>
  );
};

interface FlowPathProps {
  start: { x: number; y: number };
  end: { x: number; y: number };
  activeNode: string | null;
  triggerNodes: string[];
  colorVar: string;
  dash?: boolean;
}

const FlowPath = ({ start, end, activeNode, triggerNodes, colorVar, dash = false }: FlowPathProps) => {
  const isActive = activeNode ? triggerNodes.includes(activeNode) : false;
  const isDimmed = activeNode && !isActive;

  const pathData = `M ${start.x}% ${start.y}% L ${end.x}% ${end.y}%`;

  return (
    <g className="transition-opacity duration-400">
      <path
        d={pathData}
        fill="none"
        stroke={isActive ? colorVar : 'rgba(255,255,255,0.1)'}
        strokeWidth={isActive ? 2 : 1}
        strokeDasharray={dash ? "5 5" : "none"}
        className="transition-all duration-500"
        style={{ opacity: isDimmed ? 0.05 : (isActive ? 1 : 0.3) }}
      />
      {isActive && (
        <motion.circle r="2" fill="#fff" className="blur-[1px]">
          <animateMotion 
            dur="3s" 
            repeatCount="indefinite" 
            path={`M ${start.x * 10},${start.y * 10} L ${end.x * 10},${end.y * 10}`} 
            keyPoints="0;1" 
            keyTimes="0;1" 
            calcMode="linear" 
          />
        </motion.circle>
      )}
    </g>
  );
};

export default function ArchitectureVisual() {
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [viewState, setViewState] = useState<'ecosystem' | 'borrow_flow' | 'yield_flow'>('ecosystem');

  const views = {
    ecosystem: { label: 'Full Ecosystem', icon: Layers },
    borrow_flow: { label: 'Borrow flow', icon: Activity },
    yield_flow: { label: 'Yield flow', icon: TrendingUp }
  };

  const nodeData: Record<string, any> = {
    borrowers: { id: 'borrowers', title: "Vesting Holders", subtitle: "Collateral", icon: Key, colorVar: "#2EBEB5", x: 15, y: 25 },
    valuator: { id: 'valuator', title: "DPV Valuator", subtitle: "Risk Engine", icon: Cpu, colorVar: "#2EBEB5", x: 50, y: 25 },
    core: { id: 'core', title: "Vestra Core", subtitle: "Settlement", icon: Shield, colorVar: "#2EBEB5", x: 85, y: 25 },
    lenders: { id: 'lenders', title: "Liquidity Providers", subtitle: "Assets", icon: Coins, colorVar: "#40E0FF", x: 15, y: 65 },
    pool: { id: 'pool', title: "Community Pools", subtitle: "Management", icon: Repeat, colorVar: "#40E0FF", x: 50, y: 65 },
    vault: { id: 'vault', title: "Insurance Vault", subtitle: "Backstop", icon: Landmark, colorVar: "#FF4D4D", x: 85, y: 65 },
  };

  const infoBlocks: Record<string, { title: string; desc: string }> = {
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
    <div className="w-full bg-surface-soft rounded-3xl border border-white/5 grid grid-cols-1 lg:grid-cols-[280px_1fr] min-h-[500px] overflow-hidden shadow-2xl">
      {/* Left Column: Control & Info */}
      <div className="p-8 border-r border-white/5 bg-white/[0.02] flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-accent-teal">
            <Activity size={14} className="animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Visualizer</span>
          </div>
          <h3 className="text-xl font-black font-display text-glow-teal">ARCHITECTURE</h3>
        </div>

        <div className="flex flex-col gap-2">
          {(Object.entries(views) as [any, any][]).map(([key, view]) => (
            <button
              key={key}
              onClick={() => { setViewState(key); setActiveNode(null); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all duration-300 text-left border ${
                viewState === key 
                  ? 'bg-accent-teal/10 border-accent-teal/40 text-glow-teal' 
                  : 'bg-transparent border-transparent text-secondary hover:bg-white/5 hover:text-foreground'
              }`}
            >
              <view.icon size={16} />
              {view.label}
            </button>
          ))}
        </div>

        <div className="mt-auto p-5 rounded-2xl bg-black/40 border border-white/5 backdrop-blur-md">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeNode || 'all'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-2 mb-2" style={{ color: activeNode ? nodeData[activeNode].colorVar : '#2EBEB5' }}>
                <Info size={14} />
                <span className="text-[10px] font-black uppercase tracking-wider">Details</span>
              </div>
              <h4 className="text-sm font-black text-foreground mb-2 uppercase">{currentInfo.title}</h4>
              <p className="text-[11px] text-secondary leading-relaxed font-medium">{currentInfo.desc}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Right Column: Interactive Canvas */}
      <div className="relative overflow-hidden bg-[radial-gradient(circle_at_50%_50%,rgba(46,190,181,0.05),transparent_70%)]">
        <div className="absolute inset-0 p-10">
          {/* Stage Headers */}
          <div className="relative h-5 mb-10 flex justify-between">
            {[
              { label: 'Input Layer', x: 15 },
              { label: 'Logic Layer', x: 50 },
              { label: 'Settlement Layer', x: 85 }
            ].map((stage, i) => (
              <div 
                key={i} 
                className="text-[8px] font-black uppercase tracking-[0.3em] text-foreground/20 whitespace-nowrap"
                style={{ 
                  position: 'absolute',
                  left: `${stage.x}%`,
                  transform: 'translateX(-50%)',
                }}
              >
                {stage.label}
              </div>
            ))}
          </div>

          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
            {/* Viewbox is 1000x1000 for coordinates */}
            <defs>
               <filter id="glow">
                  <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
               </filter>
            </defs>
            <g transform="scale(1)">
              {/* Row 1 Paths (Borrow) */}
              {viewState !== 'yield_flow' && (
                <>
                  <FlowPath start={nodeData.borrowers} end={nodeData.valuator} activeNode={activeNode} triggerNodes={['borrowers', 'valuator']} colorVar="#2EBEB5" />
                  <FlowPath start={nodeData.valuator} end={nodeData.core} activeNode={activeNode} triggerNodes={['valuator', 'core']} colorVar="#2EBEB5" />
                </>
              )}
              
              {/* Row 2 Paths (Yield) */}
              {viewState !== 'borrow_flow' && (
                <>
                  <FlowPath start={nodeData.lenders} end={nodeData.pool} activeNode={activeNode} triggerNodes={['lenders', 'pool']} colorVar="#40E0FF" />
                  <FlowPath start={nodeData.pool} end={nodeData.vault} activeNode={activeNode} triggerNodes={['pool', 'vault']} colorVar="#40E0FF" />
                </>
              )}

              {/* Cross Connect (Settlement Safety) */}
              {viewState === 'ecosystem' && (
                <FlowPath start={nodeData.core} end={nodeData.vault} activeNode={activeNode} triggerNodes={['core', 'vault']} colorVar="#FF4D4D" dash={true} />
              )}
            </g>
          </svg>

          <div className="relative w-full h-full">
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
      </div>
    </div>
  );
}
