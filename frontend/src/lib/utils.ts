import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { parseUnits } from 'viem';

/**
 * Utility for merging tailwind classes safely.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a number as USD currency.
 */
export function formatUsd(value: number | string) {
  const numericValue = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue || 0);
}

/**
 * Formats a wallet address for display.
 */
export function formatAddress(address: string) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Parses a user-entered USDC amount (6 decimals). Returns 0n for empty or invalid input
 * instead of throwing.
 */
export function parseUsdc(value: string): bigint {
  try {
    return value ? parseUnits(value, 6) : 0n;
  } catch {
    return 0n;
  }
}
