-- Vesting source metadata (protocol import tracking)
create table if not exists vesting_sources (
  id uuid primary key default gen_random_uuid(),
  chain_id text not null,
  vesting_contract text not null,
  protocol text not null default 'manual',
  lockup_address text,
  stream_id text,
  created_at timestamptz default now()
);

create index if not exists idx_vesting_sources_contract on vesting_sources (chain_id, vesting_contract);

alter table vesting_sources enable row level security;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all vesting_sources';
  if not found then
    create policy "service role all vesting_sources" on vesting_sources for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

-- Fundraising source (Juicebox-compatible linkage to vesting route)
create table if not exists fundraising_sources (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  token text,
  treasury text,
  chain text not null,
  vesting_policy_ref text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_fundraising_sources_project_chain on fundraising_sources (project_id, chain);

alter table fundraising_sources enable row level security;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all fundraising_sources';
  if not found then
    create policy "service role all fundraising_sources" on fundraising_sources for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;
