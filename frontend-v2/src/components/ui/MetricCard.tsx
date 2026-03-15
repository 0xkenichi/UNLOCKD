import React from 'react';
import { Card, CardContent } from './Card';

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  subValue?: string;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  glowColor?: 'teal' | 'cyan' | 'red' | 'none';
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subValue,
  change,
  changeLabel,
  icon,
  trend = 'neutral',
  glowColor = 'none',
  className = ''
}) => {
  const glowStyles = {
    teal: 'border-accent-teal/30 shadow-[0_0_15px_rgba(46,190,181,0.1)]',
    cyan: 'border-accent-cyan/30 shadow-[0_0_15px_rgba(64,224,255,0.1)]',
    red: 'border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]',
    none: ''
  };

  const trendColors = {
    up: 'text-accent-teal',
    down: 'text-risk-high',
    neutral: 'text-foreground/60'
  };

  return (
    <Card className={`relative overflow-hidden ${glowStyles[glowColor]} ${className}`}>
      <CardContent className="flex flex-col gap-2">
        <div className="flex justify-between items-start">
          <span className="text-sm font-medium text-foreground/60 uppercase tracking-wider">
            {label}
          </span>
          {icon && <div className="p-2 bg-surface-hover rounded-lg text-accent-cyan">{icon}</div>}
        </div>
        
        <div className="flex flex-col">
          <h3 className={`text-3xl font-bold tracking-tight ${glowColor !== 'none' ? (glowColor === 'teal' ? 'text-glow-teal' : 'text-glow-cyan') : ''}`}>
            {value}
          </h3>
          {subValue && (
            <span className="text-sm text-foreground/40 font-mono mt-1">
              {subValue}
            </span>
          )}
        </div>

        {(change !== undefined || changeLabel) && (
          <div className="flex items-center gap-2 mt-4">
            {change !== undefined && (
              <span className={`text-sm font-bold flex items-center ${trendColors[trend]}`}>
                {trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''}
                {Math.abs(change)}%
              </span>
            )}
            {changeLabel && (
              <span className="text-xs text-foreground/30 whitespace-nowrap">
                {changeLabel}
              </span>
            )}
          </div>
        )}
      </CardContent>
      
      {/* Subtle background glow effect */}
      {glowColor !== 'none' && (
        <div className={`absolute -right-4 -bottom-4 w-24 h-24 blur-[40px] opacity-20 rounded-full ${
          glowColor === 'teal' ? 'bg-accent-teal' : 
          glowColor === 'cyan' ? 'bg-accent-cyan' : 
          'bg-red-500'
        }`} />
      )}
    </Card>
  );
};
