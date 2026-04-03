"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  FileText, 
  ChevronRight, 
  Clock, 
  User, 
  Tag, 
  ExternalLink,
  BookOpen
} from "lucide-react";
import ArchitectureVisual from "@/components/docs/ArchitectureVisual";
import { Card, CardContent } from "@/components/ui/Card";

interface Doc {
  id: string;
  title: string;
  content: string;
}

const TokenomicsVisual = () => {
  return (
    <div className="w-full bg-surface-soft rounded-3xl border border-white/5 p-8 overflow-hidden shadow-2xl transition-all duration-500 hover:border-accent-teal/30">
      <svg className="w-full h-auto" viewBox="0 0 800 300">
        <defs>
          <linearGradient id="grad-core" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2EBEB5" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#2EBEB5" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="grad-community" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#40E0FF" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#40E0FF" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="grad-team" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FF4D4D" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#FF4D4D" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="grad-treasury" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.4" />
          </linearGradient>

          <filter id="glow-teal">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Title Group */}
        <text x="40" y="55" fill="white" fontSize="22" fontWeight="900" letterSpacing="0.05em" fontFamily="Inter">TOKENOMICS STRUCTURE</text>
        <text x="40" y="80" fill="rgba(255,255,255,0.4)" fontSize="12" fontWeight="500">Distribution aligned with long-term protocol maturity milestones</text>

        {/* Timeline background lines */}
        <path d="M 440 40 L 440 260" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
        <path d="M 540 40 L 540 260" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
        <path d="M 720 40 L 720 260" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />

        <text x="440" y="30" fill="rgba(255,255,255,0.3)" fontSize="10" textAnchor="middle" fontWeight="800">TGE</text>
        <text x="540" y="30" fill="rgba(255,255,255,0.3)" fontSize="10" textAnchor="middle" fontWeight="800">CLIFF (1Y)</text>
        <text x="720" y="30" fill="rgba(255,255,255,0.3)" fontSize="10" textAnchor="middle" fontWeight="800">FULL VEST (4Y)</text>

        {/* Core Ecosystem */}
        <g transform="translate(40, 110)">
          <rect x="0" y="0" width="220" height="24" rx="12" fill="url(#grad-core)" filter="url(#glow-teal)" />
          <text x="235" y="16" fill="white" fontSize="13" fontWeight="800">CORE ECOSYSTEM (40%)</text>
          <line x1="400" y1="12" x2="680" y2="12" stroke="#2EBEB5" strokeWidth="2" strokeOpacity="0.3" />
          <circle cx="400" cy="12" r="6" fill="#2EBEB5" />
          <circle cx="680" cy="12" r="5" fill="#2EBEB5" fillOpacity="0.4" />
        </g>

        {/* Community Programs */}
        <g transform="translate(40, 150)">
          <rect x="0" y="0" width="160" height="24" rx="12" fill="url(#grad-community)" />
          <text x="175" y="16" fill="white" fontSize="13" fontWeight="800">COMMUNITY & LIQUIDITY (25%)</text>
          <line x1="400" y1="12" x2="500" y2="12" stroke="#40E0FF" strokeWidth="2" strokeOpacity="0.3" />
          <circle cx="400" cy="12" r="6" fill="#40E0FF" />
          <circle cx="500" cy="12" r="5" fill="#40E0FF" fillOpacity="0.4" />
        </g>

        {/* Team & Contributors */}
        <g transform="translate(40, 190)">
          <rect x="0" y="0" width="120" height="24" rx="12" fill="url(#grad-team)" />
          <text x="135" y="16" fill="white" fontSize="13" fontWeight="800">TEAM & CONTRIBUTORS (20%)</text>
          <line x1="500" y1="12" x2="680" y2="12" stroke="#FF4D4D" strokeWidth="2" strokeOpacity="0.3" strokeDasharray="3 3" />
          <circle cx="500" cy="12" r="6" fill="#FF4D4D" />
          <circle cx="680" cy="12" r="5" fill="#FF4D4D" fillOpacity="0.4" />
        </g>

        {/* Treasury Reserve */}
        <g transform="translate(40, 230)">
          <rect x="0" y="0" width="100" height="24" rx="12" fill="url(#grad-treasury)" />
          <text x="115" y="16" fill="white" fontSize="13" fontWeight="800">TREASURY RESERVE (15%)</text>
          <line x1="400" y1="12" x2="680" y2="12" stroke="#8B5CF6" strokeWidth="2" strokeOpacity="0.3" strokeDasharray="2 4" />
          <circle cx="400" cy="12" r="6" fill="#8B5CF6" />
        </g>

        <text x="400" y="285" fill="rgba(255,255,255,0.2)" fontSize="10" textAnchor="middle" fontWeight="700">MODERNIZED FOR V2 PROTOCOL ENGINE</text>
      </svg>
    </div>
  );
};

export const DocsClient = ({ initialDocs }: { initialDocs: Doc[] }) => {
  const [activeId, setActiveId] = useState(initialDocs[0].id);
  const [search, setSearch] = useState("");

  const filteredDocs = useMemo(() => {
    return initialDocs.filter(doc => 
      doc.title.toLowerCase().includes(search.toLowerCase()) || 
      doc.content.toLowerCase().includes(search.toLowerCase())
    );
  }, [initialDocs, search]);

  const activeDoc = useMemo(() => 
    initialDocs.find(doc => doc.id === activeId) || initialDocs[0], 
  [initialDocs, activeId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-12 items-start">
      {/* Sidebar Navigation */}
      <aside className="space-y-8 sticky top-8">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary group-focus-within:text-accent-teal transition-colors" />
          <input 
            type="text" 
            placeholder="Search docs..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-soft border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-accent-teal transition-all"
          />
        </div>

        <nav className="flex flex-col gap-1">
          {filteredDocs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setActiveId(doc.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all duration-300 text-left border ${
                activeId === doc.id 
                  ? 'bg-accent-teal/10 border-accent-teal/40 text-glow-teal shadow-[0_0_15px_rgba(46,190,181,0.1)]' 
                  : 'bg-transparent border-transparent text-secondary hover:bg-white/5 hover:text-foreground'
              }`}
            >
              <FileText size={16} className={activeId === doc.id ? "text-accent-teal" : ""} />
              <span className="truncate">{doc.title}</span>
              {activeId === doc.id && (
                <motion.div layoutId="active-indicator" className="ml-auto">
                    <ChevronRight size={14} />
                </motion.div>
              )}
            </button>
          ))}
        </nav>

        <Card variant="glass" className="p-6">
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-cyan mb-4">Support</h4>
          <p className="text-[11px] text-secondary leading-relaxed mb-4">
            Need custom integration help or have technical questions? Join our builder community.
          </p>
          <button className="w-full py-3 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">
            Join Discord
          </button>
        </Card>
      </aside>

      {/* Main Content Area */}
      <main className="space-y-10 min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeId}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
            className="space-y-10"
          >
             <article className="prose prose-invert prose-vestra max-w-none bg-surface-soft border border-white/5 p-10 rounded-[32px] shadow-2xl relative overflow-hidden">
                {/* Aesthetic overlays */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-accent-teal/5 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent-cyan/5 blur-[100px] rounded-full pointer-events-none" />

                <div className="flex items-center gap-3 mb-10 text-[10px] font-bold text-secondary uppercase tracking-widest">
                   <BookOpen size={14} className="text-accent-teal" />
                   <span>Verified Specification</span>
                   <span className="w-1 h-1 rounded-full bg-white/10" />
                   <span>Vestra Core v2.0</span>
                </div>

                {/* Visuals based on ID - Moved inside article for better flow */}
                {activeId === 'whitepaper' && <div className="mb-12"><ArchitectureVisual /></div>}
                {activeId === 'tokenomics' && <div className="mb-12"><TokenomicsVisual /></div>}

              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({node, ...props}) => <h1 className="text-4xl font-black font-display text-foreground mb-8 border-b border-white/5 pb-4" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-2xl font-black font-display text-foreground mt-12 mb-6" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-xl font-bold text-foreground mt-8 mb-4 uppercase tracking-tighter" {...props} />,
                    p: ({node, ...props}) => <p className="text-secondary leading-relaxed mb-6 text-sm lg:text-base font-medium" {...props} />,
                    li: ({node, ...props}) => <li className="text-secondary text-sm lg:text-base mb-2 font-medium" {...props} />,
                    strong: ({node, ...props}) => <strong className="text-foreground font-black" {...props} />,
                    code: ({node, ...props}) => {
                        const isInline = !props.className;
                        return isInline 
                            ? <code className="bg-white/5 px-1.5 py-0.5 rounded-md text-accent-teal text-xs font-mono" {...props} />
                            : <code className="block bg-black/40 p-6 rounded-2xl border border-white/5 text-sm font-mono overflow-x-auto my-6" {...props} />;
                    },
                    blockquote: ({node, ...props}) => (
                        <blockquote className="border-l-4 border-accent-teal bg-accent-teal/5 px-6 py-4 rounded-r-2xl my-8 italic text-secondary" {...props} />
                    ),
                    table: ({node, ...props}) => (
                        <div className="overflow-x-auto my-8 border border-white/5 rounded-2xl">
                            <table className="w-full text-left border-collapse" {...props} />
                        </div>
                    ),
                    th: ({node, ...props}) => <th className="bg-white/[0.02] p-4 text-[10px] font-black uppercase tracking-widest text-secondary border-b border-white/5" {...props} />,
                    td: ({node, ...props}) => <td className="p-4 text-sm text-secondary border-b border-white/[0.02]" {...props} />,
                }}
              >
                {activeDoc.content}
              </ReactMarkdown>

              <footer className="mt-16 pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-4 text-secondary text-[10px] font-bold">
                    <span className="flex items-center gap-1.5">
                        <Clock size={12} /> Last updated: March 14, 2026
                    </span>
                    <span className="flex items-center gap-1.5 border-l border-white/10 pl-4">
                        <User size={12} /> Authored by Core Protocol Team
                    </span>
                </div>
                <div className="flex gap-4">
                    <button className="flex items-center gap-1.5 text-accent-teal text-[10px] font-black uppercase tracking-widest hover:underline transition-all">
                        GitHub Source <ExternalLink size={12} />
                    </button>
                    <button className="flex items-center gap-1.5 text-accent-cyan text-[10px] font-black uppercase tracking-widest hover:underline transition-all">
                        Audit Report <ExternalLink size={12} />
                    </button>
                </div>
              </footer>
            </article>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};
