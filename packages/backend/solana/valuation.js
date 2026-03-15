// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const BASE_LTV_BPS = 3000;
const BPS_DENOMINATOR = 10000;

const getRiskParams = () => ({
  riskFreeRate: Number(process.env.SOLANA_RISK_FREE_RATE || 5),
  volatility: Number(process.env.SOLANA_VOLATILITY || 50),
  liquidity: Number(process.env.SOLANA_LIQUIDITY_FACTOR || 0.9),
  shock: Number(process.env.SOLANA_SHOCK_FACTOR || 0.95)
});

const computeSolanaDpv = ({ quantity, price, priceExpo, unlockTime, now }) => {
  const qtyNumber = Number(quantity);
  const priceNumber = Number(price);
  if (!Number.isFinite(qtyNumber) || qtyNumber <= 0) {
    return { pv: '0', ltvBps: '0' };
  }
  if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
    return { pv: '0', ltvBps: '0' };
  }
  if (!unlockTime || unlockTime <= now) {
    return { pv: '0', ltvBps: '0' };
  }

  const { riskFreeRate, volatility, liquidity, shock } = getRiskParams();
  const timeToUnlock = unlockTime - now;
  const yearsToUnlock = timeToUnlock / (365 * 24 * 60 * 60);
  const discount = Math.exp(-(riskFreeRate / 100) * yearsToUnlock);
  const volPenalty = volatility / 200;
  const volAdj = Math.max(0, 1 - volPenalty);

  const priceFactor = Math.pow(10, Number(priceExpo || 0));
  const baseValue = (qtyNumber * priceNumber) * priceFactor;
  const pv = Math.max(0, Math.floor(baseValue * discount * liquidity * shock * volAdj));
  const ltvBps = Math.min(
    BPS_DENOMINATOR,
    Math.floor(BASE_LTV_BPS * liquidity * shock * volAdj)
  );

  return {
    pv: pv.toString(),
    ltvBps: ltvBps.toString()
  };
};

module.exports = {
  computeSolanaDpv
};
