"use client";

import React from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  BarChart, 
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface ChartContainerProps {
  children: React.ReactElement;
  title?: string;
  height?: number | string;
  className?: string;
}

export const ChartContainer: React.FC<ChartContainerProps> = ({ 
  children, 
  title, 
  height = 300,
  className = '' 
}) => {
  return (
    <div className={`w-full ${className}`}>
      {title && (
        <h4 className="text-sm font-bold text-foreground/60 uppercase tracking-wider mb-6">
          {title}
        </h4>
      )}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface/90 backdrop-blur-md border border-border-glass-bright p-3 rounded-lg shadow-2xl">
        <p className="text-xs font-bold text-foreground/40 uppercase mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm font-bold" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};
