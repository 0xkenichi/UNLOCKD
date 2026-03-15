-- Relayer request nonces to prevent replay of signed relayer actions.

create table if not exists relayer_nonces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  action text not null,
  nonce text not null,
  expires_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, nonce)
);

create index if not exists idx_relayer_nonces_user on relayer_nonces (user_id, created_at desc);
create index if not exists idx_relayer_nonces_expires on relayer_nonces (expires_at) where expires_at is not null;

comment on table relayer_nonces is 'Replay protection for signed relayer requests (private mode).';

