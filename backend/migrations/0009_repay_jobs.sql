-- Repayment sweep job queue (backend worker)
-- Used for always-on Solana (and future EVM) wallet sweeps.

create table if not exists repay_jobs (
  id text primary key,
  chain_type text not null,
  owner_wallet text not null,
  max_usdc text,
  status text not null default 'pending',
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_repay_jobs_status on repay_jobs (status, created_at desc);

