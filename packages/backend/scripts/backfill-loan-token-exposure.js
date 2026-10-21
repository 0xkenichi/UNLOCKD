#!/usr/bin/env node
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
/**
 * Backfill loan_token_exposure from indexer events (LoanOpened / LoanRepaid / LoanLiquidated).
 * Run from repo root: node backend/scripts/backfill-loan-token-exposure.js
 * Or from backend: node scripts/backfill-loan-token-exposure.js
 * Requires: RPC_URL, persistence (Supabase or SQLite), and the LoanManager address from
 * deployments/<DEPLOYMENTS_NETWORK>/LoanManager.json or LOAN_MANAGER_ADDRESS.
 * Optional: DEPLOYMENTS_NETWORK (default sepolia).
 * @see docs/risk/VESTED_TOKEN_LENDING_SESSION_2026-02-14.md
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { ethers } = require('ethers');
const persistence = require('../persistence');
const { runBackfillConcentration } = require('../lib/backfillConcentration');
const { loanManagerAbi } = require('../contracts/abis');

const DEPLOYMENTS_NETWORK = process.env.DEPLOYMENTS_NETWORK || 'sepolia';
const RPC_URL = process.env.RPC_URL || process.env.ALCHEMY_SEPOLIA_URL || 'https://rpc.sepolia.org';
const LIMIT = Math.min(Math.max(Number(process.env.BACKFILL_LIMIT) || 500, 1), 2000);
const CHAIN = (process.env.BACKFILL_CHAIN || 'base').toLowerCase();

// ABI always comes from packages/contracts/abi; the address from the deployment file or env.
function resolveLoanManagerAddress() {
  const filePath = path.join(__dirname, '..', '..', 'deployments', DEPLOYMENTS_NETWORK, 'LoanManager.json');
  if (fs.existsSync(filePath)) {
    const { address } = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (address && ethers.isAddress(address)) return address;
  }
  const envAddress = String(process.env.LOAN_MANAGER_ADDRESS || '').trim();
  if (envAddress && ethers.isAddress(envAddress)) return envAddress;
  throw new Error(`LoanManager address not found: ${filePath} or LOAN_MANAGER_ADDRESS.`);
}

async function main() {
  await persistence.init();

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const loanManagerContract = new ethers.Contract(resolveLoanManagerAddress(), loanManagerAbi, provider);

  const getTokenAddressForLoan = async (loanId) => {
    const loan = await loanManagerContract.getLoan(loanId);
    const token = loan?.token;
    return token && token !== ethers.ZeroAddress ? ethers.getAddress(token) : null;
  };

  const loadEventsForBackfill = async (limit) => {
    const list = await persistence.loadEvents(limit);
    return list.map((e) => ({
      type: e.type,
      loanId: e.loanId,
      amount: e.amount,
      tokenAddress: e.tokenAddress,
      closed: e.closed ?? e.payload?.closed,
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
