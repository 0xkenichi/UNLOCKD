-- Identity scoring persistence
create table if not exists identity_profiles (
  wallet_address text primary key,
  linked_at timestamptz,
  identity_proof_hash text,
  sanctions_pass boolean,
  updated_at timestamptz default now()
);

create table if not exists identity_attestations (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  provider text not null,
  score numeric,
  stamps_count int,
  verified_at timestamptz,
  expires_at timestamptz,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (wallet_address, provider)
);

create index if not exists idx_identity_attestations_wallet on identity_attestations (wallet_address);

alter table identity_profiles enable row level security;
alter table identity_attestations enable row level security;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all identity_profiles';
  if not found then
    create policy "service role all identity_profiles" on identity_profiles for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all identity_attestations';
  if not found then
    create policy "service role all identity_attestations" on identity_attestations for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;
