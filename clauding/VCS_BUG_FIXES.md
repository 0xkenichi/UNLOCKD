## VCS Identity Page — Bug Fixes
## Date: 2026-03-30
## Bugs: 3 | Files touched: 3 + 1 SQL migration

─────────────────────────────────────────────────────────────────────────────
BUG 1 — SovereignDataService.fetchGitcoinPassportStamps is not a function
─────────────────────────────────────────────────────────────────────────────

FILE: packages/backend/src/services/SovereignDataService.js (or .ts)

The identity route calls `SovereignDataService.fetchGitcoinPassportStamps(address)`
but this method is missing from the class. Add it.

Find the class definition and add this method alongside the existing
`fetchGitcoinPassportScore` / Scorer API call:

```js
/**
 * Fetches raw Gitcoin Passport stamps for an address.
 * Called by the identity route to count verified stamps.
 */
async fetchGitcoinPassportStamps(address) {
  const url = `https://api.scorer.gitcoin.co/registry/stamps/${address}?include_metadata=false&limit=100`;
  const res = await fetch(url, {
    headers: { 'X-API-KEY': process.env.GITCOIN_API_KEY ?? '' },
  });

  if (!res.ok) {
    // Non-fatal: return empty array so the rest of scoring continues
    console.warn(`[SovereignDataService] Stamps API ${res.status} for ${address}`);
    return [];
  }

  const data = await res.json();
  // Gitcoin returns { count, next, prev, items: [...] }
  return data.items ?? [];
}
```

WHY: The identity route does:
  const stamps = await SovereignDataService.fetchGitcoinPassportStamps(address)
If SovereignDataService is a class instance (not static), make sure the call site
uses the instance, not the class:
  sovereignDataService.fetchGitcoinPassportStamps(address)   ← instance
  SovereignDataService.fetchGitcoinPassportStamps(address)   ← static (needs static keyword)
Match whichever pattern the rest of the file uses.

─────────────────────────────────────────────────────────────────────────────
BUG 2 — Supabase schema out of sync (missing columns: metadata, stamps_count)
─────────────────────────────────────────────────────────────────────────────

Run this migration in the Supabase SQL editor (Dashboard → SQL Editor → New query):

```sql
-- Add missing columns to identity_attestations
-- Safe to run multiple times (IF NOT EXISTS guards)

ALTER TABLE identity_attestations
  ADD COLUMN IF NOT EXISTS metadata      jsonb    DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stamps_count  integer  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score         numeric  DEFAULT 0;

-- Refresh the schema cache so PostgREST picks up the new columns immediately
NOTIFY pgrst, 'reload schema';
```

After running: restart the backend (`Ctrl+C` then `npm run dev`) so the
Supabase JS client re-fetches the schema. The upsert will then succeed and
the sync loop will stop.

─────────────────────────────────────────────────────────────────────────────
BUG 3 — GET /internal/credit-history/:address returns 404
─────────────────────────────────────────────────────────────────────────────

FILE: packages/backend/server.js (or routes/identity.js / wherever routes live)

The frontend `usePassportSnapshot` hook fetches:
  GET /internal/credit-history/:address

This route is missing from the backend. Add it:

```js
// Returns Vestra-internal loan history for VCS computation
app.get('/internal/credit-history/:address', async (req, res) => {
  const address = req.params.address.toLowerCase();

  try {
    // Query your loans table for repayment history
    // Replace with your actual Supabase/SQLite query
    const { data, error } = await supabase
      .from('loans')
      .select('id, repaid_at, amount_usdc, is_defaulted, repaid_late')
      .ilike('borrower_address', address)
      .not('repaid_at', 'is', null);

    if (error) throw error;

    const repaidLoans      = data?.length ?? 0;
    const totalRepaidUsd   = data?.reduce((s, l) => s + (l.amount_usdc ?? 0), 0) ?? 0;
    const hasActiveDefaults = data?.some(l => l.is_defaulted && !l.repaid_at) ?? false;
    const lateRepaymentCount = data?.filter(l => l.repaid_late).length ?? 0;

    return res.json({
      totalRepaidLoans:  repaidLoans,
      totalRepaidUsd,
      hasActiveDefaults,
      lateRepaymentCount,
      veCrdtBalance:   0,   // wire to CRDT contract read when ready
      gaugeVotesCount: 0,   // wire to governance subgraph when ready
    });

  } catch (err) {
    // Non-fatal: return safe defaults so VCS scoring can still run
    console.warn('[credit-history] DB error, returning defaults:', err.message);
    return res.json({
      totalRepaidLoans:   0,
      totalRepaidUsd:     0,
      hasActiveDefaults:  false,
      lateRepaymentCount: 0,
      veCrdtBalance:      0,
      gaugeVotesCount:    0,
    });
  }
});
```

IMPORTANT: This route must return 200 with the default object even when the
address has no history — never 404. The frontend throws on any non-2xx
response (api.ts line 22-23).

─────────────────────────────────────────────────────────────────────────────
BONUS — compositeScore showing raw Gitcoin score (5) instead of VCS (500+)
─────────────────────────────────────────────────────────────────────────────

FILE: frontend/src/hooks/usePassportSnapshot.ts  (around line 64)

The hook is returning `passport.compositeScore` which equals the raw Gitcoin
score (1.0 → displayed as 5 after some multiplication). This is because the
VCS engine baseline of 500 is not being applied.

Find where compositeScore is set and ensure the full VCS engine runs:

```ts
// WRONG — just passing through raw Gitcoin score
compositeScore: data.gitcoinScore * 5,

// CORRECT — run through the VCS engine
import { computeVcs } from '@/lib/vcsEngine';  // use the engine we shipped

const vcsResult = computeVcs({
  gitcoinPassportScore: data.gitcoinScore ?? 0,
  hasWorldID:           data.hasWorldID ?? false,
  easAttestations:      data.easAttestations ?? [],
  txCount:              data.activityMetrics?.txCount ?? 0,
  walletAgedays:        data.activityMetrics?.ageMonths
                          ? data.activityMetrics.ageMonths * 30
                          : 0,
  uniqueProtocolsUsed:  data.activityMetrics?.uniqueProtocols ?? 0,
  balanceUsd:           data.activityMetrics?.totalVolume ?? 0,
  totalRepaidLoans:     data.creditHistory?.totalRepaidLoans ?? 0,
  totalRepaidUsd:       data.creditHistory?.totalRepaidUsd ?? 0,
  hasActiveDefaults:    data.creditHistory?.hasActiveDefaults ?? false,
  lateRepaymentCount:   data.creditHistory?.lateRepaymentCount ?? 0,
});

// Return these from the hook:
compositeScore: vcsResult.score,        // 0–1000, baseline 500
multiplier:     vcsResult.riskMultiplier,
tierName:       vcsResult.tier,         // STANDARD | PREMIUM | TITAN
ias:            vcsResult.breakdown.identity.earned,
fbs:            vcsResult.breakdown.creditHistory.earned
              + vcsResult.breakdown.activity.earned,
walletAgeBaseScore: vcsResult.breakdown.activity.factors
                      .find(f => f.label === 'Wallet age')?.earned ?? 0,
```

─────────────────────────────────────────────────────────────────────────────
EXECUTION ORDER
─────────────────────────────────────────────────────────────────────────────

1. Run the Supabase SQL migration (Bug 2) FIRST
2. Add fetchGitcoinPassportStamps method (Bug 1)
3. Add /internal/credit-history route (Bug 3)
4. Fix compositeScore in usePassportSnapshot (Bonus)
5. Restart backend: Ctrl+C → npm run dev
6. Hard-refresh browser (Cmd+Shift+R) to clear Next.js cache
7. Expected result: VCS Score ≥ 500, Risk Multiplier < 1.00x, tier shows correctly
