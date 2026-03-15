-- Loan token exposure for concentration limits (per-token cap).
-- See docs/risk/VESTED_TOKEN_LENDING_SESSION_2026-02-14.md and docs/risk/SECURITY_ORACLES_AND_PARAMETERS.md

create table if not exists loan_token_exposure (
  loan_id text not null,
  chain text not null default 'base',
  token_address text not null,
  amount_usd numeric not null default 0,
  created_at timestamptz default now(),
  primary key (loan_id, chain)
);

create index if not exists idx_loan_token_exposure_token on loan_token_exposure (token_address);
create index if not exists idx_loan_token_exposure_created_at on loan_token_exposure (created_at desc);

comment on table loan_token_exposure is 'Active loan exposure per token for concentration caps. Populated by indexer backfill or admin job.';
