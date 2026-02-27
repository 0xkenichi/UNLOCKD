/**
 * Backfill loan_token_exposure from indexer events for concentration caps.
 * Processes LoanCreated (upsert exposure), LoanRepaid / LoanSettled / LoanRepaidWithSwap (delete exposure).
 * @see docs/risk/VESTED_TOKEN_LENDING_SESSION_2026-02-14.md, backend/migrations/0007_loan_token_exposure.sql
 */

const USDC_DECIMALS = 1e6;

/**
 * Run backfill: load events in chronological order, upsert exposure for LoanCreated, delete for repay/settle.
 * @param {object} opts
 * @param {import('../persistence')} opts.persistence - persistence module (getLoanExposureByToken, upsertLoanTokenExposure, deleteLoanTokenExposure)
 * @param {(limit: number) => Promise<Array<{ type: string, loanId: string, amount: string, tokenAddress?: string | null, blockNumber: number, logIndex: number }>>} opts.loadEvents - load events (any order; we sort by block, log)
 * @param {(loanId: string) => Promise<string | null>} opts.getTokenAddressForLoan - resolve collateral token for loanId from chain (e.g. LoanManager.loans + VestingAdapter.getDetails)
 * @param {string} [opts.chain='base'] - chain id for exposure table
 * @param {number} [opts.limit=500] - max events to process
 * @returns {Promise<{ processed: number, created: number, removed: number, skipped: number, errors: string[] }>}
 */
async function runBackfillConcentration({
  persistence,
  loadEvents,
  getTokenAddressForLoan,
  chain = 'base',
  limit = 500
}) {
  const errors = [];
  let created = 0;
  let removed = 0;
  let skipped = 0;

  const raw = await loadEvents(limit);
  const sorted = [...raw].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return (a.logIndex ?? 0) - (b.logIndex ?? 0);
  });

  for (const event of sorted) {
    const loanId = String(event.loanId || '').trim();
    if (!loanId) continue;

    if (event.type === 'LoanRepaid' || event.type === 'LoanSettled' || event.type === 'LoanRepaidWithSwap') {
      try {
        await persistence.deleteLoanTokenExposure(loanId, chain);
        removed++;
      } catch (e) {
        errors.push(`delete ${loanId}: ${e?.message || e}`);
      }
      continue;
    }

    if (event.type !== 'LoanCreated') continue;

    const amountRaw = event.amount || '0';
    const amountUsd = Number(amountRaw) / USDC_DECIMALS;
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      skipped++;
      continue;
    }

    let token = event.tokenAddress ? String(event.tokenAddress).trim() : null;
    if (!token) {
      try {
        token = await getTokenAddressForLoan(loanId);
        if (token) token = String(token).trim();
      } catch (e) {
        errors.push(`token ${loanId}: ${e?.message || e}`);
        skipped++;
        continue;
      }
    }

    if (!token) {
      skipped++;
      continue;
    }

    try {
      await persistence.upsertLoanTokenExposure({
        loanId,
        chain,
        tokenAddress: token,
        amountUsd
      });
      created++;
    } catch (e) {
      errors.push(`upsert ${loanId}: ${e?.message || e}`);
    }
  }

  return {
    processed: sorted.length,
    created,
    removed,
    skipped,
    errors: errors.slice(0, 50)
  };
}

module.exports = { runBackfillConcentration, USDC_DECIMALS };
