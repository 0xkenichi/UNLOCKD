import { cn } from '@/lib/utils';
import React from 'react';

export function GlassCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/8',
        'bg-white/[0.03] backdrop-blur-xl',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        'p-6',
        className
      )}
    >
      {children}
    </div>
  );
}
