-- Fix for missing columns in token systems and identity attestations
-- Vestra Protocol Migration 20260331010000

-- 1. Token System Fixes
ALTER TABLE public.token_projects ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.token_unlock_events ADD COLUMN IF NOT EXISTS token_id TEXT REFERENCES public.token_projects(id);
CREATE INDEX IF NOT EXISTS idx_token_projects_category ON public.token_projects(category);
CREATE INDEX IF NOT EXISTS idx_token_unlock_events_token_id ON public.token_unlock_events(token_id);

-- 2. Identity Attestation Fixes (from VCS_BUG_FIXES.md)
ALTER TABLE public.identity_attestations
  ADD COLUMN IF NOT EXISTS metadata      jsonb    DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stamps_count  integer  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score         numeric  DEFAULT 0;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
