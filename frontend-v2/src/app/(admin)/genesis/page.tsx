'use client';

import { motion } from 'framer-motion';
import { 
  ShieldAlert, 
  Terminal, 
  Database, 
  Settings, 
  Lock, 
  Eye, 
  Activity,
  ArrowUpRight,
  Search,
  Users
} from 'lucide-react';
import { useState } from 'react';
import { MetricCard } from '@/components/ui/MetricCard';

const TECHNICAL_ALERTS = [
  { id: 1, type: 'critical', msg: 'Orphaned Vesting Stream detected on Solana', time: '2m ago' },
  { id: 2, type: 'info', msg: 'Monte Carlo Simulation batch #492 completed', time: '14m ago' },
  { id: 3, type: 'warning', msg: 'Slippage threshold reached on Base/USDC pool', time: '1h ago' },
];

const PRIVATE_DOCS = [
  { title: 'V2 Settlement Core Logic', tag: 'SECRET', lastEdit: 'Mar 12' },
  { title: 'Treasury Multi-sig Recovery', tag: 'CRITICAL', lastEdit: 'Mar 14' },
  { title: 'Risk Parameters - Shock Scenario', tag: 'SENSITIVE', lastEdit: 'Mar 10' },
  { title: 'SDK v0.4 - Private Beta', tag: 'BETA', lastEdit: 'Mar 15' },
];

const RECENT_VCS_USERS = [
    { address: '0x71C...3d2', score: 842, status: 'Premium', passport: true },
    { address: '0x1a2...f4e', score: 620, status: 'Standard', passport: true },
    { address: '0xb84...c10', score: 410, status: 'At Risk', passport: false },
];

export default function GenesisPortal() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen bg-[#06080A] text-white p-8">
      {/* ... Header remains the same ... */}
      {/* Header */}
      <div className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
            <Terminal className="text-accent-teal w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter">Genesis Portal</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-secondary font-bold">Vestra Protocol • Core Command Center</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
            <ShieldAlert className="text-red-400 w-4 h-4 animate-pulse" />
            <span className="text-[10px] font-black uppercase text-red-400">Mainnet Watch: Idle</span>
          </div>
          <button className="p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors">
            <Settings className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Sidebar Nav */}
        <div className="col-span-2 space-y-2">
          {[
            { id: 'overview', icon: Activity, label: 'Protocol Health' },
            { id: 'docs', icon: Lock, label: 'Intel (Private)' },
            { id: 'data', icon: Database, label: 'Data Feeds' },
            { id: 'audit', icon: Eye, label: 'Treasury Audit' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                activeTab === item.id 
                  ? 'bg-accent-teal text-background shadow-[0_4px_15px_rgba(46,190,181,0.3)]' 
                  : 'text-secondary hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Main Command Area */}
        <div className="col-span-10 space-y-8">
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
              <div className="grid grid-cols-3 gap-6">
                <MetricCard label="Total Vested Value" value="$24.2B" change={12} trend="up" />
                <MetricCard label="Active Loans" value="1,492" change={5} trend="up" />
                <MetricCard label="Protocol Revenue" value="$420k" change={18} trend="up" />
              </div>

              <div className="grid grid-cols-2 gap-8">
                {/* Live Logs */}
                <div className="glass-card p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-black uppercase tracking-widest text-accent-teal">Technical Alerts</h3>
                    <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-bold text-gray-500 uppercase">Live Feed</span>
                  </div>
                  <div className="space-y-4">
                    {TECHNICAL_ALERTS.map((alert) => (
                      <div key={alert.id} className="flex items-start gap-4 p-3 rounded-lg border border-white/5 bg-white/5">
                        <div className={`mt-1 w-2 h-2 rounded-full ${
                          alert.type === 'critical' ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 
                          alert.type === 'warning' ? 'bg-orange-500' : 'bg-blue-500'
                        }`} />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-gray-200">{alert.msg}</p>
                          <span className="text-[10px] text-gray-500">{alert.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Treasury Snapshot */}
                <div className="glass-card p-6">
                   <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-black uppercase tracking-widest text-accent-cyan">Treasury Audit</h3>
                    <ArrowUpRight className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="space-y-6">
                    <div className="flex justify-between items-end border-b border-white/5 pb-4">
                      <div>
                        <p className="text-[10px] font-black uppercase text-secondary mb-1">Liquidity Depth</p>
                        <p className="text-2xl font-black">$46.8M</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase text-accent-teal">Healthy</p>
                        <p className="text-xs text-gray-500 italic">Target: 45M</p>
                      </div>
                    </div>
                    <div className="flex gap-2 h-2 rounded-full overflow-hidden bg-white/5">
                      <div className="w-[80%] bg-accent-teal" />
                      <div className="w-[15%] bg-accent-cyan" />
                      <div className="w-[5%] bg-red-400" />
                    </div>
                  </div>
                </div>

                {/* Vestra Credit Score (VCS) Analytics */}
                <div className="col-span-2 glass-card p-6">
                   <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-widest text-white">VCS Analytics</h3>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">Gitcoin Passport v2 Integrated</p>
                        </div>
                        <Users className="w-5 h-5 text-accent-teal" />
                   </div>
                   <div className="grid grid-cols-1 gap-4">
                        {RECENT_VCS_USERS.map((user, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl hover:border-white/10 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs ${user.score > 700 ? 'bg-accent-teal/10 text-accent-teal' : user.score > 500 ? 'bg-orange-500/10 text-orange-400' : 'bg-red-500/10 text-red-400'}`}>
                                    {user.score}
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-white">{user.address}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${user.status === 'Premium' ? 'bg-accent-teal/20 text-accent-teal' : 'bg-gray-800 text-gray-500'}`}>{user.status}</span>
                                        {user.passport && <span className="text-[8px] font-black uppercase text-blue-400">Passport Verified</span>}
                                    </div>
                                </div>
                            </div>
                            <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                <ArrowUpRight className="w-4 h-4 text-gray-500" />
                            </button>
                          </div>
                        ))}
                   </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'docs' && (
             <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between">
                   <h2 className="text-xl font-black uppercase tracking-tighter">Genesis Intel Vault</h2>
                   <div className="relative">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                      <input 
                        type="text" 
                        placeholder="Search private docs..." 
                        className="bg-white/5 border border-white/10 rounded-xl px-10 py-2 text-sm focus:outline-none focus:border-accent-teal/50 transition-all w-64"
                      />
                   </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                   {PRIVATE_DOCS.map((doc, i) => (
                     <motion.div 
                        key={i}
                        whileHover={{ translateX: 10 }}
                        className="glass-card p-4 flex items-center justify-between group cursor-pointer hover:border-accent-teal/30"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center">
                            <Lock className="w-4 h-4 text-accent-teal" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold group-hover:text-accent-teal transition-colors">{doc.title}</h4>
                            <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">{doc.tag}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Last Update</p>
                          <p className="text-xs font-bold">{doc.lastEdit}</p>
                        </div>
                      </motion.div>
                   ))}
                </div>

                <div className="p-8 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-center">
                  <Lock className="w-8 h-8 text-gray-700 mb-4" />
                  <p className="text-sm text-gray-500 font-medium">Restricted technical specs are only visible to Genesis identity holders.</p>
                </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
