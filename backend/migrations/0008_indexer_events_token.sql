-- Add token_address to indexer_events for cohort-by-token (founder/insider risk).
-- Populated when indexing LoanCreated via loanManager.loans + adapter.getDetails.

alter table indexer_events add column if not exists token_address text;
create index if not exists idx_indexer_events_token on indexer_events (token_address) where token_address is not null;

