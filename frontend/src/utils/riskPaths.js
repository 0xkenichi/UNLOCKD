// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
export function generateRiskPaths({ pv = 1, ltvBps = 3000 } = {}) {
  const base = Math.max(Number(pv) || 1, 1);
  const ltv = Math.max(Number(ltvBps) || 3000, 1) / 10000;
  const paths = Array.from({ length: 80 }).map((_, idx) => {
    const riskFactor = idx < 10 ? 0.45 : 0.85;
    return Array.from({ length: 20 }).map((__, i) => [
      i * 0.4 - 3.5,
      Math.sin(i / 2 + idx) * 0.3 + riskFactor + ltv * 0.4 + base * 0.000002,
      0
    ]);
  });
  return paths;
}
