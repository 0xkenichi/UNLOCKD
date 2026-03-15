-- Multi-wallet linkage for unified EVM + Solana identity
create table if not exists user_wallet_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  chain_type text not null,
  wallet_address text not null,
  created_at timestamptz default now(),
  unique (chain_type, wallet_address)
);

create index if not exists idx_user_wallet_links_user_id on user_wallet_links (user_id);
create index if not exists idx_user_wallet_links_chain_wallet on user_wallet_links (chain_type, wallet_address);

alter table user_wallet_links enable row level security;

do $$ begin
  perform 1 from pg_policies where policyname = 'service role all user_wallet_links';
  if not found then
    create policy "service role all user_wallet_links" on user_wallet_links for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;
