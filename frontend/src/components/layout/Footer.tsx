"use client";

import Link from "next/link";
import { Github, Twitter, MessageCircle, Globe } from "lucide-react";

export const Footer = () => {
    return (
        <footer className="w-full bg-black/60 border-t border-white/5 pt-20 pb-12 mt-20 relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-accent-teal/5 blur-[120px] rounded-full pointer-events-none" />

            <div className="max-w-7xl mx-auto px-8 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
                    <div className="col-span-1 md:col-span-1">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent-teal to-accent-cyan shadow-[0_0_15px_rgba(46,190,181,0.3)]" />
                            <span className="text-xl font-black uppercase tracking-tighter text-foreground">Vestra</span>
                        </div>
                        <p className="text-secondary text-sm leading-relaxed mb-8 max-w-xs">
                            Institutional-grade credit infrastructure for the next generation of on-chain assets. 
                            Built for the Vestra Protocol Ecosystem.
                        </p>
                        <div className="flex gap-4">
                            <Link href="#" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-secondary hover:text-foreground transition-all">
                                <Twitter size={18} />
                            </Link>
                            <Link href="#" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-secondary hover:text-foreground transition-all">
                                <MessageCircle size={18} />
                            </Link>
                            <Link href="#" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-secondary hover:text-foreground transition-all">
                                <Github size={18} />
                            </Link>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-accent-cyan mb-6">Protocol</h4>
                        <ul className="space-y-4">
                            <li><Link href="/dashboard" className="text-sm text-secondary hover:text-accent-teal transition-colors">Dashboard</Link></li>
                            <li><Link href="/borrow" className="text-sm text-secondary hover:text-accent-teal transition-colors">Borrow</Link></li>
                            <li><Link href="/lend" className="text-sm text-secondary hover:text-accent-teal transition-colors">Supply</Link></li>
                            <li><Link href="/auctions" className="text-sm text-secondary hover:text-accent-teal transition-colors">Auctions</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-accent-cyan mb-6">Resources</h4>
                        <ul className="space-y-4">
                            <li><Link href="/docs" className="text-sm text-secondary hover:text-accent-teal transition-colors">Documentation</Link></li>
                            <li><Link href="/identity" className="text-sm text-secondary hover:text-accent-teal transition-colors">Identity Portal</Link></li>
                            <li><Link href="/airdrop" className="text-sm text-secondary hover:text-accent-teal transition-colors">Airdrop Program</Link></li>
                            <li><Link href="/demo" className="text-sm text-secondary hover:text-accent-teal transition-colors">Developer Demo</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-accent-cyan mb-6">Security</h4>
                        <ul className="space-y-4">
                            <li><Link href="#" className="text-sm text-secondary hover:text-accent-teal transition-colors">Audit Reports</Link></li>
                            <li><Link href="#" className="text-sm text-secondary hover:text-accent-teal transition-colors">Risk Framework</Link></li>
                            <li><Link href="#" className="text-sm text-secondary hover:text-accent-teal transition-colors">Bug Bounty</Link></li>
                        </ul>
                    </div>
                </div>

                <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-6 text-[10px] font-bold text-secondary tracking-widest uppercase">
                        <span>© 2026 Vestra Protocol</span>
                        <Link href="#" className="hover:text-foreground">Terms</Link>
                        <Link href="#" className="hover:text-foreground">Privacy</Link>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/5">
                        <Globe size={12} className="text-accent-teal" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Vestra Protocol Mainnet Ready</span>
                    </div>
                </div>
            </div>
        </footer>
    );
};
