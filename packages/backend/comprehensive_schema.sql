-- Vestra Protocol - Comprehensive Supabase Schema Sync (v2)
-- This version includes DROP statements to resolve type mismatches (TEXT vs UUID).
-- WARNING: This script will drop existing user tables to normalize ID types.

-- 1. Drop conflicting tables to resolve foreign key and type mismatches
DROP TABLE IF EXISTS public.user_wallet_links CASCADE;
DROP TABLE IF EXISTS public.privacy_vaults CASCADE;
DROP TABLE IF EXISTS public.app_sessions CASCADE;
DROP TABLE IF EXISTS public.app_users CASCADE;

-- 2. Core Identity & Auth Tables
CREATE TABLE public.app_users (
    id TEXT PRIMARY KEY, -- Using TEXT for hex strings as per backend
    wallet_address TEXT UNIQUE,
    email TEXT UNIQUE,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT now(),
    last_seen_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.app_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES public.app_users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    nonce TEXT,
    issued_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    ip_hash TEXT
);

CREATE TABLE public.user_wallet_links (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    chain_type TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(chain_type, wallet_address)
);

CREATE TABLE public.privacy_vaults (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    chain_type TEXT NOT NULL,
    vault_address TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, chain_type),
    UNIQUE(chain_type, vault_address)
);

-- 3. Reputation & Scores
CREATE TABLE IF NOT EXISTS public.vcs_scores (
    wallet TEXT PRIMARY KEY,
    gitcoin_score REAL,
    financial_score INTEGER,
    credit_history_score INTEGER,
    total_vcs_score INTEGER,
    tier TEXT,
    real_tier TEXT DEFAULT 'SCOUT',
    tx_count INTEGER DEFAULT 0,
    wallet_age_days INTEGER DEFAULT 0,
    unique_protocols INTEGER DEFAULT 0,
    balance_usd REAL DEFAULT 0,
    latest_tx_timestamp INTEGER DEFAULT 0,
    volume_traded REAL DEFAULT 0,
    largest_tx REAL DEFAULT 0,
    active_vesting_usd REAL DEFAULT 0,
    vesting_monthly_inflow_usd REAL DEFAULT 0,
    total_repaid_loans INTEGER,
    has_defaults BOOLEAN DEFAULT false,
    raw_data JSONB,
    last_updated TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.identity_profiles (
    wallet_address TEXT PRIMARY KEY,
    linked_at TIMESTAMPTZ DEFAULT now(),
    identity_proof_hash TEXT,
    sanctions_pass BOOLEAN DEFAULT false,
    last_synced_score INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure identity_attestations columns match persistence.js logic
CREATE TABLE IF NOT EXISTS public.identity_attestations (
    id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    provider TEXT NOT NULL,
    score REAL,
    stamps_count INTEGER,
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(wallet_address, provider)
);

-- 4. Protocol & Analytics
CREATE TABLE IF NOT EXISTS public.token_projects (
    id TEXT PRIMARY KEY,
    name TEXT,
    symbol TEXT,
    description TEXT,
    category TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.token_unlock_events (
    id TEXT PRIMARY KEY,
    token_id TEXT REFERENCES public.token_projects(id),
    event_type TEXT,
    occurrence_date TIMESTAMPTZ,
    amount TEXT,
    percentage REAL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vesting_sources (
    id TEXT PRIMARY KEY,
    chain_id TEXT NOT NULL,
    vesting_contract TEXT NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'manual',
    lockup_address TEXT,
    stream_id TEXT,
    last_synced_at TIMESTAMPTZ,
    consensus_score REAL DEFAULT 1.0,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Lending Infrastructure
CREATE TABLE IF NOT EXISTS public.user_loans (
    id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    asset TEXT DEFAULT 'USDC',
    ltv_bps INTEGER,
    apr_bps INTEGER,
    status TEXT DEFAULT 'pending',
    repaid_amount TEXT DEFAULT '0',
    duration_days INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.risk_flags (
    id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    token_address TEXT,
    flag_type TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Safely add missing columns to existing tables
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='identity_attestations' AND COLUMN_NAME='verified_at') THEN
        ALTER TABLE public.identity_attestations ADD COLUMN verified_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='identity_attestations' AND COLUMN_NAME='updated_at') THEN
        ALTER TABLE public.identity_attestations ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='token_projects' AND COLUMN_NAME='description') THEN
        ALTER TABLE public.token_projects ADD COLUMN description TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='vcs_scores' AND COLUMN_NAME='vesting_score') THEN
        ALTER TABLE public.vcs_scores ADD COLUMN vesting_score INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='vcs_scores' AND COLUMN_NAME='active_vesting_usd') THEN
        ALTER TABLE public.vcs_scores ADD COLUMN active_vesting_usd REAL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='vcs_scores' AND COLUMN_NAME='vesting_monthly_inflow_usd') THEN
        ALTER TABLE public.vcs_scores ADD COLUMN vesting_monthly_inflow_usd REAL DEFAULT 0;
    END IF;
END $$;
