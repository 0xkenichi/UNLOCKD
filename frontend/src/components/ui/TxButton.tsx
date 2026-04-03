import { cn } from '@/lib/utils';
import React, { useEffect } from 'react';

type TxButtonProps = {
  onClick:        () => void;
  loading?:       boolean;
  success?:       boolean;
  disabled?:      boolean;
  successMessage?: string;
  onSuccess?:     () => void;
  children:       React.ReactNode;
  className?:     string;
};

export function TxButton({
  onClick, loading, success, disabled, successMessage, onSuccess, children, className,
}: TxButtonProps) {
  useEffect(() => {
    if (success && onSuccess) onSuccess();
  }, [success, onSuccess]);

  return (
    <button suppressHydrationWarning
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={loading ? 'Transaction pending' : undefined}
      aria-live="polite"
      className={cn(
        'w-full py-3 px-6 rounded-xl font-medium text-sm transition-all',
        'border border-[#1D9E75]/50 text-[#5DCAA5]',
        'hover:bg-[#1D9E75]/10 active:scale-[0.98]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        success && 'border-[#1D9E75] bg-[#1D9E75]/15 text-[#5DCAA5]',
        className
      )}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <SpinnerIcon />
          <span>Waiting for confirmation...</span>
        </span>
      ) : success ? (
        <span className="flex items-center justify-center gap-2">
          <span>✓</span>
          <span>{successMessage ?? 'Confirmed'}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}
