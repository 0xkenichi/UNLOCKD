#!/usr/bin/env node
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
/**
 * Backfill loan_token_exposure from indexer events (LoanCreated / LoanRepaid / LoanSettled).
 * Run from repo root: node backend/scripts/backfill-loan-token-exposure.js
 * Or from backend: node scripts/backfill-loan-token-exposure.js
 * Requires: RPC_URL, persistence (Supabase or SQLite). Optional: DEPLOYMENTS_NETWORK (default sepolia).
 * @see docs/risk/VESTED_TOKEN_LENDING_SESSION_2026-02-14.md
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { ethers } = require('ethers');
const persistence = require('../persistence');
const { runBackfillConcentration } = require('../lib/backfillConcentration');

const DEPLOYMENTS_NETWORK = process.env.DEPLOYMENTS_NETWORK || 'sepolia';
const RPC_URL = process.env.RPC_URL || process.env.ALCHEMY_SEPOLIA_URL || 'https://rpc.sepolia.org';
const LIMIT = Math.min(Math.max(Number(process.env.BACKFILL_LIMIT) || 500, 1), 2000);
const CHAIN = (process.env.BACKFILL_CHAIN || 'base').toLowerCase();

function loadDeployment(name) {
  const filePath = path.join(__dirname, '..', '..', 'deployments', DEPLOYMENTS_NETWORK, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Deployment not found: ${filePath}. Run a deploy first or set DEPLOYMENTS_NETWORK.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function main() {
  await persistence.init();

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const loanManagerDeployment = loadDeployment('LoanManager');
  const vestingAdapterDeployment = loadDeployment('VestingAdapter');

  const loanManagerContract = new ethers.Contract(
    loanManagerDeployment.address,
    loanManagerDeployment.abi,
    provider
  );
  const adapterContract = new ethers.Contract(
    vestingAdapterDeployment.address,
    vestingAdapterDeployment.abi,
    provider
  );

  const getTokenAddressForLoan = async (loanId) => {
    const loan = await loanManagerContract.loans(loanId);
    const collateralId = loan?.collateralId ?? loan?.[3];
    if (collateralId == null) return null;
    const details = await adapterContract.getDetails(collateralId);
    const token = details?.[1];
    return token ? ethers.getAddress(token) : null;
  };

  const loadEventsForBackfill = async (limit) => {
    const list = await persistence.loadEvents(limit);
    return list.map((e) => ({
      type: e.type,
      loanId: e.loanId,
      amount: e.amount,
      tokenAddress: e.tokenAddress,
      blockNumber: e.blockNumber,
      logIndex: e.logIndex
    }));
  };

  console.log(`Backfilling loan_token_exposure (chain=${CHAIN}, limit=${LIMIT})...`);
  const result = await runBackfillConcentration({
    persistence,
    loadEvents: loadEventsForBackfill,
    getTokenAddressForLoan,
    chain: CHAIN,
    limit: LIMIT
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  if (result.errors?.length) {
    console.warn('Errors:', result.errors.slice(0, 10));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
