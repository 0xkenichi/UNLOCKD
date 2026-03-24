"use client";

import { useState, useEffect, useMemo } from "react";
import { formatUnits } from "viem";

interface FlowInterestCounterProps {
  principal: bigint;
  apyBps: number;
  lastClaimTime: number; // Unix timestamp
  precision?: number;
  isFlowing?: boolean;
}

export function FlowInterestCounter({ 
  principal, 
  apyBps, 
  lastClaimTime,
  precision = 6,
  isFlowing = false
}: FlowInterestCounterProps) {
  const [currentYield, setCurrentYield] = useState<number>(0);

  useEffect(() => {
    const BPS_DENOMINATOR = 10000;
    const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;

    const updateYield = () => {
      const now = Math.floor(Date.now() / 1000);
      const timePassed = now - lastClaimTime;
      
      if (timePassed < 0) return;

      // Yield = (Principal * APY% * Time) / Year
      // Note: We use parseFloat for smooth UI counters, but real claims are on-chain
      const principalNum = Number(formatUnits(principal, 6));
      const apyDecimal = apyBps / BPS_DENOMINATOR;
      const accrued = (principalNum * apyDecimal * timePassed) / SECONDS_IN_YEAR;
      
      setCurrentYield(accrued);
    };

    if (!isFlowing) {
      setCurrentYield(0);
      return;
    }

    updateYield();
    const interval = setInterval(updateYield, 1000); // Tick every second

    return () => clearInterval(interval);
  }, [principal, apyBps, lastClaimTime, isFlowing]);

  return (
    <span className={`font-mono tabular-nums ${isFlowing ? 'text-accent-teal' : 'text-secondary/30'}`}>
      {isFlowing ? `$${currentYield.toLocaleString(undefined, { 
        minimumFractionDigits: precision, 
        maximumFractionDigits: precision 
      })}` : '--'}
    </span>
  );
}
