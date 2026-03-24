import { cn } from '@/lib/utils';
import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

type Status = 'success' | 'warning' | 'danger' | 'normal';
type Trend = 'up' | 'down' | 'neutral';
type GlowColor = 'teal' | 'cyan' | 'red' | 'gold' | 'none';

export interface MetricCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  status?: Status;
  trend?: Trend;
  icon?: React.ReactNode;
  glowColor?: GlowColor;
  className?: string;
}

/**
 * MetricCard
 * A premium data visualization card for Vestra Protocol.
 * Optimized for hydration safety and visual impact.
 */
export function MetricCard({
  label,
  value,
  subValue,
  status = 'normal',
  trend,
  icon,
  glowColor = 'none',
  className,
}: MetricCardProps) {
  const statusColors: Record<Status, string> = {
    success: 'text-accent-teal',
    warning: 'text-accent-gold',
    danger: 'text-red-400',
    normal: 'text-[#E8E6DF]',
  };

  const glowStyles: Record<GlowColor, string> = {
    teal: 'shadow-[0_0_30px_rgba(46,190,181,0.05)] border-accent-teal/20',
    cyan: 'shadow-[0_0_30px_rgba(64,224,255,0.05)] border-accent-cyan/20',
    red: 'shadow-[0_0_30px_rgba(226,75,74,0.05)] border-red-500/20',
    gold: 'shadow-[0_0_30px_rgba(239,159,39,0.05)] border-accent-gold/20',
    none: 'border-white/5',
  };

  const renderTrend = () => {
    if (!trend) return null;
    if (trend === 'up') return <ArrowUpRight className="w-3 h-3 text-accent-teal" />;
    if (trend === 'down') return <ArrowDownRight className="w-3 h-3 text-red-400" />;
    return <Minus className="w-3 h-3 text-gray-500" />;
  };

  return (
    <div className={cn(
      "rounded-2xl bg-surface/40 backdrop-blur-xl border p-5 transition-all duration-300 hover:scale-[1.02] hover:bg-surface/60 group",
      glowStyles[glowColor],
      className
    )}>
      <div className="flex justify-between items-start mb-4">
        <div className="text-secondary text-[10px] font-black uppercase tracking-[0.2em] opacity-60 group-hover:opacity-100 transition-opacity redaction-text">
          {label}
        </div>
        {icon && (
          <div className="p-2 rounded-lg bg-white/5 border border-white/5 text-secondary group-hover:text-white transition-all">
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <div className={cn(
          'font-display text-2xl font-bold tracking-tighter redaction-text transition-colors',
          statusColors[status]
        )}>
          {value}
        </div>
        <div className="pb-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
          {renderTrend()}
        </div>
      </div>

      {subValue && (
        <div className="mt-2 text-[10px] text-secondary font-medium opacity-40 italic group-hover:opacity-70 transition-opacity">
          {subValue}
        </div>
      )}
    </div>
  );
}
