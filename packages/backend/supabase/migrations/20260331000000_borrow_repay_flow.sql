-- ============================================================================
-- Vestra Protocol — Supabase Schema
-- Loans + events tables. Populated by the backend event listener.
-- All monetary values stored as TEXT (bigint strings) to avoid JS number
-- precision loss on 6-decimal USDC amounts > 2^53.
-- ============================================================================

-- ── loans ────────────────────────────────────────────────────────────────────
-- One row per loan origination. Mutated in-place on repay/liquidation.
CREATE TABLE IF NOT EXISTS public.loans (
    -- Identity
    id                  BIGSERIAL PRIMARY KEY,
    token_id            TEXT        NOT NULL UNIQUE,  -- VestraWrapperNFT tokenId (uint256 as string)
    chain_id            INTEGER     NOT NULL,

    -- Parties
    borrower            TEXT        NOT NULL,  -- checksummed hex address
    collateral_token    TEXT        NOT NULL,  -- checksummed hex address

    -- Loan terms
    principal_usdc      TEXT        NOT NULL,  -- 6-decimal USDC, stored as string
    interest_rate_bps   INTEGER     NOT NULL,
    origination_fee_usdc TEXT       NOT NULL,
    unlock_time         TIMESTAMPTZ NOT NULL,

    -- Valuation snapshot at origination
    dpv_usdc            TEXT        NOT NULL,  -- dDPV value from ValuationEngine
    ltv_bps             INTEGER     NOT NULL,

    -- Status
    status              TEXT        NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE', 'REPAID', 'LIQUIDATED')),

    -- Repayment data (null until settled)
    interest_accrued_usdc TEXT      NULL,
    total_repaid_usdc   TEXT        NULL,
    settled_at          TIMESTAMPTZ NULL,

    -- Blockchain references
    origination_tx      TEXT        NOT NULL,
    origination_block   BIGINT      NOT NULL,
    settlement_tx       TEXT        NULL,

    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── loan_events ──────────────────────────────────────────────────────────────
-- Append-only event log. Every contract event gets a row here.
CREATE TABLE IF NOT EXISTS public.loan_events (
    id              BIGSERIAL   PRIMARY KEY,
    token_id        TEXT        NOT NULL,  -- FK to loans.token_id
    chain_id        INTEGER     NOT NULL,
    event_type      TEXT        NOT NULL
                        CHECK (event_type IN (
                            'LOAN_ORIGINATED',
                            'LOAN_REPAID',
                            'LOAN_LIQUIDATED',
                            'NFT_MINTED',
                            'NFT_BURNED'
                        )),

    payload         JSONB       NOT NULL DEFAULT '{}',

    tx_hash         TEXT        NOT NULL,
    block_number    BIGINT      NOT NULL,
    log_index       INTEGER     NOT NULL,

    UNIQUE (chain_id, tx_hash, log_index),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── nft_positions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nft_positions (
    id              BIGSERIAL   PRIMARY KEY,
    token_id        TEXT        NOT NULL UNIQUE,
    chain_id        INTEGER     NOT NULL,
    owner           TEXT        NOT NULL,  -- current NFT holder
    status          TEXT        NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'REPAID', 'LIQUIDATED', 'BURNED')),
    minted_at       TIMESTAMPTZ NOT NULL,
    burned_at       TIMESTAMPTZ NULL,
    mint_tx         TEXT        NOT NULL,
    burn_tx         TEXT        NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loans_borrower        ON public.loans (borrower);
CREATE INDEX IF NOT EXISTS idx_loans_status          ON public.loans (status);
CREATE INDEX IF NOT EXISTS idx_loans_chain           ON public.loans (chain_id);
CREATE INDEX IF NOT EXISTS idx_loans_unlock_time     ON public.loans (unlock_time);
CREATE INDEX IF NOT EXISTS idx_loan_events_token_id  ON public.loan_events (token_id);
CREATE INDEX IF NOT EXISTS idx_nft_owner             ON public.nft_positions (owner);

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER loans_updated_at
    BEFORE UPDATE ON public.loans
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE TRIGGER nft_positions_updated_at
    BEFORE UPDATE ON public.nft_positions
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Row-level security ───────────────────────────────────────────────────────
ALTER TABLE public.loans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nft_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loans_public_read" ON public.loans FOR SELECT USING (true);
CREATE POLICY "loan_events_public_read" ON public.loan_events FOR SELECT USING (true);
CREATE POLICY "nft_positions_public_read" ON public.nft_positions FOR SELECT USING (true);

CREATE POLICY "loans_service_write" ON public.loans FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "loan_events_service_write" ON public.loan_events FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "nft_positions_service_write" ON public.nft_positions FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── Views ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.active_loans_view AS
SELECT
    l.token_id,
    l.chain_id,
    l.borrower,
    l.collateral_token,
    l.principal_usdc,
    l.interest_rate_bps,
    l.ltv_bps,
    l.unlock_time,
    EXTRACT(EPOCH FROM (l.unlock_time - NOW())) / 3600 AS hours_to_unlock,
    l.origination_tx,
    l.created_at
FROM public.loans l
WHERE l.status = 'ACTIVE';

CREATE OR REPLACE VIEW public.protocol_tvl_view AS
SELECT
    chain_id,
    COUNT(*)                AS active_loans,
    SUM(principal_usdc::NUMERIC) AS total_principal_usdc
FROM public.loans
WHERE status = 'ACTIVE'
GROUP BY chain_id;
