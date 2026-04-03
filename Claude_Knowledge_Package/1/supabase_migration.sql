-- ─────────────────────────────────────────────────────────────────────────────
-- Vestra Protocol — Supabase Migration
-- Tables: loans, loan_events
-- RLS: users can only read their own loans; service role has full write access
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── ENUM types ───────────────────────────────────────────────────────────────
do $$ begin
  create type loan_status as enum ('active', 'repaid', 'liquidated');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type loan_event_type as enum (
    'opened',
    'repaid',
    'liquidated',
    'nft_minted',
    'nft_burned',
    'collateral_released',
    'fee_collected'
  );
exception when duplicate_object then null;
end $$;

-- ── loans ─────────────────────────────────────────────────────────────────────
create table if not exists loans (
  -- Identifiers
  id                  uuid        primary key default uuid_generate_v4(),
  loan_id             bigint      not null unique,        -- on-chain loanId
  chain_id            integer     not null,               -- e.g. 11155111, 8453, 192

  -- Parties
  borrower            text        not null,               -- checksummed address
  nft_holder          text        not null,               -- current NFT holder (may differ after transfer)

  -- Collateral
  collateral_token    text        not null,               -- checksummed token address
  stream_id           text        not null,               -- vesting stream id (bigint or bytes32 as text)
  quantity            numeric(78,0) not null,             -- locked token quantity (18-dec int, stored as raw)
  unlock_time         timestamptz not null,

  -- Loan terms (USDC 6-dec, stored as bigint)
  principal_usdc      bigint      not null,               -- disbursed amount
  dpv_at_open_usdc    bigint      not null,               -- dDPV snapshot
  ltv_bps             integer     not null,               -- effective LTV at open (out of 10_000)
  origination_fee_usdc bigint     not null default 0,
  interest_usdc       bigint      not null default 0,

  -- NFT
  nft_token_id        bigint      not null,               -- == loan_id
  nft_tx_hash         text,                               -- mint transaction hash

  -- Status
  status              loan_status not null default 'active',
  tx_hash_open        text        not null,               -- borrow tx hash
  tx_hash_close       text,                               -- repay / liquidate tx hash
  block_number_open   bigint      not null,
  block_number_close  bigint,

  -- Timestamps
  opened_at           timestamptz not null default now(),
  closed_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Indexes
create index if not exists loans_borrower_idx        on loans (borrower);
create index if not exists loans_nft_holder_idx      on loans (nft_holder);
create index if not exists loans_status_idx          on loans (status);
create index if not exists loans_chain_loanid_idx    on loans (chain_id, loan_id);
create index if not exists loans_unlock_time_idx     on loans (unlock_time) where status = 'active';

-- Auto-update updated_at
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists loans_updated_at on loans;
create trigger loans_updated_at
  before update on loans
  for each row execute function update_updated_at_column();

-- ── loan_events ──────────────────────────────────────────────────────────────
-- Immutable append-only audit log. One row per on-chain event.
create table if not exists loan_events (
  id          uuid              primary key default uuid_generate_v4(),
  loan_id     bigint            not null references loans(loan_id) on delete cascade,
  chain_id    integer           not null,
  event_type  loan_event_type   not null,

  -- On-chain context
  tx_hash     text              not null,
  block_number bigint           not null,
  log_index   integer           not null,
  from_address text,           -- msg.sender of the triggering tx

  -- Flexible payload (amounts, addresses, metadata)
  payload     jsonb             not null default '{}',

  -- Timestamps
  occurred_at timestamptz       not null,               -- block timestamp
  indexed_at  timestamptz       not null default now()  -- when backend indexed it
);

create index if not exists loan_events_loan_id_idx   on loan_events (loan_id);
create index if not exists loan_events_type_idx      on loan_events (event_type);
create index if not exists loan_events_chain_tx_idx  on loan_events (chain_id, tx_hash);
create unique index if not exists loan_events_dedup_idx
  on loan_events (chain_id, tx_hash, log_index);       -- idempotent indexing

-- ── nft_transfers ─────────────────────────────────────────────────────────────
-- Tracks secondary market transfers so nft_holder stays current on loans table.
create table if not exists nft_transfers (
  id           uuid    primary key default uuid_generate_v4(),
  loan_id      bigint  not null references loans(loan_id) on delete cascade,
  chain_id     integer not null,
  from_address text    not null,
  to_address   text    not null,
  tx_hash      text    not null,
  block_number bigint  not null,
  transferred_at timestamptz not null
);

create index if not exists nft_transfers_loan_idx on nft_transfers (loan_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table loans        enable row level security;
alter table loan_events  enable row level security;
alter table nft_transfers enable row level security;

-- Service role (backend) bypasses RLS
-- (Supabase service_role key automatically bypasses RLS)

-- Users can read their own loans (borrower or current holder)
create policy "users read own loans"
  on loans for select
  using (
    lower(borrower)    = lower(current_setting('request.jwt.claims', true)::json->>'wallet')
    or
    lower(nft_holder)  = lower(current_setting('request.jwt.claims', true)::json->>'wallet')
  );

-- Users can read events on their own loans
create policy "users read own loan events"
  on loan_events for select
  using (
    loan_id in (
      select loan_id from loans
      where
        lower(borrower)   = lower(current_setting('request.jwt.claims', true)::json->>'wallet')
        or
        lower(nft_holder) = lower(current_setting('request.jwt.claims', true)::json->>'wallet')
    )
  );

create policy "users read own nft transfers"
  on nft_transfers for select
  using (
    loan_id in (
      select loan_id from loans
      where
        lower(borrower)   = lower(current_setting('request.jwt.claims', true)::json->>'wallet')
        or
        lower(nft_holder) = lower(current_setting('request.jwt.claims', true)::json->>'wallet')
    )
  );

-- ── Helper view: active loans with time remaining ─────────────────────────────
create or replace view active_loans_with_ttl as
select
  l.*,
  extract(epoch from (l.unlock_time - now()))::bigint as seconds_to_unlock,
  case
    when l.unlock_time <= now() then true
    else false
  end as is_past_unlock
from loans l
where l.status = 'active';

comment on table loans         is 'On-chain loan positions mirrored from LoanManager events.';
comment on table loan_events   is 'Immutable audit log of all on-chain loan lifecycle events.';
comment on table nft_transfers is 'VestraWrapperNFT ERC-721 Transfer events for secondary market tracking.';
