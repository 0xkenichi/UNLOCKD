-- Supabase schema for backend persistence and submissions.
-- Run with `supabase db push` or paste into the SQL editor.

-- Extensions
create extension if not exists "pgcrypto";

-- Core users (wallet/email optional)
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique,
  email text unique,
  role text default 'user',
  created_at timestamptz default now(),
  last_seen_at timestamptz
);

-- Auth/session bookkeeping
create table if not exists app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  provider text not null, -- e.g., wallet, email
  nonce text,
  issued_at timestamptz default now(),
  expires_at timestamptz,
  ip_hash text
);

-- Contact / governance submissions
create table if not exists contact_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  channel text default 'contact',
  payload jsonb not null,
  status text default 'new',
  created_at timestamptz default now()
);

-- Notifications/outbox
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete cascade,
  channel text,            -- email, webhook, etc.
  template text,           -- identifier for message template
  payload jsonb,
  sent_at timestamptz,
  status text default 'pending',
  error text
);

-- Indexer cache (on-chain events)
create table if not exists indexer_events (
  tx_hash text not null,
  log_index int not null,
  block_number int not null,
  timestamp bigint not null,
  type text not null,
  loan_id text,
  borrower text,
  amount text,
  defaulted boolean,
  primary key (tx_hash, log_index)
);

-- Snapshot summaries
create table if not exists snapshots (
  timestamp bigint primary key,
  total int,
  active int,
  avg_ltv_bps int,
  avg_pv int
);

-- Snapshot items (full payload)
create table if not exists snapshot_items (
  timestamp bigint primary key,
  items jsonb
);

-- Helpful indexes
create index if not exists idx_indexer_events_block_number on indexer_events (block_number desc, log_index desc);
create index if not exists idx_snapshots_timestamp on snapshots (timestamp desc);
create index if not exists idx_snapshot_items_timestamp on snapshot_items (timestamp desc);

-- Simple key-value metadata
create table if not exists meta (
  key text primary key,
  value text
);

-- Lender pools
create table if not exists lending_pools (
  id uuid primary key default gen_random_uuid(),
  owner_wallet text,
  name text,
  chain text,
  preferences jsonb,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Match events (quotes + accepts)
create table if not exists match_events (
  id uuid primary key default gen_random_uuid(),
  type text,
  payload jsonb,
  created_at timestamptz default now()
);

-- RLS
alter table app_users enable row level security;
alter table app_sessions enable row level security;
alter table contact_submissions enable row level security;
alter table notifications enable row level security;
alter table indexer_events enable row level security;
alter table snapshots enable row level security;
alter table snapshot_items enable row level security;
alter table meta enable row level security;
alter table lending_pools enable row level security;
alter table match_events enable row level security;

-- Service role full access (backend)
do $$ begin
  perform 1 from pg_policies where policyname = 'service role all app_users';
  if not found then
    create policy "service role all app_users" on app_users for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all app_sessions';
  if not found then
    create policy "service role all app_sessions" on app_sessions for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all contact_submissions';
  if not found then
    create policy "service role all contact_submissions" on contact_submissions for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all notifications';
  if not found then
    create policy "service role all notifications" on notifications for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all indexer_events';
  if not found then
    create policy "service role all indexer_events" on indexer_events for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all snapshots';
  if not found then
    create policy "service role all snapshots" on snapshots for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all snapshot_items';
  if not found then
    create policy "service role all snapshot_items" on snapshot_items for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all meta';
  if not found then
    create policy "service role all meta" on meta for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all lending_pools';
  if not found then
    create policy "service role all lending_pools" on lending_pools for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all match_events';
  if not found then
    create policy "service role all match_events" on match_events for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;
