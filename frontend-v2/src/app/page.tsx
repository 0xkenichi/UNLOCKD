"use client";

import { motion, AnimatePresence } from "framer-motion";
import { 
  Zap, 
  ShieldCheck, 
  TrendingUp, 
  Clock, 
  ArrowRight,
  Sparkles,
  Lock,
  Globe
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { RollingTicker } from "@/components/landing/RollingTicker";
import { Footer } from "@/components/layout/Footer";

const TypewriterText = ({ text, delay = 0 }: { text: string; delay?: number }) => {
  return (
    <motion.span
      initial="hidden"
      animate="visible"
      className="inline-block"
    >
      {text.split('').map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          className="inline-block whitespace-pre"
          variants={{
            hidden: { opacity: 0, display: 'none' },
            visible: { opacity: 1, display: 'inline-block' }
          }}
          transition={{
            duration: 0.05,
            delay: delay + index * 0.1,
            ease: "linear"
          }}
        >
          {char}
        </motion.span>
      ))}
      <motion.span
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        className="inline-block text-accent-teal font-light ml-1"
      >
        |
      </motion.span>
    </motion.span>
  );
};

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#06080A] text-foreground overflow-x-hidden selection:bg-accent-teal/30">
      {/* Header */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-8 py-6 ${scrolled ? 'bg-black/60 backdrop-blur-xl border-b border-white/5' : ''}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accent-teal/20 to-accent-cyan/20 shadow-[0_0_20px_rgba(46,190,181,0.2)] flex items-center justify-center overflow-hidden relative border border-white/10">
                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <img src="/assets/image (30).png" alt="Vestra" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent-teal animate-pulse" />
                  <span className="text-xl font-black uppercase tracking-tighter text-foreground group-hover:text-accent-teal transition-colors">Vestra Protocol</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">Institutional Credit</span>
              </div>
            </Link>

            <div className="hidden md:flex items-center gap-6 ml-4">
              <Link href="/docs" className="text-sm font-bold text-secondary hover:text-foreground transition-colors">Docs</Link>
              <Link href="/auctions" className="text-sm font-bold text-secondary hover:text-foreground transition-colors">Auctions</Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <button className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold transition-all">
                Launch App
              </button>
            </Link>
          </div>
        </div>
      </nav>
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-teal/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent-cyan/5 blur-[150px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 contrast-150 brightness-100 mix-blend-overlay" />
        
        {/* V1 Inspired Grid Mesh (CSS Only) */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(to right, #2EBEB5 1px, transparent 1px), linear-gradient(to bottom, #2EBEB5 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse at center, black, transparent 80%)'
          }}
        />
      </div>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="min-h-screen flex flex-col items-center justify-center px-6 relative">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="text-center max-w-5xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/5 bg-white/5 backdrop-blur-md mb-8"
            >
              <span className="w-2 h-2 rounded-full bg-accent-teal animate-pulse" />
              <span className="text-xs font-bold tracking-widest text-secondary uppercase">
                Vestra V2 Engine • Live on Sepolia
              </span>
            </motion.div>

            <h1 className="text-6xl md:text-8xl font-display font-black tracking-tighter leading-[0.9] mb-8 text-glow-teal flex flex-wrap justify-center gap-x-4">
              <span>VESTRA</span>
              <TypewriterText text="PROTOCOL" delay={0.5} />
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 0.8 }}
              className="text-xl md:text-2xl text-secondary max-w-2xl mx-auto font-medium leading-relaxed mb-12"
            >
              Institutional-grade credit against vested tokens.
              <span className="text-foreground block mt-2 font-bold italic underline decoration-accent-teal/30">
                Non-custodial. Auto-settled.
              </span>
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.8, duration: 0.8 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-6"
            >
              <Link href="/dashboard">
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(46,190,181,0.4)" }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-5 rounded-2xl bg-gradient-to-tr from-accent-teal to-accent-cyan text-background font-black text-lg tracking-tight uppercase shadow-[0_0_20px_rgba(46,190,181,0.2)]"
                >
                  Launch Vestra App
                </motion.button>
              </Link>
              <Link href="/docs">
                <motion.button
                  whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.08)" }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md text-foreground font-bold text-lg tracking-tight"
                >
                  Read Whitepaper
                </motion.button>
              </Link>
            </motion.div>
          </motion.div>

        </section>

        {/* Rolling Ticker - PHASE II UI */}
        <div className="relative z-20 -mt-10">
          <RollingTicker />
        </div>

        {/* Value Props */}
        <section className="py-32 px-6 bg-surface/50 border-t border-white/5 relative overflow-hidden">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              {
                icon: ShieldCheck,
                title: "Bank-Grade Custody",
                desc: "Assets remain in your control. Settlement occurs automatically on-chain via our risk-calibrated logic."
              },
              {
                icon: Zap,
                title: "Instant Liquidity",
                desc: "Don't wait months for your unlock. Access USDC instantly at fair LTV based on DPV."
              },
              {
                icon: Lockdown,
                title: "Monte Carlo Risk",
                desc: "Our engine runs constant simulations to ensure protocol solvency even in extreme volatility."
              }
            ].map((prop, i) => (
              <motion.div
                key={prop.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ 
                  scale: 1.05, 
                  translateY: -10,
                  boxShadow: "0 20px 40px rgba(46,190,181,0.15)",
                }}
                viewport={{ once: true }}
                transition={{ 
                  duration: 0.5,
                  delay: i * 0.1,
                  ease: [0.22, 1, 0.36, 1]
                }}
                className="glass-card p-10 group hover:border-accent-teal/40 transition-colors duration-500 cursor-default"
              >
                <motion.div 
                  whileHover={{ rotate: 5, scale: 1.1 }}
                  className="w-14 h-14 rounded-2xl bg-accent-teal/10 flex items-center justify-center mb-8 group-hover:bg-accent-teal/20 transition-all shadow-[0_0_15px_rgba(46,190,181,0.1)] group-hover:shadow-[0_0_25px_rgba(46,190,181,0.3)]"
                >
                  <prop.icon className="w-8 h-8 text-accent-teal" />
                </motion.div>
                <h3 className="text-2xl font-display font-bold mb-4 text-glow-teal/50 group-hover:text-glow-teal transition-all duration-500">{prop.title}</h3>
                <p className="text-secondary leading-relaxed text-sm font-medium opacity-70 group-hover:opacity-100 transition-opacity duration-500">
                  {prop.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Stats / Proof */}
        <section className="py-24 border-y border-white/5 overflow-hidden">
          <div className="flex whitespace-nowrap animate-infinite-scroll">
            {[1, 2, 3, 4].map((_, i) => (
              <div key={i} className="flex gap-20 items-center px-10">
                <span className="text-4xl md:text-6xl font-display font-black text-white/10 uppercase tracking-tighter">
                  $300B+ Locked Potential
                </span>
                <span className="text-accent-teal underline decoration-2 underline-offset-8 font-black text-xl">
                   • VESTRA PROTOCOL • 
                </span>
                <span className="text-4xl md:text-6xl font-display font-black text-white/10 uppercase tracking-tighter">
                  Institutional Credit Rails
                </span>
                <span className="text-accent-cyan underline decoration-2 underline-offset-8 font-black text-xl">
                   • LIVE SEPOLIA • 
                </span>
              </div>
            ))}
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}

function Lockdown(props: any) {
  return (
    <svg 
      {...props}
      xmlns="http://www.w3.org/2000/svg" 
      width="24" height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}
