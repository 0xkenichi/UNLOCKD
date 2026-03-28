-- Supabase Table: lending_positions
-- Tracks live lending positions synced from VestraVault (LendingPool)

CREATE TABLE IF NOT EXISTS lending_positions (
    id SERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    deposit_amount DECIMAL NOT NULL,
    shares_minted DECIMAL DEFAULT 0,
    deposit_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tx_hash TEXT UNIQUE NOT NULL,
    current_accrued_interest DECIMAL DEFAULT 0,
    withdrawal_penalty_mode TEXT CHECK (withdrawal_penalty_mode IN ('FIXED', 'VARIABLE')),
    lock_days INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexing for fast frontend polling
CREATE INDEX IF NOT EXISTS idx_lending_wallet ON lending_positions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_lending_tx ON lending_positions(tx_hash);
