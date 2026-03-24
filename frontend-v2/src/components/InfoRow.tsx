import React from 'react';
import { cn } from '@/lib/utils';

type InfoRowProps = {
  label: string;
  value: string | React.ReactNode;
  mono?: boolean;
  highlight?: boolean;
  status?: 'normal' | 'success' | 'warning' | 'danger';
};

export function InfoRow({ label, value, mono, highlight, status = 'normal' }: InfoRowProps) {
  const statusColors = {
    normal:  'text-[#E8E6DF]',
    success: 'text-[#5DCAA5]',
    warning: 'text-[#EF9F27]',
    danger:  'text-[#E24B4A]',
  };

  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-[#9C9A92]">{label}</span>
      <span
        className={cn(
          'text-sm',
          mono && 'font-mono text-xs',
          highlight ? 'font-medium text-[#E8E6DF]' : statusColors[status]
        )}
      >
        {value}
      </span>
    </div>
  );
}
