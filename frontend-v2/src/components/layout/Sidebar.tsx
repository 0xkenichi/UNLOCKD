"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  BarChart3, 
  LayoutDashboard, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Settings,
  ShieldCheck,
  Menu,
  X
} from 'lucide-react';

const navItems = [
  { name: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { name: 'Portfolio', icon: Wallet, href: '/portfolio' },
  { name: 'Borrow', icon: ArrowUpRight, href: '/borrow' },
  { name: 'Supply', icon: ArrowDownLeft, href: '/lend' },
  { name: 'Governance', icon: ShieldCheck, href: '/governance' },
];

export const Sidebar = () => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <>
      {/* Mobile Toggle */}
      <button 
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-surface border border-border-glass rounded-lg"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 glass-card border-r border-border-glass 
        transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent-teal to-accent-cyan shadow-[0_0_15px_rgba(46,190,181,0.4)]" />
            <span className="text-xl font-black uppercase tracking-tighter text-glow-teal">
              Vestra
            </span>
          </div>

          <nav className="flex-1 space-y-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`
                    flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group
                    ${isActive 
                      ? 'bg-accent-teal/10 text-accent-teal border border-accent-teal/20' 
                      : 'text-foreground/40 hover:text-foreground hover:bg-surface-hover'}
                  `}
                >
                  <Icon size={20} className={isActive ? 'text-accent-teal' : 'group-hover:text-accent-cyan'} />
                  <span className="text-sm font-bold tracking-wide">{item.name}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-teal shadow-[0_0_8px_rgba(46,190,181,0.6)]" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto pt-6 border-t border-border-glass">
            <button className="flex items-center gap-4 px-4 py-3 w-full text-foreground/40 hover:text-foreground hover:bg-surface-hover rounded-xl transition-all">
              <Settings size={20} />
              <span className="text-sm font-bold">Settings</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
