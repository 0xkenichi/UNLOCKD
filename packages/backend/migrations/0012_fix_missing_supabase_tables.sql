-- Migration 0012: Fix Missing Supabase Tables
-- This script consolidates missing table definitions for Supabase.

-- User Loans
create table if not exists user_loans (
  id text primary key,
  wallet_address text not null,
  amount text not null,
  asset text default 'USDC',
  ltv_bps int,
  apr_bps int,
  status text default 'pending',
  repaid_amount text default '0',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_loans_wallet on user_loans (wallet_address);
create index if not exists idx_user_loans_status on user_loans (status);

-- Staked Sources
create table if not exists staked_sources (
  id text primary key,
  chain_id text not null,
  staking_contract text not null,
  protocol text not null,
  wallet_address text not null,
  amount text,
  last_synced_at timestamptz,
  consensus_score numeric default 1.0,
  created_at timestamptz default now(),
  unique(chain_id, staking_contract, wallet_address)
);

create index if not exists idx_staked_sources_wallet on staked_sources (wallet_address);

-- Locked Sources
create table if not exists locked_sources (
  id text primary key,
  chain_id text not null,
  lock_contract text not null,
  protocol text not null,
  asset_address text,
  amount text,
  unlock_time bigint,
  last_synced_at timestamptz,
  consensus_score numeric default 1.0,
  created_at timestamptz default now()
);

-- Loan Collateral (Linking loans to sources)
create table if not exists loan_collateral (
  id text primary key,
  loan_id text not null references user_loans(id) on delete cascade,
  source_id text not null,
  collateral_amount text,
  raw_data jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_loan_collateral_loan on loan_collateral (loan_id);

-- Identity Profiles
create table if not exists identity_profiles (
  wallet_address text primary key,
  linked_at timestamptz,
  identity_proof_hash text,
  sanctions_pass boolean,
  updated_at timestamptz default now()
);

-- RLS
alter table user_loans enable row level security;
alter table staked_sources enable row level security;
alter table locked_sources enable row level security;
alter table loan_collateral enable row level security;
alter table identity_profiles enable row level security;

-- Service role access
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'service role all user_loans') then
    create policy "service role all user_loans" on user_loans for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'service role all staked_sources') then
    create policy "service role all staked_sources" on staked_sources for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'service role all locked_sources') then
    create policy "service role all locked_sources" on locked_sources for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'service role all loan_collateral') then
    create policy "service role all loan_collateral" on loan_collateral for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'service role all identity_profiles') then
    create policy "service role all identity_profiles" on identity_profiles for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;
