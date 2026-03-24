-- =============================================================================
-- Vestra Protocol — Supabase Migration 001
-- Run: supabase db push
-- =============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── users ───────────────────────────────────────────────────────────────────
-- Central account index. One row per human (wallet = primary identifier).
create table public.users (
  id              uuid primary key default uuid_generate_v4(),
  primary_wallet  text not null unique,    -- EVM or Solana address (checksum)
  chain_type      text not null default 'evm', -- 'evm' | 'solana'
  created_at      timestamptz not null default now(),
  last_login      timestamptz,
  genesis_flag    boolean not null default false -- true = TITAN HNW flag
);

create index idx_users_wallet on public.users(primary_wallet);

-- ─── identity_profiles ───────────────────────────────────────────────────────
-- VCS score cache. Background cron refreshes every 72h.
create table public.identity_profiles (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references public.users(id) on delete cascade,
  vcs_score             integer not null default 500 check (vcs_score between 0 and 1000),
  tier                  text not null default 'STANDARD'
                          check (tier in ('RECRUIT','SCOUT','STANDARD','PREMIUM','TITAN')),
  max_credit_limit_bps  integer not null default 4000  -- BPS: 10000 = 100%
                          check (max_credit_limit_bps between 1000 and 6500),
  gitcoin_score         numeric(8,4),         -- raw Gitcoin Passport score (0–100)
  has_world_id          boolean default false,
  eas_attestation_count integer default 0,
  tx_count              integer default 0,
  balance_usd           numeric(20,4) default 0,
  total_repaid_loans    integer default 0,
  has_defaults          boolean default false,
  last_sync             timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  unique(user_id)
);

create index idx_identity_user on public.identity_profiles(user_id);
create index idx_identity_tier on public.identity_profiles(tier);
create index idx_identity_last_sync on public.identity_profiles(last_sync);

-- ─── collateral_history ──────────────────────────────────────────────────────
-- Token price history for baseline pricing. Written by PriceHistoryCache cron.
-- One row per token per chain. Updated every 5 minutes.
create table public.collateral_history (
  id                       uuid primary key default uuid_generate_v4(),
  token_address            text not null,
  chain_id                 integer not null,
  token_symbol             text,
  spot_price               numeric(30,18),          -- current spot (USD)
  seven_day_low            numeric(30,18),           -- lowest price in 7d window
  thirty_day_low           numeric(30,18),           -- lowest price in 30d window
  historical_baseline_price numeric(30,18),          -- = weighted 30d low (see formula)
  volatility_30d           numeric(8,6),             -- realized vol (0.0–1.0)
  last_updated_at          timestamptz not null default now(),
  unique(token_address, chain_id)
);

create index idx_collateral_token on public.collateral_history(token_address, chain_id);

-- ─── loans ───────────────────────────────────────────────────────────────────
-- Off-chain mirror of on-chain loan state. Written by LoanManager event listener.
create table public.loans (
  id               uuid primary key default uuid_generate_v4(),
  loan_id_onchain  integer not null unique, -- matches LoanManager.nextLoanId
  chain_id         integer not null,
  borrower_wallet  text not null,
  stream_contract  text not null,
  stream_id        integer not null,
  collateral_token text not null,
  borrowed_usdc    numeric(20,6) not null,
  dpv_at_origin    numeric(30,18),
  interest_rate_bps integer not null,
  nft_token_id     integer,
  originated_at    timestamptz not null,
  due_at           timestamptz not null,
  status           text not null default 'active'
                     check (status in ('active','repaid','settled','defaulted')),
  repaid_at        timestamptz,
  created_at       timestamptz not null default now()
);

create index idx_loans_borrower on public.loans(borrower_wallet);
create index idx_loans_status   on public.loans(status);

-- ─── vcs_sync_queue ──────────────────────────────────────────────────────────
-- Tracks which wallets need VCS re-evaluation. Cron reads and processes this.
create table public.vcs_sync_queue (
  id          uuid primary key default uuid_generate_v4(),
  wallet      text not null unique,
  priority    integer default 5,   -- 1 = urgent (new loan), 5 = routine
  queued_at   timestamptz not null default now(),
  processed_at timestamptz
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table public.users               enable row level security;
alter table public.identity_profiles   enable row level security;
alter table public.collateral_history  enable row level security;
alter table public.loans               enable row level security;

-- Public read on collateral_history (anyone can see token pricing)
create policy "collateral_history_public_read"
  on public.collateral_history for select using (true);

-- Users can only read their own profile
create policy "identity_profiles_owner_read"
  on public.identity_profiles for select
  using (user_id = (
    select id from public.users where primary_wallet = auth.jwt()->>'sub'
  ));

-- Service role (backend) has full access via service_key
-- (no RLS restriction for service_role — this is the default in Supabase)
