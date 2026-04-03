// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { formatUnits, parseUnits } from 'viem';

export function toUnits(value, decimals) {
  if (!value || Number.isNaN(Number(value))) {
    return null;
  }
  return parseUnits(String(value), decimals);
}

export function formatValue(value, decimals) {
  if (value === null || value === undefined) {
    return '--';
  }
  try {
    return formatUnits(value, decimals);
  } catch {
    return value.toString();
  }
}
