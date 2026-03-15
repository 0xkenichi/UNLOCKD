-- Risk flags for founder/insider and wallet-token flagging (internal use only).
-- See docs/FOUNDER_INSIDER_RISK_AND_FLAGGING.md

create table if not exists risk_flags (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  token_address text,
  flag_type text not null,
  source text default 'manual',
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_risk_flags_wallet on risk_flags (wallet_address);
create index if not exists idx_risk_flags_token on risk_flags (token_address);
create index if not exists idx_risk_flags_wallet_token on risk_flags (wallet_address, token_address);
create index if not exists idx_risk_flags_created_at on risk_flags (created_at desc);

comment on table risk_flags is 'Internal risk-intel flags (insider, cohort_alert, etc.). Not exposed publicly.';
