import React, { useState } from 'react';
import { useMultiChainPortfolio, PortfolioAsset } from '@/hooks/useMultiChainPortfolio';
import { ChainFilter } from './ChainFilter';
import { AssetTable } from '@/components/ui/AssetTable';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { MetricCard } from '@/components/ui/MetricCard';
import { Wallet, Layers, Zap, ArrowUpRight, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

/**
 * PortfolioView
 * The core Sovereign Command Center view for multi-chain assets.
 * Implements Liquid vs Illiquid breakdown and Zerion-backed discovery.
 */
export const PortfolioView: React.FC = () => {
    const [chainFilter, setChainFilter] = useState('all');
    const { assets, summary, isLoading } = useMultiChainPortfolio(chainFilter);

    const liquidAssets = assets.filter((a: PortfolioAsset) => a.isLiquid);
    const illiquidAssets = assets.filter((a: PortfolioAsset) => !a.isLiquid);

    const formatCurrency = (val: number) => 
        `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className="space-y-8 pb-20">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-display font-bold text-glow-teal redaction-text">Sovereign Asset Control</h1>
                    <p className="text-secondary mt-1 font-medium opacity-60 italic">
                        Valuations use conservative dDPV principles per <Link href="/docs/WHITEPAPER" className="underline hover:text-accent-teal transition-colors">WHITEPAPER 2.1</Link>.
                    </p>
                </div>
                <ChainFilter onFilterChange={setChainFilter} />
            </header>

            {/* Total Portfolio Snapshot */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                    label="Total Net Worth"
                    value={isLoading ? "..." : formatCurrency(summary.totalValue)}
                    subValue="Cross-chain discovered value"
                    trend="neutral"
                    icon={<Wallet className="w-5 h-5 text-accent-teal" />}
                    glowColor="teal"
                    className="bg-surface/40 backdrop-blur-xl"
                />
                <MetricCard
                   label="Liquid Liquidity"
                   value={isLoading ? "..." : formatCurrency(summary.liquidValue)}
                   subValue="Immediately deployable"
                   trend="neutral"
                   icon={<Zap className="w-5 h-5 text-accent-cyan" />}
                   glowColor="cyan"
                   className="bg-surface/40 backdrop-blur-xl"
                />
                <MetricCard
                   label="Illiquid Protocol Value"
                   value={isLoading ? "..." : formatCurrency(summary.illiquidValue)}
                   subValue="Locked / Vesting collateral"
                   trend="neutral"
                   icon={<Layers className="w-5 h-5 text-accent-gold" />}
                   glowColor="gold"
                   className="bg-surface/40 backdrop-blur-xl"
                />
            </div>

            {/* Liquid Section */}
            <Card variant="solid" className="bg-surface/20 border-white/5">
                <CardHeader className="flex flex-row items-center gap-2 p-6">
                    <Zap className="w-5 h-5 text-accent-teal" />
                    <CardTitle className="text-xl font-bold uppercase italic tracking-tighter">Liquid Positions</CardTitle>
                </CardHeader>
                <CardContent className="p-0 border-t border-white/5">
                    <AssetTable
                        loading={isLoading}
                        columns={[
                            { header: "Asset", accessorKey: "asset" },
                            { header: "Network", accessorKey: "chain" },
                            { header: "Balance", accessorKey: "balance", align: "right" },
                            { 
                                header: "Value (USD)", 
                                accessorKey: "value", 
                                align: "right",
                                className: "text-accent-teal font-black font-mono tracking-tighter"
                            },
                        ]}
                        data={liquidAssets.map((a: PortfolioAsset) => ({
                            asset: (
                                <div className="flex items-center gap-2">
                                    {a.logo ? <img src={a.logo} className="w-5 h-5 rounded-full" /> : <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[8px] font-bold">{a.symbol[0]}</div>}
                                    <span className="font-bold">{a.symbol}</span>
                                </div>
                            ),
                            chain: <span className="text-[10px] font-black uppercase opacity-60">{a.chain}</span>,
                            balance: a.balance.toLocaleString(undefined, { maximumFractionDigits: 6 }),
                            value: formatCurrency(a.valueUsd)
                        }))}
                    />
                    {liquidAssets.length === 0 && !isLoading && (
                        <div className="p-12 text-center text-secondary/40 text-[10px] font-black uppercase tracking-widest leading-loose">
                            No liquid positions identified on this node cluster.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Illiquid Section */}
            <Card variant="solid" className="bg-surface/20 border-white/5">
                <CardHeader className="flex flex-row items-center gap-2 p-6">
                    <Layers className="w-5 h-5 text-accent-gold" />
                    <CardTitle className="text-xl font-bold uppercase italic tracking-tighter">Vesting & Illiquid Assets</CardTitle>
                </CardHeader>
                <CardContent className="p-0 border-t border-white/5">
                    <AssetTable
                        loading={isLoading}
                        columns={[
                            { header: "Position", accessorKey: "asset" },
                            { header: "Type", accessorKey: "type" },
                            { header: "Value", accessorKey: "value", align: "right" },
                            { header: "Command", accessorKey: "action", align: "right" }
                        ]}
                        data={illiquidAssets.map((a: PortfolioAsset) => ({
                            asset: (
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-accent-gold/10 border border-accent-gold/20 flex items-center justify-center">
                                        <ShieldAlert className="w-4 h-4 text-accent-gold" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-xs uppercase">{a.name}</span>
                                        <span className="text-[9px] opacity-50 font-mono italic">{a.chain.toUpperCase()} NODE</span>
                                    </div>
                                </div>
                            ),
                            type: <div className="px-2 py-1 rounded-md border border-white/5 bg-white/5 text-[9px] font-black uppercase tracking-widest">{a.type}</div>,
                            value: <span className="font-bold text-accent-gold font-mono">{formatCurrency(a.valueUsd)}</span>,
                            action: (
                                <Link 
                                    href={`/borrow?collateral=${a.address}&amount=${a.balance}&chain=${a.chain}`}
                                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-accent-cyan hover:underline"
                                >
                                    Use as Collateral <ArrowUpRight className="w-3 h-3" />
                                </Link>
                            )
                        }))}
                    />
                    {illiquidAssets.length === 0 && !isLoading && (
                        <div className="p-12 text-center text-secondary/40 text-[10px] font-black uppercase tracking-widest leading-loose">
                            Zero illiquid/vested positions discovered. Seek credit elsewhere?
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
