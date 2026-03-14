// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

let supabase = null;
let sqlite = null;

// Optional: encrypt high-sensitivity columns at rest (SQLite mode).
// Format: "enc:v1:<ivB64>:<tagB64>:<cipherB64>"
const ENCRYPTION_PREFIX = 'enc:v1:';
let encryptionKey = null;
const loadEncryptionKey = () => {
  if (encryptionKey) return encryptionKey;
  const raw = String(process.env.SENSITIVE_DATA_ENCRYPTION_KEY || '').trim();
  if (!raw) return null;
  try {
    // Accept 64-char hex (32 bytes) or base64.
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      encryptionKey = Buffer.from(raw, 'hex');
      return encryptionKey;
    }
    const asB64 = Buffer.from(raw, 'base64');
    if (asB64.length === 32) {
      encryptionKey = asB64;
      return encryptionKey;
    }
  } catch (_) { }
  console.warn('[privacy] invalid SENSITIVE_DATA_ENCRYPTION_KEY; encryption disabled');
  return null;
};

const encryptText = (value) => {
  const key = loadEncryptionKey();
  if (!key) return value;
  const plaintext = String(value ?? '');
  if (!plaintext) return plaintext;
  // Don't double-encrypt.
  if (plaintext.startsWith(ENCRYPTION_PREFIX)) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
};

const decryptText = (value) => {
  const key = loadEncryptionKey();
  const raw = String(value ?? '');
  if (!raw) return raw;
  if (!raw.startsWith(ENCRYPTION_PREFIX)) return raw;
  if (!key) {
    // Key missing but ciphertext present: return redacted placeholder.
    return '[ENCRYPTED]';
  }
  try {
    const parts = raw.slice(ENCRYPTION_PREFIX.length).split(':');
    if (parts.length !== 3) return '[ENCRYPTED]';
    const [ivB64, tagB64, cipherB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(cipherB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '[ENCRYPTED]';
  }
};

const createId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');

const normalizeChainType = (value) =>
  String(value || 'evm').trim().toLowerCase() === 'solana' ? 'solana' : 'evm';

const normalizeJson = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, val) =>
      typeof val === 'bigint' ? val.toString() : val
    )
  );

const AUDIT_REDACTED = '[REDACTED]';
const AUDIT_MAX_REDACTION_DEPTH = 8;
const SENSITIVE_AUDIT_KEY_FRAGMENTS = [
  'token',
  'secret',
  'password',
  'signature',
  'privatekey',
  'private_key',
  'apikey',
  'api_key',
  'auth',
  'proof',
  'hash',
  'seed',
  'mnemonic',
  'cookie'
];

const isSensitiveAuditKey = (key) => {
  const lowered = String(key || '')
    .trim()
    .toLowerCase();
  if (!lowered) return false;
  return SENSITIVE_AUDIT_KEY_FRAGMENTS.some((fragment) => lowered.includes(fragment));
};

const redactAuditPayload = (value, depth = 0) => {
  if (depth > AUDIT_MAX_REDACTION_DEPTH) return AUDIT_REDACTED;
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditPayload(item, depth + 1));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const output = {};
  Object.entries(value).forEach(([key, item]) => {
    if (isSensitiveAuditKey(key)) {
      output[key] = AUDIT_REDACTED;
      return;
    }
    output[key] = redactAuditPayload(item, depth + 1);
  });
  return output;
};

const toEvent = (row) => ({
  txHash: row.tx_hash || row.txHash,
  logIndex: Number(row.log_index ?? row.logIndex ?? 0),
  blockNumber: Number(row.block_number ?? row.blockNumber ?? 0),
  timestamp: Number(row.timestamp ?? 0),
  type: row.type,
  loanId: row.loan_id || row.loanId || '',
  borrower: row.borrower || '',
  amount: row.amount || '',
  defaulted: Boolean(row.defaulted),
  tokenAddress: row.token_address ?? row.tokenAddress ?? null,
  payload: row.payload ? (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload) : null
});

const toPool = (row) => {
  const rawPrefs = row.preferences ?? row.preferences_json ?? row.preferences_jsonb ?? row.preferencesText;
  let preferences = null;
  if (rawPrefs) {
    try {
      preferences = typeof rawPrefs === 'string' ? JSON.parse(rawPrefs) : rawPrefs;
    } catch {
      preferences = null;
    }
  }
  return {
    id: row.id,
    ownerWallet: row.owner_wallet || row.ownerWallet || '',
    name: row.name || '',
    chain: row.chain || '',
    preferences: preferences || {},
    status: row.status || 'active',
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null
  };
};

const supabaseClient = () => {
  if (supabase) return supabase;
  const customFetch = async (url, options) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Supabase fetch timed out');
      // If fetch completely fails (e.g. DNS resolution, refused connection)
      // return a fake 503 response so the Supabase client handles it gracefully 
      // instead of exploding the Node process with unhandled promise rejections.
      console.warn('[supabase] underlying fetch failed natively:', err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { 'x-client-info': 'vestra-backend/1.0' },
      fetch: customFetch
    }
  });
  return supabase;
};

const initSqlite = () => {
  const dbDir = path.join(__dirname, 'data');
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = process.env.INDEXER_DB_PATH || path.join(dbDir, 'indexer.sqlite');
  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      wallet_address TEXT UNIQUE,
      email TEXT UNIQUE,
      role TEXT DEFAULT 'user',
      created_at TEXT,
      last_seen_at TEXT
    );
    CREATE TABLE IF NOT EXISTS app_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      provider TEXT NOT NULL,
      nonce TEXT,
      issued_at TEXT,
      expires_at TEXT,
      ip_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS user_wallet_links (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      chain_type TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      created_at TEXT,
      UNIQUE(chain_type, wallet_address)
    );
    CREATE TABLE IF NOT EXISTS privacy_vaults (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      chain_type TEXT NOT NULL,
      vault_address TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(user_id, chain_type),
      UNIQUE(chain_type, vault_address)
    );
    CREATE TABLE IF NOT EXISTS user_geo_presence (
      user_id TEXT PRIMARY KEY,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      city TEXT NOT NULL,
      state TEXT,
      country TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      txHash TEXT NOT NULL,
      logIndex INTEGER NOT NULL,
      blockNumber INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      loanId TEXT,
      borrower TEXT,
      amount TEXT,
      defaulted INTEGER,
      token_address TEXT,
      payload TEXT,
      PRIMARY KEY (txHash, logIndex)
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      timestamp INTEGER PRIMARY KEY,
      total INTEGER,
      active INTEGER,
      avgLtvBps INTEGER,
      avgPv INTEGER
    );
    CREATE TABLE IF NOT EXISTS snapshot_items (
      timestamp INTEGER PRIMARY KEY,
      items TEXT
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS lending_pools (
      id TEXT PRIMARY KEY,
      owner_wallet TEXT,
      name TEXT,
      chain TEXT,
      preferences TEXT,
      status TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS match_events (
      id TEXT PRIMARY KEY,
      type TEXT,
      payload TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      session_fingerprint TEXT,
      message TEXT,
      answer TEXT,
      mode TEXT,
      provider TEXT,
      metadata TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS vesting_sources (
      id TEXT PRIMARY KEY,
      chain_id TEXT NOT NULL,
      vesting_contract TEXT NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'manual',
      lockup_address TEXT,
      stream_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS fundraising_sources (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      token TEXT,
      treasury TEXT,
      chain TEXT NOT NULL,
      vesting_policy_ref TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event TEXT NOT NULL,
      page TEXT,
      wallet_address TEXT,
      properties TEXT,
      user_id TEXT,
      session_fingerprint TEXT,
      ip_hash TEXT,
      source TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS identity_profiles (
      wallet_address TEXT PRIMARY KEY,
      linked_at TEXT,
      identity_proof_hash TEXT,
      sanctions_pass INTEGER,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS identity_attestations (
      id TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      provider TEXT NOT NULL,
      score REAL,
      stamps_count INTEGER,
      verified_at TEXT,
      expires_at TEXT,
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(wallet_address, provider)
    );
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      actor_user_id TEXT,
      actor_wallet TEXT,
      actor_role TEXT,
      target_type TEXT,
      target_id TEXT,
      ip_hash TEXT,
      session_fingerprint TEXT,
      payload TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS risk_flags (
      id TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      token_address TEXT,
      flag_type TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_risk_flags_wallet ON risk_flags (wallet_address);
    CREATE INDEX IF NOT EXISTS idx_risk_flags_token ON risk_flags (token_address);
    CREATE INDEX IF NOT EXISTS idx_risk_flags_wallet_token ON risk_flags (wallet_address, token_address);
    CREATE TABLE IF NOT EXISTS loan_token_exposure (
      loan_id TEXT NOT NULL,
      chain TEXT NOT NULL DEFAULT 'base',
      token_address TEXT NOT NULL,
      amount_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (loan_id, chain)
    );
    CREATE INDEX IF NOT EXISTS idx_loan_token_exposure_token ON loan_token_exposure (token_address);
    CREATE INDEX IF NOT EXISTS idx_loan_token_exposure_created_at ON loan_token_exposure (created_at DESC);

    -- Optional job queue for always-on repayment sweeps (Solana/EVM, etc.)
    CREATE TABLE IF NOT EXISTS repay_jobs (
      id TEXT PRIMARY KEY,
      chain_type TEXT NOT NULL,
      owner_wallet TEXT NOT NULL,
      max_usdc TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      last_error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_repay_jobs_status ON repay_jobs (status, created_at DESC);

    -- V16.0 Incentivized Testnet Points Program
    CREATE TABLE IF NOT EXISTS testnet_points (
      wallet_address TEXT PRIMARY KEY,
      total_points INTEGER DEFAULT 0,
      borrow_points INTEGER DEFAULT 0,
      lend_points INTEGER DEFAULT 0,
      privacy_points INTEGER DEFAULT 0,
      feedback_points INTEGER DEFAULT 0,
      multiplier REAL DEFAULT 1.0,
      last_updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_points_total ON testnet_points (total_points DESC);

    -- Relayer request nonces (prevents replay for private-mode relayed actions).
    CREATE TABLE IF NOT EXISTS relayer_nonces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      nonce TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, nonce)
    );
    CREATE INDEX IF NOT EXISTS idx_relayer_nonces_user ON relayer_nonces (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_relayer_nonces_expires ON relayer_nonces (expires_at) WHERE expires_at IS NOT NULL;
  `);
  try {
    const cols = sqlite.prepare('PRAGMA table_info(events)').all();
    if (cols.every((c) => c.name !== 'token_address')) {
      sqlite.exec('ALTER TABLE events ADD COLUMN token_address TEXT');
    }
    if (cols.every((c) => c.name !== 'payload')) {
      sqlite.exec('ALTER TABLE events ADD COLUMN payload TEXT');
    }
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS idx_events_token ON events (token_address) WHERE token_address IS NOT NULL'
    );
  } catch (_) { }
};

const init = async () => {
  if (useSupabase) {
    supabaseClient();
    return;
  }
  initSqlite();
};

const loadEvents = async (limit) => {
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('indexer_events')
      .select(
        'tx_hash, log_index, block_number, timestamp, type, loan_id, borrower, amount, defaulted, token_address'
      )
      .order('block_number', { ascending: false })
      .order('log_index', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`[supabase] loadEvents failed: ${error.message}`);
    return (data || []).map(toEvent);
  }
  const rows = sqlite
    .prepare(
      'SELECT txHash, logIndex, blockNumber, timestamp, type, loanId, borrower, amount, defaulted, token_address FROM events ORDER BY blockNumber DESC, logIndex DESC LIMIT ?'
    )
    .all(limit);
  return rows.map((row) => ({
    txHash: row.txHash,
    logIndex: Number(row.logIndex),
    blockNumber: Number(row.blockNumber),
    timestamp: Number(row.timestamp),
    type: row.type,
    loanId: row.loanId || '',
    borrower: row.borrower || '',
    amount: row.amount || '',
    defaulted: row.defaulted ? Boolean(row.defaulted) : false,
    tokenAddress: row.token_address ?? null,
    payload: row.payload ? JSON.parse(row.payload) : null
  }));
};

const saveEvents = async (events) => {
  if (!events?.length) return;
  if (useSupabase) {
    const { error } = await supabaseClient()
      .from('indexer_events')
      .upsert(
        events.map((event) => ({
          tx_hash: event.txHash,
          log_index: event.logIndex,
          block_number: event.blockNumber,
          timestamp: event.timestamp,
          type: event.type,
          loan_id: event.loanId || '',
          borrower: event.borrower || '',
          amount: event.amount || '',
          defaulted: event.defaulted ?? null,
          token_address: event.tokenAddress ?? null
        })),
        { onConflict: 'tx_hash,log_index' }
      );
    if (error) throw new Error(`[supabase] saveEvents failed: ${error.message}`);
    return;
  }
  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO events
      (txHash, logIndex, blockNumber, timestamp, type, loanId, borrower, amount, defaulted, token_address, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = sqlite.transaction((rows) => {
    rows.forEach((event) =>
      insert.run(
        event.txHash,
        event.logIndex,
        event.blockNumber,
        event.timestamp,
        event.type,
        event.loanId || '',
        event.borrower || '',
        event.amount || '',
        event.defaulted ? 1 : 0,
        event.tokenAddress ?? null,
        event.payload ? JSON.stringify(event.payload) : null
      )
    );
  });
  tx(events);
};

const loadSnapshots = async (limit) => {
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('snapshots')
      .select('timestamp, total, active, avg_ltv_bps, avg_pv')
      .order('timestamp', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`[supabase] loadSnapshots failed: ${error.message}`);
    return (data || []).map((row) => ({
      timestamp: Number(row.timestamp),
      summary: {
        total: Number(row.total || 0),
        active: Number(row.active || 0),
        avgLtvBps: Number(row.avg_ltv_bps || 0),
        avgPv: Number(row.avg_pv || 0)
      },
      items: []
    }));
  }
  const rows = sqlite
    .prepare(
      'SELECT timestamp, total, active, avgLtvBps, avgPv FROM snapshots ORDER BY timestamp DESC LIMIT ?'
    )
    .all(limit);
  return rows.map((row) => ({
    timestamp: Number(row.timestamp),
    summary: {
      total: Number(row.total || 0),
      active: Number(row.active || 0),
      avgLtvBps: Number(row.avgLtvBps || 0),
      avgPv: Number(row.avgPv || 0)
    },
    items: []
  }));
};

const saveSnapshot = async (snapshot) => {
  if (!snapshot) return;
  if (useSupabase) {
    const client = supabaseClient();
    const normalizedItems = normalizeJson(snapshot.items || []);
    const { error } = await client.from('snapshots').upsert({
      timestamp: snapshot.timestamp,
      total: snapshot.summary.total,
      active: snapshot.summary.active,
      avg_ltv_bps: snapshot.summary.avgLtvBps,
      avg_pv: snapshot.summary.avgPv
    });
    if (error) throw new Error(`[supabase] saveSnapshot failed: ${error.message}`);
    // Trim older snapshots to the configured limit.
    const { data: keepRows, error: selectErr } = await client
      .from('snapshots')
      .select('timestamp')
      .order('timestamp', { ascending: false })
      .limit(snapshot.limit);
    if (selectErr) {
      console.warn('[supabase] trim select failed:', selectErr.message);
      return;
    }
    const keep = (keepRows || []).map((row) => row.timestamp);
    if (keep.length) {
      const { error: deleteErr } = await client
        .from('snapshots')
        .delete()
        .not('timestamp', 'in', `(${keep.join(',')})`);
      if (deleteErr) {
        console.warn('[supabase] trim delete failed:', deleteErr.message);
      }
    }
    const { error: itemsError } = await client.from('snapshot_items').upsert({
      timestamp: snapshot.timestamp,
      items: normalizedItems
    });
    if (itemsError) {
      console.warn('[supabase] snapshot items upsert failed:', itemsError.message);
    }
    return;
  }
  const normalizedItems = normalizeJson(snapshot.items || []);
  sqlite
    .prepare(
      'INSERT OR REPLACE INTO snapshots (timestamp, total, active, avgLtvBps, avgPv) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      snapshot.timestamp,
      snapshot.summary.total,
      snapshot.summary.active,
      snapshot.summary.avgLtvBps,
      snapshot.summary.avgPv
    );
  sqlite
    .prepare('INSERT OR REPLACE INTO snapshot_items (timestamp, items) VALUES (?, ?)')
    .run(snapshot.timestamp, JSON.stringify(normalizedItems));
  sqlite
    .prepare(
      'DELETE FROM snapshots WHERE timestamp NOT IN (SELECT timestamp FROM snapshots ORDER BY timestamp DESC LIMIT ?)'
    )
    .run(snapshot.limit);
};

const getMeta = async (key) => {
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('meta')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      throw new Error(`[supabase] getMeta failed: ${error.message}`);
    }
    return data?.value ?? null;
  }
  const row = sqlite.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
};

const setMeta = async (key, value) => {
  if (useSupabase) {
    const { error } = await supabaseClient()
      .from('meta')
      .upsert({ key, value: String(value) }, { onConflict: 'key' });
    if (error) throw new Error(`[supabase] setMeta failed: ${error.message}`);
    return;
  }
  sqlite
    .prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, String(value));
};

const deleteMeta = async (key) => {
  if (useSupabase) {
    const { error } = await supabaseClient().from('meta').delete().eq('key', key);
    if (error) throw new Error(`[supabase] deleteMeta failed: ${error.message}`);
    return;
  }
  sqlite.prepare('DELETE FROM meta WHERE key = ?').run(key);
};

// Clear indexer caches when switching chains/networks. This avoids mixing cached
// localhost rows with Sepolia (or vice versa) and prevents massive backfills.
const clearIndexerCache = async () => {
  if (useSupabase) {
    const client = supabaseClient();
    // Best-effort deletes; failures should not crash the server.
    try {
      await client.from('indexer_events').delete().neq('tx_hash', '');
    } catch (_) { }
    try {
      await client.from('snapshots').delete().neq('timestamp', 0);
    } catch (_) { }
    try {
      await client.from('snapshot_items').delete().neq('timestamp', 0);
    } catch (_) { }
    try {
      await deleteMeta('lastIndexedBlock');
    } catch (_) { }
    return;
  }
  try {
    sqlite.prepare('DELETE FROM events').run();
    sqlite.prepare('DELETE FROM snapshots').run();
    sqlite.prepare('DELETE FROM snapshot_items').run();
    sqlite.prepare('DELETE FROM meta WHERE key = ?').run('lastIndexedBlock');
  } catch (_) { }
};

const insertSubmission = async ({ channel, payload, userId }) => {
  if (!useSupabase) return;
  const { error } = await supabaseClient().from('contact_submissions').insert({
    channel: channel || 'contact',
    payload: payload || {},
    user_id: userId || null
  });
  if (error) throw new Error(`[supabase] insertSubmission failed: ${error.message}`);
};

const insertNotification = async ({ channel, template, payload, userId, status }) => {
  if (!useSupabase) return;
  const { error } = await supabaseClient().from('notifications').insert({
    channel: channel || 'generic',
    template: template || null,
    payload: payload || {},
    user_id: userId || null,
    status: status || 'pending'
  });
  if (error) throw new Error(`[supabase] insertNotification failed: ${error.message}`);
};

const getOrCreateUserByWallet = async (walletAddress, chainType = 'evm') => {
  const chain = normalizeChainType(chainType);
  if (useSupabase) {
    const client = supabaseClient();
    const lookupTable = chain === 'evm' ? 'app_users' : 'user_wallet_links';
    const lookupColumn = chain === 'evm' ? 'wallet_address' : 'wallet_address';
    let existing = null;
    if (chain === 'evm') {
      const { data, error: selectError } = await client
        .from('app_users')
        .select('id, wallet_address')
        .eq('wallet_address', walletAddress)
        .maybeSingle();
      if (selectError && selectError.code !== 'PGRST116') {
        throw new Error(`[supabase] get user failed: ${selectError.message}`);
      }
      existing = data || null;
    } else {
      const { data, error: linkError } = await client
        .from(lookupTable)
        .select('id, user_id, chain_type, wallet_address')
        .eq(lookupColumn, walletAddress)
        .eq('chain_type', chain)
        .maybeSingle();
      if (linkError && linkError.code !== 'PGRST116') {
        throw new Error(`[supabase] get wallet link failed: ${linkError.message}`);
      }
      if (data?.user_id) {
        const { data: userRow, error: userError } = await client
          .from('app_users')
          .select('id, wallet_address')
          .eq('id', data.user_id)
          .maybeSingle();
        if (userError && userError.code !== 'PGRST116') {
          throw new Error(`[supabase] get linked user failed: ${userError.message}`);
        }
        existing = userRow || { id: data.user_id, wallet_address: null };
      }
    }
    if (existing) return { id: existing.id, walletAddress: existing.wallet_address };
    const insertPayload = chain === 'evm' ? { wallet_address: walletAddress } : {};
    const { data, error } = await client
      .from('app_users')
      .insert(insertPayload)
      .select('id, wallet_address')
      .single();
    if (error) throw new Error(`[supabase] insert user failed: ${error.message}`);
    const nowIso = new Date().toISOString();
    const { error: linkInsertError } = await client
      .from('user_wallet_links')
      .upsert(
        {
          id: createId(),
          user_id: data.id,
          chain_type: chain,
          wallet_address: walletAddress,
          created_at: nowIso
        },
        { onConflict: 'chain_type,wallet_address' }
      );
    if (linkInsertError) {
      throw new Error(`[supabase] insert wallet link failed: ${linkInsertError.message}`);
    }
    return { id: data.id, walletAddress: data.wallet_address };
  }
  let existing = null;
  if (chain === 'evm') {
    existing = sqlite
      .prepare('SELECT id, wallet_address FROM app_users WHERE wallet_address = ?')
      .get(walletAddress);
  } else {
    existing = sqlite
      .prepare(
        `SELECT u.id, u.wallet_address
         FROM user_wallet_links l
         JOIN app_users u ON u.id = l.user_id
         WHERE l.chain_type = ? AND l.wallet_address = ?`
      )
      .get(chain, walletAddress);
  }
  if (existing) {
    return { id: existing.id, walletAddress: existing.wallet_address };
  }
  const id = createId();
  const now = new Date().toISOString();
  if (chain === 'evm') {
    sqlite
      .prepare(
        'INSERT INTO app_users (id, wallet_address, created_at, last_seen_at) VALUES (?, ?, ?, ?)'
      )
      .run(id, walletAddress, now, now);
  } else {
    sqlite
      .prepare(
        'INSERT INTO app_users (id, wallet_address, created_at, last_seen_at) VALUES (?, ?, ?, ?)'
      )
      .run(id, null, now, now);
  }
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO user_wallet_links
       (id, user_id, chain_type, wallet_address, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(createId(), id, chain, walletAddress, now);
  return { id, walletAddress };
};

const linkWalletToUser = async ({ userId, chainType, walletAddress }) => {
  if (!userId || !walletAddress) return null;
  const chain = normalizeChainType(chainType);
  const now = new Date().toISOString();
  if (useSupabase) {
    const client = supabaseClient();
    const { data: existing, error: existingError } = await client
      .from('user_wallet_links')
      .select('id, user_id, chain_type, wallet_address, created_at')
      .eq('chain_type', chain)
      .eq('wallet_address', walletAddress)
      .maybeSingle();
    if (existingError && existingError.code !== 'PGRST116') {
      throw new Error(`[supabase] get wallet link failed: ${existingError.message}`);
    }
    if (existing && existing.user_id !== userId) {
      throw new Error('Wallet already linked to another user');
    }
    const payload = {
      id: existing?.id || createId(),
      user_id: userId,
      chain_type: chain,
      wallet_address: walletAddress,
      created_at: existing?.created_at || now
    };
    const { data, error } = await client
      .from('user_wallet_links')
      .upsert(payload, { onConflict: 'chain_type,wallet_address' })
      .select('id, user_id, chain_type, wallet_address, created_at')
      .single();
    if (error) throw new Error(`[supabase] linkWalletToUser failed: ${error.message}`);
    return {
      id: data.id,
      userId: data.user_id,
      chainType: data.chain_type,
      walletAddress: data.wallet_address,
      createdAt: data.created_at || null
    };
  }
  const existing = sqlite
    .prepare(
      `SELECT id, user_id, chain_type, wallet_address, created_at
       FROM user_wallet_links
       WHERE chain_type = ? AND wallet_address = ?`
    )
    .get(chain, walletAddress);
  if (existing && existing.user_id !== userId) {
    throw new Error('Wallet already linked to another user');
  }
  const id = existing?.id || createId();
  sqlite
    .prepare(
      `INSERT INTO user_wallet_links (id, user_id, chain_type, wallet_address, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chain_type, wallet_address) DO UPDATE SET
         user_id = excluded.user_id`
    )
    .run(id, userId, chain, walletAddress, existing?.created_at || now);
  return {
    id,
    userId,
    chainType: chain,
    walletAddress,
    createdAt: existing?.created_at || now
  };
};

const listWalletLinksByUser = async (userId) => {
  if (!userId) return [];
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('user_wallet_links')
      .select('id, user_id, chain_type, wallet_address, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`[supabase] listWalletLinksByUser failed: ${error.message}`);
    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      chainType: row.chain_type,
      walletAddress: row.wallet_address,
      createdAt: row.created_at || null
    }));
  }
  const rows = sqlite
    .prepare(
      `SELECT id, user_id, chain_type, wallet_address, created_at
       FROM user_wallet_links
       WHERE user_id = ?
       ORDER BY created_at ASC`
    )
    .all(userId);
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    chainType: row.chain_type,
    walletAddress: row.wallet_address,
    createdAt: row.created_at || null
  }));
};

const getLinkedEvmWallet = async ({ chainType, walletAddress }) => {
  const chain = normalizeChainType(chainType);
  if (!walletAddress) return '';
  if (chain === 'evm') return walletAddress;
  if (useSupabase) {
    const client = supabaseClient();
    const { data: sourceLink, error: sourceErr } = await client
      .from('user_wallet_links')
      .select('user_id')
      .eq('chain_type', chain)
      .eq('wallet_address', walletAddress)
      .maybeSingle();
    if (sourceErr && sourceErr.code !== 'PGRST116') {
      throw new Error(`[supabase] getLinkedEvmWallet source failed: ${sourceErr.message}`);
    }
    if (!sourceLink?.user_id) return '';
    const { data: evmLink, error: evmErr } = await client
      .from('user_wallet_links')
      .select('wallet_address')
      .eq('user_id', sourceLink.user_id)
      .eq('chain_type', 'evm')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (evmErr && evmErr.code !== 'PGRST116') {
      throw new Error(`[supabase] getLinkedEvmWallet evm link failed: ${evmErr.message}`);
    }
    if (evmLink?.wallet_address) return evmLink.wallet_address;
    const { data: userRow, error: userErr } = await client
      .from('app_users')
      .select('wallet_address')
      .eq('id', sourceLink.user_id)
      .maybeSingle();
    if (userErr && userErr.code !== 'PGRST116') {
      throw new Error(`[supabase] getLinkedEvmWallet user failed: ${userErr.message}`);
    }
    return userRow?.wallet_address || '';
  }
  const source = sqlite
    .prepare(
      `SELECT user_id FROM user_wallet_links
       WHERE chain_type = ? AND wallet_address = ?`
    )
    .get(chain, walletAddress);
  if (!source?.user_id) return '';
  const evmLink = sqlite
    .prepare(
      `SELECT wallet_address FROM user_wallet_links
       WHERE user_id = ? AND chain_type = 'evm'
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .get(source.user_id);
  if (evmLink?.wallet_address) return evmLink.wallet_address;
  const userRow = sqlite
    .prepare('SELECT wallet_address FROM app_users WHERE id = ?')
    .get(source.user_id);
  return userRow?.wallet_address || '';
};

const createSession = async ({ userId, provider, nonce, issuedAt, expiresAt, ipHash }) => {
  const issuedValue = issuedAt ? new Date(issuedAt).toISOString() : new Date().toISOString();
  const expiresValue = expiresAt ? new Date(expiresAt).toISOString() : null;
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('app_sessions')
      .insert({
        user_id: userId,
        provider,
        nonce,
        issued_at: issuedValue,
        expires_at: expiresValue,
        ip_hash: ipHash || null
      })
      .select('id, user_id, provider, nonce, issued_at, expires_at, ip_hash')
      .single();
    if (error) throw new Error(`[supabase] create session failed: ${error.message}`);
    return data;
  }
  const id = createId();
  sqlite
    .prepare(
      'INSERT INTO app_sessions (id, user_id, provider, nonce, issued_at, expires_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(id, userId, provider, nonce, issuedValue, expiresValue, ipHash || null);
  return { id, user_id: userId, provider, nonce, issued_at: issuedValue, expires_at: expiresValue };
};

const getNonceSessionByProvider = async (userId, provider, nonce) => {
  if (!userId || !nonce) return null;
  const safeProvider = String(provider || '').trim() || 'wallet_nonce';
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('app_sessions')
      .select('id, user_id, provider, nonce, issued_at, expires_at, ip_hash')
      .eq('user_id', userId)
      .eq('provider', safeProvider)
      .eq('nonce', nonce)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      throw new Error(`[supabase] nonce session failed: ${error.message}`);
    }
    if (!data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      provider: data.provider,
      nonce: data.nonce,
      issuedAt: data.issued_at ? Date.parse(data.issued_at) : null,
      expiresAt: data.expires_at ? Date.parse(data.expires_at) : null,
      ipHash: data.ip_hash || ''
    };
  }
  const row = sqlite
    .prepare(
      'SELECT id, user_id, provider, nonce, issued_at, expires_at, ip_hash FROM app_sessions WHERE user_id = ? AND provider = ? AND nonce = ?'
    )
    .get(userId, safeProvider, nonce);
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    nonce: row.nonce,
    issuedAt: row.issued_at ? Date.parse(row.issued_at) : null,
    expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
    ipHash: row.ip_hash || ''
  };
};

const getNonceSession = async (userId, nonce) =>
  getNonceSessionByProvider(userId, 'wallet_nonce', nonce);

const getSessionByToken = async (token) => {
  if (!token) return null;
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('app_sessions')
      .select(
        'id, user_id, provider, nonce, issued_at, expires_at, ip_hash, app_users ( id, wallet_address, role )'
      )
      .eq('provider', 'wallet_session')
      .eq('nonce', token)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      throw new Error(`[supabase] session lookup failed: ${error.message}`);
    }
    if (!data) return null;
    const linkedWallets = data.user_id
      ? await listWalletLinksByUser(data.user_id)
      : [];
    return {
      id: data.id,
      provider: data.provider,
      nonce: data.nonce,
      issuedAt: data.issued_at ? Date.parse(data.issued_at) : null,
      expiresAt: data.expires_at ? Date.parse(data.expires_at) : null,
      ipHash: data.ip_hash || '',
      user: data.app_users
        ? {
          id: data.app_users.id,
          walletAddress: data.app_users.wallet_address,
          role: data.app_users.role || 'user',
          linkedWallets
        }
        : null
    };
  }
  const row = sqlite
    .prepare(
      `SELECT s.id, s.user_id, s.provider, s.nonce, s.issued_at, s.expires_at, s.ip_hash, u.wallet_address, u.role
       FROM app_sessions s
       LEFT JOIN app_users u ON s.user_id = u.id
       WHERE s.provider = ? AND s.nonce = ?`
    )
    .get('wallet_session', token);
  if (!row) return null;
  const linkedWallets = row.user_id ? await listWalletLinksByUser(row.user_id) : [];
  return {
    id: row.id,
    provider: row.provider,
    nonce: row.nonce,
    issuedAt: row.issued_at ? Date.parse(row.issued_at) : null,
    expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
    ipHash: row.ip_hash || '',
    user: row.user_id
      ? {
        id: row.user_id,
        walletAddress: row.wallet_address,
        role: row.role || 'user',
        linkedWallets
      }
      : null
  };
};

const deleteSession = async (sessionId) => {
  if (!sessionId) return;
  if (useSupabase) {
    const { error } = await supabaseClient().from('app_sessions').delete().eq('id', sessionId);
    if (error) throw new Error(`[supabase] delete session failed: ${error.message}`);
    return;
  }
  sqlite.prepare('DELETE FROM app_sessions WHERE id = ?').run(sessionId);
};

const clearSessionsByProvider = async (userId, provider) => {
  if (!userId || !provider) return;
  if (useSupabase) {
    const { error } = await supabaseClient()
      .from('app_sessions')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);
    if (error) throw new Error(`[supabase] clear sessions failed: ${error.message}`);
    return;
  }
  sqlite
    .prepare('DELETE FROM app_sessions WHERE user_id = ? AND provider = ?')
    .run(userId, provider);
};

const upsertUserGeoPresence = async ({ userId, lat, lng, city, state, country }) => {
  if (!userId) return;
  const normalized = {
    userId,
    lat: Number(lat),
    lng: Number(lng),
    city: String(city || '').trim(),
    state: state ? String(state).trim() : null,
    country: String(country || '').trim(),
    updatedAt: new Date().toISOString()
  };
  if (
    !Number.isFinite(normalized.lat) ||
    !Number.isFinite(normalized.lng) ||
    !normalized.city ||
    !normalized.country
  ) {
    return;
  }

  if (useSupabase) {
    const { error } = await supabaseClient()
      .from('user_geo_presence')
      .upsert(
        {
          user_id: normalized.userId,
          lat: normalized.lat,
          lng: normalized.lng,
          city: normalized.city,
          state: normalized.state,
          country: normalized.country,
          updated_at: normalized.updatedAt
        },
        { onConflict: 'user_id' }
      );
    if (error) throw new Error(`[supabase] upsertUserGeoPresence failed: ${error.message}`);
    return;
  }

  sqlite
    .prepare(
      `INSERT INTO user_geo_presence (user_id, lat, lng, city, state, country, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         lat = excluded.lat,
         lng = excluded.lng,
         city = excluded.city,
         state = excluded.state,
         country = excluded.country,
         updated_at = excluded.updated_at`
    )
    .run(
      normalized.userId,
      normalized.lat,
      normalized.lng,
      normalized.city,
      normalized.state,
      normalized.country,
      normalized.updatedAt
    );
};

const listGeoPings = async ({ limit = 200 } = {}) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));

  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('user_geo_presence')
      .select('lat, lng, city, state, country');
    if (error) throw new Error(`[supabase] listGeoPings failed: ${error.message}`);
    const aggregate = new Map();
    (data || []).forEach((row) => {
      const key = `${row.city}|${row.state || ''}|${row.country}|${row.lat}|${row.lng}`;
      if (!aggregate.has(key)) {
        aggregate.set(key, {
          lat: Number(row.lat),
          lng: Number(row.lng),
          city: row.city,
          state: row.state || null,
          country: row.country,
          count: 0
        });
      }
      aggregate.get(key).count += 1;
    });
    return Array.from(aggregate.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, safeLimit);
  }

  const rows = sqlite
    .prepare(
      `SELECT lat, lng, city, state, country, COUNT(*) as count
       FROM user_geo_presence
       GROUP BY lat, lng, city, state, country
       ORDER BY count DESC
       LIMIT ?`
    )
    .all(safeLimit);

  return rows.map((row) => ({
    lat: Number(row.lat),
    lng: Number(row.lng),
    city: row.city,
    state: row.state || null,
    country: row.country,
    count: Number(row.count || 0)
  }));
};

const createPool = async ({ ownerWallet, name, chain, preferences, status }) => {
  const pool = {
    id: createId(),
    ownerWallet: ownerWallet || '',
    name: name || '',
    chain: chain || '',
    preferences: preferences || {},
    status: status || 'active'
  };
  const now = new Date().toISOString();
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('lending_pools')
      .insert({
        id: pool.id,
        owner_wallet: pool.ownerWallet,
        name: pool.name,
        chain: pool.chain,
        preferences: normalizeJson(pool.preferences),
        status: pool.status,
        created_at: now,
        updated_at: now
      })
      .select('id, owner_wallet, name, chain, preferences, status, created_at, updated_at')
      .single();
    if (error) throw new Error(`[supabase] createPool failed: ${error.message}`);
    return toPool(data);
  }
  sqlite
    .prepare(
      `INSERT INTO lending_pools (id, owner_wallet, name, chain, preferences, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      pool.id,
      pool.ownerWallet,
      pool.name,
      pool.chain,
      JSON.stringify(normalizeJson(pool.preferences)),
      pool.status,
      now,
      now
    );
  return { ...pool, createdAt: now, updatedAt: now };
};

const updatePoolPreferences = async ({ id, ownerWallet, preferences, status }) => {
  if (!id) return null;
  const now = new Date().toISOString();
  if (useSupabase) {
    let query = supabaseClient().from('lending_pools').update({
      preferences: normalizeJson(preferences || {}),
      status: status || undefined,
      updated_at: now
    });
    if (ownerWallet) {
      query = query.eq('owner_wallet', ownerWallet);
    }
    const { data, error } = await query
      .eq('id', id)
      .select('id, owner_wallet, name, chain, preferences, status, created_at, updated_at')
      .maybeSingle();
    if (error) throw new Error(`[supabase] updatePoolPreferences failed: ${error.message}`);
    return data ? toPool(data) : null;
  }
  const existing = sqlite
    .prepare('SELECT id, owner_wallet FROM lending_pools WHERE id = ?')
    .get(id);
  if (!existing) return null;
  if (ownerWallet && existing.owner_wallet !== ownerWallet) return null;
  sqlite
    .prepare(
      'UPDATE lending_pools SET preferences = ?, status = COALESCE(?, status), updated_at = ? WHERE id = ?'
    )
    .run(JSON.stringify(normalizeJson(preferences || {})), status || null, now, id);
  const row = sqlite
    .prepare(
      'SELECT id, owner_wallet, name, chain, preferences, status, created_at, updated_at FROM lending_pools WHERE id = ?'
    )
    .get(id);
  return row ? toPool({ ...row, preferencesText: row.preferences }) : null;
};

const listPools = async ({ chain, ownerWallet, status } = {}) => {
  if (useSupabase) {
    let query = supabaseClient()
      .from('lending_pools')
      .select('id, owner_wallet, name, chain, preferences, status, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (chain) query = query.eq('chain', chain);
    if (ownerWallet) query = query.eq('owner_wallet', ownerWallet);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new Error(`[supabase] listPools failed: ${error.message}`);
    return (data || []).map(toPool);
  }
  let sql =
    'SELECT id, owner_wallet, name, chain, preferences, status, created_at, updated_at FROM lending_pools';
  const args = [];
  const clauses = [];
  if (chain) {
    clauses.push('chain = ?');
    args.push(chain);
  }
  if (ownerWallet) {
    clauses.push('owner_wallet = ?');
    args.push(ownerWallet);
  }
  if (status) {
    clauses.push('status = ?');
    args.push(status);
  }
  if (clauses.length) {
    sql += ` WHERE ${clauses.join(' AND ')}`;
  }
  sql += ' ORDER BY created_at DESC';
  const rows = sqlite.prepare(sql).all(...args);
  return rows.map((row) => toPool({ ...row, preferencesText: row.preferences }));
};

const getPoolById = async (id) => {
  if (!id) return null;
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('lending_pools')
      .select('id, owner_wallet, name, chain, preferences, status, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      throw new Error(`[supabase] getPoolById failed: ${error.message}`);
    }
    return data ? toPool(data) : null;
  }
  const row = sqlite
    .prepare(
      'SELECT id, owner_wallet, name, chain, preferences, status, created_at, updated_at FROM lending_pools WHERE id = ?'
    )
    .get(id);
  return row ? toPool({ ...row, preferencesText: row.preferences }) : null;
};

const createMatchEvent = async ({ type, payload }) => {
  const id = createId();
  const createdAt = new Date().toISOString();
  const normalized = normalizeJson(payload || {});
  if (useSupabase) {
    const { error } = await supabaseClient().from('match_events').insert({
      id,
      type: type || 'unknown',
      payload: normalized,
      created_at: createdAt
    });
    if (error) throw new Error(`[supabase] createMatchEvent failed: ${error.message}`);
    return { id, type: type || 'unknown', payload: normalized, createdAt };
  }
  sqlite
    .prepare('INSERT INTO match_events (id, type, payload, created_at) VALUES (?, ?, ?, ?)')
    .run(id, type || 'unknown', JSON.stringify(normalized), createdAt);
  return { id, type: type || 'unknown', payload: normalized, createdAt };
};

const getPoints = async (walletAddress) => {
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('testnet_points')
      .select('*')
      .eq('wallet_address', walletAddress)
      .maybeSingle();
    if (error) throw new Error(`[supabase] getPoints failed: ${error.message}`);
    return data || { wallet_address: walletAddress, total_points: 0, borrow_points: 0, lend_points: 0, privacy_points: 0, feedback_points: 0, multiplier: 1.0 };
  }
  const row = sqlite.prepare('SELECT * FROM testnet_points WHERE wallet_address = ?').get(walletAddress);
  return row || { wallet_address: walletAddress, total_points: 0, borrow_points: 0, lend_points: 0, privacy_points: 0, feedback_points: 0, multiplier: 1.0 };
};

const updatePoints = async (walletAddress, { borrow = 0, lend = 0, privacy = 0, feedback = 0, multiplierBoost = 0 }) => {
  if (useSupabase) {
    const current = await getPoints(walletAddress);
    const newBorrow = (current.borrow_points || 0) + borrow;
    const newLend = (current.lend_points || 0) + lend;
    const newPrivacy = (current.privacy_points || 0) + privacy;
    const newFeedback = (current.feedback_points || 0) + feedback;
    const newMultiplier = (current.multiplier || 1.0) + multiplierBoost;
    const total = Math.floor((newBorrow + newLend + newPrivacy + newFeedback) * newMultiplier);
    
    const { error } = await supabaseClient()
      .from('testnet_points')
      .upsert({
        wallet_address: walletAddress,
        total_points: total,
        borrow_points: newBorrow,
        lend_points: newLend,
        privacy_points: newPrivacy,
        feedback_points: newFeedback,
        multiplier: newMultiplier,
        last_updated_at: new Date().toISOString()
      }, { onConflict: 'wallet_address' });
    if (error) throw new Error(`[supabase] updatePoints failed: ${error.message}`);
    return;
  }
  
  const current = await getPoints(walletAddress);
  const newBorrow = (current.borrow_points || 0) + borrow;
  const newLend = (current.lend_points || 0) + lend;
  const newPrivacy = (current.privacy_points || 0) + privacy;
  const newFeedback = (current.feedback_points || 0) + feedback;
  const newMultiplier = (current.multiplier || 1.0) + multiplierBoost;
  const total = Math.floor((newBorrow + newLend + newPrivacy + newFeedback) * newMultiplier);

  sqlite.prepare(`
    INSERT INTO testnet_points (wallet_address, total_points, borrow_points, lend_points, privacy_points, feedback_points, multiplier, last_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(wallet_address) DO UPDATE SET
      total_points = excluded.total_points,
      borrow_points = excluded.borrow_points,
      lend_points = excluded.lend_points,
      privacy_points = excluded.privacy_points,
      feedback_points = excluded.feedback_points,
      multiplier = excluded.multiplier,
      last_updated_at = excluded.last_updated_at
  `).run(walletAddress, total, newBorrow, newLend, newPrivacy, newFeedback, newMultiplier);
};

const getLeaderboard = async (limit = 50) => {
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('testnet_points')
      .select('*')
      .order('total_points', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`[supabase] getLeaderboard failed: ${error.message}`);
    return data || [];
  }
  return sqlite.prepare('SELECT * FROM testnet_points ORDER BY total_points DESC LIMIT ?').all(limit);
};

const listRecentAgentConversations = async ({
  limit = 80,
  userId,
  sessionFingerprint
} = {}) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 80, 250));
  if (useSupabase) {
    let query = supabaseClient()
      .from('agent_conversations')
      .select(
        'id, user_id, session_fingerprint, message, answer, mode, provider, metadata, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(safeLimit);
    if (userId) {
      query = query.eq('user_id', userId);
    } else if (sessionFingerprint) {
      query = query.eq('session_fingerprint', sessionFingerprint);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`[supabase] listRecentAgentConversations failed: ${error.message}`);
    }
    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id || null,
      sessionFingerprint: row.session_fingerprint || '',
      message: row.message || '',
      answer: row.answer || '',
      mode: row.mode || '',
      provider: row.provider || '',
      metadata: row.metadata || {},
      createdAt: row.created_at || null
    }));
  }
  let sql =
    'SELECT id, user_id, session_fingerprint, message, answer, mode, provider, metadata, created_at FROM agent_conversations';
  const args = [];
  if (userId) {
    sql += ' WHERE user_id = ?';
    args.push(userId);
  } else if (sessionFingerprint) {
    sql += ' WHERE session_fingerprint = ?';
    args.push(sessionFingerprint);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  args.push(safeLimit);
  const rows = sqlite.prepare(sql).all(...args);
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id || null,
    sessionFingerprint: row.session_fingerprint || '',
    message: decryptText(row.message || ''),
    answer: decryptText(row.answer || ''),
    mode: row.mode || '',
    provider: row.provider || '',
    metadata: (() => {
      try {
        const decoded = decryptText(row.metadata || '');
        return decoded ? JSON.parse(decoded) : {};
      } catch {
        return {};
      }
    })(),
    createdAt: row.created_at || null
  }));
};

const saveAgentConversation = async ({
  userId = null,
  sessionFingerprint = '',
  message = '',
  answer = '',
  mode = '',
  provider = '',
  metadata = {}
} = {}) => {
  if (!message || !answer) return null;
  const id = createId();
  const createdAt = new Date().toISOString();
  const normalizedMetadata = normalizeJson(metadata || {});
  if (useSupabase) {
    const { error } = await supabaseClient().from('agent_conversations').insert({
      id,
      user_id: userId || null,
      session_fingerprint: sessionFingerprint || null,
      message: String(message).slice(0, 3000),
      answer: String(answer).slice(0, 8000),
      mode: String(mode || '').slice(0, 80),
      provider: String(provider || '').slice(0, 80),
      metadata: normalizedMetadata,
      created_at: createdAt
    });
    if (error) {
      throw new Error(`[supabase] saveAgentConversation failed: ${error.message}`);
    }
    return { id, createdAt };
  }
  sqlite
    .prepare(
      `INSERT INTO agent_conversations
      (id, user_id, session_fingerprint, message, answer, mode, provider, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      userId || null,
      sessionFingerprint || null,
      encryptText(String(message).slice(0, 3000)),
      encryptText(String(answer).slice(0, 8000)),
      String(mode || '').slice(0, 80),
      String(provider || '').slice(0, 80),
      encryptText(JSON.stringify(normalizedMetadata)),
      createdAt
    );
  return { id, createdAt };
};

const saveAnalyticsEvent = async ({
  event,
  page = null,
  walletAddress = null,
  properties = {},
  userId = null,
  sessionFingerprint = '',
  ipHash = '',
  source = 'web'
} = {}) => {
  if (!event) return null;
  const id = createId();
  const createdAt = new Date().toISOString();
  const normalizedProps = normalizeJson(properties || {});

  if (useSupabase) {
    const { error } = await supabaseClient().from('analytics_events').insert({
      id,
      event: String(event).slice(0, 120),
      page: page ? String(page).slice(0, 200) : null,
      wallet_address: walletAddress || null,
      properties: normalizedProps,
      user_id: userId || null,
      session_fingerprint: sessionFingerprint || null,
      ip_hash: ipHash || null,
      source: String(source || 'web').slice(0, 40),
      created_at: createdAt
    });
    if (error) throw new Error(`[supabase] saveAnalyticsEvent failed: ${error.message}`);
    return { id, createdAt };
  }

  sqlite
    .prepare(
      `INSERT INTO analytics_events
      (id, event, page, wallet_address, properties, user_id, session_fingerprint, ip_hash, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      String(event).slice(0, 120),
      page ? String(page).slice(0, 200) : null,
      walletAddress || null,
      encryptText(JSON.stringify(normalizedProps)),
      userId || null,
      sessionFingerprint || null,
      ipHash || null,
      String(source || 'web').slice(0, 40),
      createdAt
    );
  return { id, createdAt };
};

const getAnalyticsSummary = async ({ windowHours = 24 } = {}) => {
  const hours = Math.max(1, Math.min(Number(windowHours) || 24, 24 * 30));
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('analytics_events')
      .select('event, wallet_address, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) throw new Error(`[supabase] getAnalyticsSummary failed: ${error.message}`);

    const rows = data || [];
    const byEvent = new Map();
    const wallets = new Set();
    rows.forEach((row) => {
      const key = row.event || 'unknown';
      byEvent.set(key, (byEvent.get(key) || 0) + 1);
      if (row.wallet_address) wallets.add(row.wallet_address.toLowerCase());
    });
    const topEvents = Array.from(byEvent.entries())
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
    return {
      windowHours: hours,
      since: sinceIso,
      totalEvents: rows.length,
      uniqueWallets: wallets.size,
      topEvents
    };
  }

  const row = sqlite
    .prepare(
      `SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT lower(wallet_address)) as unique_wallets
       FROM analytics_events
       WHERE created_at >= ?`
    )
    .get(sinceIso);

  const topRows = sqlite
    .prepare(
      `SELECT event, COUNT(*) as count
       FROM analytics_events
       WHERE created_at >= ?
       GROUP BY event
       ORDER BY count DESC
       LIMIT 12`
    )
    .all(sinceIso);

  return {
    windowHours: hours,
    since: sinceIso,
    totalEvents: Number(row?.total_events || 0),
    uniqueWallets: Number(row?.unique_wallets || 0),
    topEvents: topRows.map((item) => ({
      event: item.event || 'unknown',
      count: Number(item.count || 0)
    }))
  };
};

const getAnalyticsMetrics = async ({ windowHours = 24 } = {}) => {
  const hours = Math.max(1, Math.min(Number(windowHours) || 24, 24 * 30));
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('analytics_events')
      .select('event, wallet_address, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(10000);
    if (error) throw new Error(`[supabase] getAnalyticsMetrics failed: ${error.message}`);

    const rows = data || [];
    const wallets = new Set();
    const eventCounts = {};
    let lastEventAt = null;
    rows.forEach((row) => {
      const event = row.event || 'unknown';
      eventCounts[event] = (eventCounts[event] || 0) + 1;
      if (row.wallet_address) {
        wallets.add(String(row.wallet_address).toLowerCase());
      }
      if (!lastEventAt || (row.created_at && row.created_at > lastEventAt)) {
        lastEventAt = row.created_at || lastEventAt;
      }
    });

    return {
      windowHours: hours,
      since: sinceIso,
      totalEvents: rows.length,
      uniqueWallets: wallets.size,
      eventCounts,
      lastEventAt
    };
  }

  const totalRow = sqlite
    .prepare(
      `SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT lower(wallet_address)) as unique_wallets,
        MAX(created_at) as last_event_at
       FROM analytics_events
       WHERE created_at >= ?`
    )
    .get(sinceIso);

  const eventRows = sqlite
    .prepare(
      `SELECT event, COUNT(*) as count
       FROM analytics_events
       WHERE created_at >= ?
       GROUP BY event`
    )
    .all(sinceIso);

  const eventCounts = {};
  eventRows.forEach((row) => {
    const event = row.event || 'unknown';
    eventCounts[event] = Number(row.count || 0);
  });

  return {
    windowHours: hours,
    since: sinceIso,
    totalEvents: Number(totalRow?.total_events || 0),
    uniqueWallets: Number(totalRow?.unique_wallets || 0),
    eventCounts,
    lastEventAt: totalRow?.last_event_at || null
  };
};

const safePct = (num, denom) => {
  if (!denom) return 0;
  return Math.round((num / denom) * 10000) / 100;
};

const bucketAnalyticsRowsByDay = (rows) => {
  const dailyMap = new Map();
  const uniqueWallets = new Set();

  rows.forEach((row) => {
    const createdAt = row.created_at || row.createdAt;
    if (!createdAt) return;
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return;
    const dayKey = date.toISOString().slice(0, 10);
    if (!dailyMap.has(dayKey)) {
      dailyMap.set(dayKey, {
        date: dayKey,
        totalEvents: 0,
        wallets: new Set(),
        eventCounts: {}
      });
    }
    const bucket = dailyMap.get(dayKey);
    bucket.totalEvents += 1;
    const event = row.event || 'unknown';
    bucket.eventCounts[event] = (bucket.eventCounts[event] || 0) + 1;
    if (row.wallet_address) {
      const normalized = String(row.wallet_address).toLowerCase();
      bucket.wallets.add(normalized);
      uniqueWallets.add(normalized);
    }
  });

  const daily = Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bucket) => ({
      date: bucket.date,
      totalEvents: bucket.totalEvents,
      uniqueWallets: bucket.wallets.size,
      eventCounts: bucket.eventCounts
    }));

  const aggregateEventCounts = {};
  daily.forEach((day) => {
    Object.entries(day.eventCounts || {}).forEach(([event, count]) => {
      aggregateEventCounts[event] = (aggregateEventCounts[event] || 0) + Number(count || 0);
    });
  });

  const walletConnect = Number(aggregateEventCounts.wallet_connect || 0);
  const borrowStart = Number(aggregateEventCounts.borrow_start || 0);
  const quoteRequested = Number(aggregateEventCounts.quote_requested || 0);
  const quoteAccepted = Number(aggregateEventCounts.quote_accepted || 0);
  const loanCreated = Number(aggregateEventCounts.loan_created || 0);

  return {
    daily,
    uniqueWallets: uniqueWallets.size,
    totalEvents: rows.length,
    funnel: {
      walletConnect,
      borrowStart,
      quoteRequested,
      quoteAccepted,
      loanCreated,
      conversionRatesPct: {
        walletToBorrowStart: safePct(borrowStart, walletConnect),
        borrowStartToQuoteRequested: safePct(quoteRequested, borrowStart),
        quoteRequestedToLoanCreated: safePct(loanCreated, quoteRequested)
      }
    }
  };
};

const getAnalyticsBenchmark = async ({ windowDays = 30 } = {}) => {
  const days = Math.max(1, Math.min(Number(windowDays) || 30, 365));
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('analytics_events')
      .select('event, wallet_address, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .limit(50000);
    if (error) throw new Error(`[supabase] getAnalyticsBenchmark failed: ${error.message}`);
    const summary = bucketAnalyticsRowsByDay(data || []);
    return {
      windowDays: days,
      since: sinceIso,
      ...summary
    };
  }

  const rows = sqlite
    .prepare(
      `SELECT event, wallet_address, created_at
       FROM analytics_events
       WHERE created_at >= ?
       ORDER BY created_at ASC`
    )
    .all(sinceIso);
  const summary = bucketAnalyticsRowsByDay(rows);
  return {
    windowDays: days,
    since: sinceIso,
    ...summary
  };
};

const listAnalyticsEvents = async ({ event = null, limit = 100 } = {}) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const ev = event ? String(event).slice(0, 120) : null;
  if (useSupabase) {
    let query = supabaseClient()
      .from('analytics_events')
      .select('id, event, page, wallet_address, properties, created_at, source');
    if (ev) query = query.eq('event', ev);
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(safeLimit);
    if (error) throw new Error(`[supabase] listAnalyticsEvents failed: ${error.message}`);
    return (data || []).map((row) => ({
      id: row.id,
      event: row.event,
      page: row.page || null,
      walletAddress: row.wallet_address || null,
      properties: row.properties || {},
      source: row.source || null,
      createdAt: row.created_at || null
    }));
  }
  if (!sqlite) return [];
  let sql =
    'SELECT id, event, page, wallet_address, properties, source, created_at FROM analytics_events';
  const args = [];
  if (ev) {
    sql += ' WHERE event = ?';
    args.push(ev);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  args.push(safeLimit);
  const rows = sqlite.prepare(sql).all(...args);
  return rows.map((row) => ({
    id: row.id,
    event: row.event,
    page: row.page || null,
    walletAddress: row.wallet_address || null,
    properties: row.properties ? JSON.parse(decryptText(row.properties)) : {},
    source: row.source || null,
    createdAt: row.created_at || null
  }));
};

const getAirdropLeaderboard = async ({
  windowDays = 30,
  limit = 200,
  phase = 'all'
} = {}) => {
  const days = Math.max(1, Math.min(Number(windowDays) || 30, 365));
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  const phaseKey = String(phase || 'all').toLowerCase();
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const phaseConfigs = {
    all: {
      label: 'All activity',
      eventWeights: {
        wallet_connect: 20,
        wallet_session_created: 24,
        page_view: 1,
        ui_click: 1,
        form_change: 0.4,
        form_submit: 10,
        borrow_start: 32,
        quote_requested: 28,
        quote_accepted: 36,
        loan_created: 50,
        loan_repaid: 38,
        repay_submit: 26,
        feedback_submitted: 22,
        frontend_error: -10,
        frontend_unhandled_rejection: -10
      },
      feedbackWeight: 22
    },
    phase1: {
      label: 'Phase 1: onboarding + baseline usage',
      eventWeights: {
        wallet_connect: 28,
        wallet_session_created: 34,
        page_view: 1,
        ui_click: 1,
        form_change: 0.5,
        form_submit: 12,
        borrow_start: 30,
        quote_requested: 24,
        feedback_submitted: 20,
        frontend_error: -8,
        frontend_unhandled_rejection: -8
      },
      feedbackWeight: 20
    },
    phase2: {
      label: 'Phase 2: lending/borrowing depth',
      eventWeights: {
        wallet_connect: 16,
        wallet_session_created: 20,
        page_view: 1,
        ui_click: 1,
        borrow_start: 34,
        quote_requested: 34,
        quote_accepted: 44,
        loan_created: 56,
        loan_repaid: 44,
        repay_submit: 32,
        feedback_submitted: 12,
        frontend_error: -12,
        frontend_unhandled_rejection: -12
      },
      feedbackWeight: 12
    },
    content: {
      label: 'Phase 3: content/community',
      eventWeights: {
        wallet_connect: 10,
        wallet_session_created: 10,
        page_view: 1,
        ui_click: 2,
        form_submit: 14,
        feedback_submitted: 30,
        frontend_error: -6,
        frontend_unhandled_rejection: -6
      },
      feedbackWeight: 30
    }
  };
  const config = phaseConfigs[phaseKey] || phaseConfigs.all;
  const eventWeights = config.eventWeights;

  const users = new Map();
  const ensureUser = (walletAddress) => {
    const normalized = String(walletAddress || '').trim().toLowerCase();
    if (!normalized) return null;
    if (!users.has(normalized)) {
      users.set(normalized, {
        walletAddress: normalized,
        eventCount: 0,
        uniqueEvents: new Set(),
        weightedEventScore: 0,
        highValueActions: 0,
        feedbackCount: 0,
        penalties: 0,
        lastSeenAt: null
      });
    }
    return users.get(normalized);
  };

  const applyEvent = ({ walletAddress, event, createdAt }) => {
    const user = ensureUser(walletAddress);
    if (!user) return;
    const eventName = String(event || 'unknown');
    user.eventCount += 1;
    user.uniqueEvents.add(eventName);
    const weight = Number(eventWeights[eventName] ?? 0);
    if (weight === 0) return;
    user.weightedEventScore += weight;
    if (weight >= 24) user.highValueActions += 1;
    if (weight < 0) user.penalties += Math.abs(weight);
    if (!user.lastSeenAt || (createdAt && createdAt > user.lastSeenAt)) {
      user.lastSeenAt = createdAt || user.lastSeenAt;
    }
  };

  if (useSupabase) {
    const { data: eventRows, error: eventError } = await supabaseClient()
      .from('analytics_events')
      .select('wallet_address, event, created_at')
      .gte('created_at', sinceIso)
      .not('wallet_address', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100000);
    if (eventError) throw new Error(`[supabase] getAirdropLeaderboard events failed: ${eventError.message}`);
    (eventRows || []).forEach((row) => {
      applyEvent({
        walletAddress: row.wallet_address,
        event: row.event,
        createdAt: row.created_at || null
      });
    });

    // Optional feedback boost when submissions include walletAddress.
    const { data: feedbackRows, error: feedbackError } = await supabaseClient()
      .from('contact_submissions')
      .select('channel, payload, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(50000);
    if (feedbackError) {
      throw new Error(`[supabase] getAirdropLeaderboard feedback failed: ${feedbackError.message}`);
    }
    (feedbackRows || []).forEach((row) => {
      const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
      const walletAddress =
        payload.walletAddress || payload.wallet_address || payload.address || '';
      const user = ensureUser(walletAddress);
      if (!user) return;
      user.feedbackCount += 1;
      user.weightedEventScore += config.feedbackWeight;
      if (!user.lastSeenAt || (row?.created_at && row.created_at > user.lastSeenAt)) {
        user.lastSeenAt = row.created_at;
      }
    });
  } else {
    const rows = sqlite
      .prepare(
        `SELECT wallet_address, event, created_at
         FROM analytics_events
         WHERE created_at >= ?
           AND wallet_address IS NOT NULL
           AND wallet_address != ''`
      )
      .all(sinceIso);
    rows.forEach((row) => {
      applyEvent({
        walletAddress: row.wallet_address,
        event: row.event,
        createdAt: row.created_at || null
      });
    });
  }

  const leaderboard = Array.from(users.values())
    .map((row) => {
      const uniqueEventScore = row.uniqueEvents.size * 4;
      const consistencyBonus = Math.min(40, Math.floor(row.eventCount / 20) * 5);
      const feedbackBonus = row.feedbackCount * 10;
      const rawScore =
        row.weightedEventScore + uniqueEventScore + consistencyBonus + feedbackBonus - row.penalties;
      return {
        walletAddress: row.walletAddress,
        score: Math.max(0, Math.round(rawScore)),
        eventCount: row.eventCount,
        uniqueEvents: row.uniqueEvents.size,
        highValueActions: row.highValueActions,
        feedbackCount: row.feedbackCount,
        penalties: row.penalties,
        lastSeenAt: row.lastSeenAt || null
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.highValueActions !== a.highValueActions) return b.highValueActions - a.highValueActions;
      return b.eventCount - a.eventCount;
    })
    .slice(0, safeLimit)
    .map((row, index) => ({
      rank: index + 1,
      ...row
    }));

  return {
    phase: phaseConfigs[phaseKey] ? phaseKey : 'all',
    phaseLabel: config.label,
    windowDays: days,
    since: sinceIso,
    totalEligibleWallets: users.size,
    leaderboard
  };
};

const saveAdminAuditLog = async ({
  action,
  actorUserId = null,
  actorWallet = null,
  actorRole = null,
  targetType = null,
  targetId = null,
  ipHash = null,
  sessionFingerprint = null,
  payload = {}
} = {}) => {
  if (!action) return null;
  const id = createId();
  const createdAt = new Date().toISOString();
  const normalizedPayload = redactAuditPayload(normalizeJson(payload || {}));

  if (useSupabase) {
    const { error } = await supabaseClient().from('admin_audit_logs').insert({
      id,
      action: String(action).slice(0, 120),
      actor_user_id: actorUserId || null,
      actor_wallet: actorWallet || null,
      actor_role: actorRole || null,
      target_type: targetType || null,
      target_id: targetId || null,
      ip_hash: ipHash || null,
      session_fingerprint: sessionFingerprint || null,
      payload: normalizedPayload,
      created_at: createdAt
    });
    if (error) throw new Error(`[supabase] saveAdminAuditLog failed: ${error.message}`);
    return { id, createdAt };
  }

  sqlite
    .prepare(
      `INSERT INTO admin_audit_logs
      (id, action, actor_user_id, actor_wallet, actor_role, target_type, target_id, ip_hash, session_fingerprint, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      String(action).slice(0, 120),
      actorUserId || null,
      actorWallet || null,
      actorRole || null,
      targetType || null,
      targetId || null,
      ipHash || null,
      sessionFingerprint || null,
      JSON.stringify(normalizedPayload),
      createdAt
    );

  return { id, createdAt };
};

const listAdminAuditLogs = async ({ limit = 100, action = null } = {}) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const actionFilter = action ? String(action).trim().slice(0, 120) : null;

  if (useSupabase) {
    let query = supabaseClient()
      .from('admin_audit_logs')
      .select(
        'id, action, actor_user_id, actor_wallet, actor_role, target_type, target_id, ip_hash, session_fingerprint, payload, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(safeLimit);
    if (actionFilter) {
      query = query.eq('action', actionFilter);
    }
    const { data, error } = await query;
    if (error) throw new Error(`[supabase] listAdminAuditLogs failed: ${error.message}`);
    return (data || []).map((row) => ({
      id: row.id,
      action: row.action,
      actorUserId: row.actor_user_id || null,
      actorWallet: row.actor_wallet || null,
      actorRole: row.actor_role || null,
      targetType: row.target_type || null,
      targetId: row.target_id || null,
      ipHash: row.ip_hash || null,
      sessionFingerprint: row.session_fingerprint || null,
      payload: row.payload || {},
      createdAt: row.created_at || null
    }));
  }

  let sql = `SELECT id, action, actor_user_id, actor_wallet, actor_role, target_type, target_id, ip_hash, session_fingerprint, payload, created_at
    FROM admin_audit_logs`;
  const args = [];
  if (actionFilter) {
    sql += ' WHERE action = ?';
    args.push(actionFilter);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  args.push(safeLimit);
  const rows = sqlite.prepare(sql).all(...args);
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorUserId: row.actor_user_id || null,
    actorWallet: row.actor_wallet || null,
    actorRole: row.actor_role || null,
    targetType: row.target_type || null,
    targetId: row.target_id || null,
    ipHash: row.ip_hash || null,
    sessionFingerprint: row.session_fingerprint || null,
    payload: (() => {
      try {
        return row.payload ? JSON.parse(row.payload) : {};
      } catch {
        return {};
      }
    })(),
    createdAt: row.created_at || null
  }));
};

const getIdentityProfileByWallet = async (walletAddress) => {
  if (!walletAddress) return null;
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('identity_profiles')
      .select('wallet_address, linked_at, identity_proof_hash, sanctions_pass, updated_at')
      .eq('wallet_address', walletAddress)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      throw new Error(`[supabase] getIdentityProfileByWallet failed: ${error.message}`);
    }
    if (!data) return null;
    return {
      walletAddress: data.wallet_address,
      linkedAt: data.linked_at || null,
      identityProofHash: data.identity_proof_hash || null,
      sanctionsPass:
        data.sanctions_pass === null || data.sanctions_pass === undefined
          ? null
          : Boolean(data.sanctions_pass),
      updatedAt: data.updated_at || null
    };
  }

  const row = sqlite
    .prepare(
      `SELECT wallet_address, linked_at, identity_proof_hash, sanctions_pass, updated_at
       FROM identity_profiles
       WHERE wallet_address = ?`
    )
    .get(walletAddress);
  if (!row) return null;
  return {
    walletAddress: row.wallet_address,
    linkedAt: row.linked_at || null,
    identityProofHash: row.identity_proof_hash || null,
    sanctionsPass:
      row.sanctions_pass === null || row.sanctions_pass === undefined
        ? null
        : Boolean(row.sanctions_pass),
    updatedAt: row.updated_at || null
  };
};

const upsertIdentityProfile = async ({
  walletAddress,
  linkedAt = null,
  identityProofHash = null,
  sanctionsPass = null
} = {}) => {
  if (!walletAddress) return null;
  const now = new Date().toISOString();
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('identity_profiles')
      .upsert(
        {
          wallet_address: walletAddress,
          linked_at: linkedAt,
          identity_proof_hash: identityProofHash,
          sanctions_pass: sanctionsPass,
          updated_at: now
        },
        { onConflict: 'wallet_address' }
      )
      .select('wallet_address, linked_at, identity_proof_hash, sanctions_pass, updated_at')
      .single();
    if (error) throw new Error(`[supabase] upsertIdentityProfile failed: ${error.message}`);
    return {
      walletAddress: data.wallet_address,
      linkedAt: data.linked_at || null,
      identityProofHash: data.identity_proof_hash || null,
      sanctionsPass:
        data.sanctions_pass === null || data.sanctions_pass === undefined
          ? null
          : Boolean(data.sanctions_pass),
      updatedAt: data.updated_at || null
    };
  }

  sqlite
    .prepare(
      `INSERT INTO identity_profiles (wallet_address, linked_at, identity_proof_hash, sanctions_pass, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(wallet_address) DO UPDATE SET
         linked_at = excluded.linked_at,
         identity_proof_hash = excluded.identity_proof_hash,
         sanctions_pass = excluded.sanctions_pass,
         updated_at = excluded.updated_at`
    )
    .run(
      walletAddress,
      linkedAt,
      identityProofHash,
      sanctionsPass === null || sanctionsPass === undefined ? null : sanctionsPass ? 1 : 0,
      now
    );

  return getIdentityProfileByWallet(walletAddress);
};

const listIdentityAttestations = async (walletAddress) => {
  if (!walletAddress) return [];
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('identity_attestations')
      .select(
        'id, wallet_address, provider, score, stamps_count, verified_at, expires_at, metadata, created_at, updated_at'
      )
      .eq('wallet_address', walletAddress)
      .order('verified_at', { ascending: false });
    if (error) throw new Error(`[supabase] listIdentityAttestations failed: ${error.message}`);
    return (data || []).map((row) => ({
      id: row.id,
      walletAddress: row.wallet_address,
      provider: row.provider,
      score: row.score === null || row.score === undefined ? null : Number(row.score),
      stampsCount:
        row.stamps_count === null || row.stamps_count === undefined
          ? null
          : Number(row.stamps_count),
      verifiedAt: row.verified_at || null,
      expiresAt: row.expires_at || null,
      metadata: row.metadata || {},
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    }));
  }

  const rows = sqlite
    .prepare(
      `SELECT id, wallet_address, provider, score, stamps_count, verified_at, expires_at, metadata, created_at, updated_at
       FROM identity_attestations
       WHERE wallet_address = ?
       ORDER BY verified_at DESC`
    )
    .all(walletAddress);

  return rows.map((row) => ({
    id: row.id,
    walletAddress: row.wallet_address,
    provider: row.provider,
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    stampsCount:
      row.stamps_count === null || row.stamps_count === undefined
        ? null
        : Number(row.stamps_count),
    verifiedAt: row.verified_at || null,
    expiresAt: row.expires_at || null,
    metadata: (() => {
      try {
        return row.metadata ? JSON.parse(row.metadata) : {};
      } catch {
        return {};
      }
    })(),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  }));
};

const upsertIdentityAttestation = async ({
  walletAddress,
  provider,
  score = null,
  stampsCount = null,
  verifiedAt = null,
  expiresAt = null,
  metadata = {}
} = {}) => {
  if (!walletAddress || !provider) return null;
  const now = new Date().toISOString();
  const id = createId();
  const normalizedMetadata = normalizeJson(metadata || {});

  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('identity_attestations')
      .upsert(
        {
          id,
          wallet_address: walletAddress,
          provider: String(provider).toLowerCase(),
          score,
          stamps_count: stampsCount,
          verified_at: verifiedAt || now,
          expires_at: expiresAt,
          metadata: normalizedMetadata,
          updated_at: now
        },
        { onConflict: 'wallet_address,provider' }
      )
      .select(
        'id, wallet_address, provider, score, stamps_count, verified_at, expires_at, metadata, created_at, updated_at'
      )
      .single();
    if (error) throw new Error(`[supabase] upsertIdentityAttestation failed: ${error.message}`);
    return {
      id: data.id,
      walletAddress: data.wallet_address,
      provider: data.provider,
      score: data.score === null || data.score === undefined ? null : Number(data.score),
      stampsCount:
        data.stamps_count === null || data.stamps_count === undefined
          ? null
          : Number(data.stamps_count),
      verifiedAt: data.verified_at || null,
      expiresAt: data.expires_at || null,
      metadata: data.metadata || {},
      createdAt: data.created_at || null,
      updatedAt: data.updated_at || null
    };
  }

  sqlite
    .prepare(
      `INSERT INTO identity_attestations
      (id, wallet_address, provider, score, stamps_count, verified_at, expires_at, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(wallet_address, provider) DO UPDATE SET
        score = excluded.score,
        stamps_count = excluded.stamps_count,
        verified_at = excluded.verified_at,
        expires_at = excluded.expires_at,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at`
    )
    .run(
      id,
      walletAddress,
      String(provider).toLowerCase(),
      score,
      stampsCount,
      verifiedAt || now,
      expiresAt,
      JSON.stringify(normalizedMetadata),
      now,
      now
    );

  const rows = await listIdentityAttestations(walletAddress);
  return rows.find((item) => item.provider === String(provider).toLowerCase()) || null;
};

const saveVestingSource = async ({
  chainId,
  vestingContract,
  protocol = 'manual',
  lockupAddress = null,
  streamId = null
}) => {
  const id = createId();
  const createdAt = new Date().toISOString();
  if (useSupabase) {
    const { error } = await supabaseClient().from('vesting_sources').upsert(
      {
        id,
        chain_id: String(chainId),
        vesting_contract: String(vestingContract),
        protocol: String(protocol),
        lockup_address: lockupAddress || null,
        stream_id: streamId || null,
        created_at: createdAt
      },
      { onConflict: 'id' }
    );
    if (error) throw new Error(`[supabase] saveVestingSource failed: ${error.message}`);
    return { id, createdAt };
  }
  sqlite
    .prepare(
      `INSERT INTO vesting_sources (id, chain_id, vesting_contract, protocol, lockup_address, stream_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, String(chainId), String(vestingContract), String(protocol), lockupAddress || null, streamId || null, createdAt);
  return { id, createdAt };
};

const createFundraisingSource = async ({
  projectId,
  token = null,
  treasury = null,
  chain,
  vestingPolicyRef = null
}) => {
  const id = createId();
  const now = new Date().toISOString();
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('fundraising_sources')
      .insert({
        id,
        project_id: String(projectId),
        token: token || null,
        treasury: treasury || null,
        chain: String(chain),
        vesting_policy_ref: vestingPolicyRef || null,
        created_at: now,
        updated_at: now
      })
      .select('id, project_id, token, treasury, chain, vesting_policy_ref, created_at, updated_at')
      .single();
    if (error) throw new Error(`[supabase] createFundraisingSource failed: ${error.message}`);
    return data;
  }
  sqlite
    .prepare(
      `INSERT INTO fundraising_sources (id, project_id, token, treasury, chain, vesting_policy_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, String(projectId), token || null, treasury || null, String(chain), vestingPolicyRef || null, now, now);
  return { id, projectId: String(projectId), token, treasury, chain: String(chain), vestingPolicyRef, createdAt: now, updatedAt: now };
};

const getFundraisingSource = async (id) => {
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('fundraising_sources')
      .select('id, project_id, token, treasury, chain, vesting_policy_ref, created_at, updated_at')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return {
      id: data.id,
      projectId: data.project_id,
      token: data.token,
      treasury: data.treasury,
      chain: data.chain,
      vestingPolicyRef: data.vesting_policy_ref,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }
  const row = sqlite.prepare('SELECT * FROM fundraising_sources WHERE id = ?').get(id);
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    token: row.token,
    treasury: row.treasury,
    chain: row.chain,
    vestingPolicyRef: row.vesting_policy_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const listFundraisingSources = async ({ projectId = null, chain = null, limit = 50 } = {}) => {
  if (useSupabase) {
    let q = supabaseClient().from('fundraising_sources').select('id, project_id, token, treasury, chain, vesting_policy_ref, created_at, updated_at').order('created_at', { ascending: false }).limit(limit);
    if (projectId) q = q.eq('project_id', projectId);
    if (chain) q = q.eq('chain', chain);
    const { data, error } = await q;
    if (error) throw new Error(`[supabase] listFundraisingSources failed: ${error.message}`);
    return (data || []).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      token: row.token,
      treasury: row.treasury,
      chain: row.chain,
      vestingPolicyRef: row.vesting_policy_ref,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  let sql = 'SELECT * FROM fundraising_sources';
  const params = [];
  const conditions = [];
  if (projectId) { conditions.push('project_id = ?'); params.push(projectId); }
  if (chain) { conditions.push('chain = ?'); params.push(chain); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  const rows = sqlite.prepare(sql).all(...params);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    token: row.token,
    treasury: row.treasury,
    chain: row.chain,
    vestingPolicyRef: row.vesting_policy_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
};

const updateFundraisingSource = async (id, { token = null, treasury = null, vestingPolicyRef = null }) => {
  const now = new Date().toISOString();
  if (useSupabase) {
    const updates = { updated_at: now };
    if (token !== undefined) updates.token = token;
    if (treasury !== undefined) updates.treasury = treasury;
    if (vestingPolicyRef !== undefined) updates.vesting_policy_ref = vestingPolicyRef;
    const { data, error } = await supabaseClient().from('fundraising_sources').update(updates).eq('id', id).select().single();
    if (error) throw new Error(`[supabase] updateFundraisingSource failed: ${error.message}`);
    return data;
  }
  const row = sqlite.prepare('SELECT * FROM fundraising_sources WHERE id = ?').get(id);
  if (!row) return null;
  const updates = [];
  const params = [];
  if (token !== undefined) { updates.push('token = ?'); params.push(token); }
  if (treasury !== undefined) { updates.push('treasury = ?'); params.push(treasury); }
  if (vestingPolicyRef !== undefined) { updates.push('vesting_policy_ref = ?'); params.push(vestingPolicyRef); }
  if (!updates.length) return row;
  params.push(now, id);
  sqlite.prepare(`UPDATE fundraising_sources SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`).run(...params);
  return sqlite.prepare('SELECT * FROM fundraising_sources WHERE id = ?').get(id);
};

// --- Risk flags (founder/insider wallet-token flagging; internal only) ---

const createRiskFlag = async ({ walletAddress, tokenAddress = null, flagType, source = 'manual', metadata = null }) => {
  const id = createId();
  const wallet = String(walletAddress || '').trim().toLowerCase();
  const token = tokenAddress ? String(tokenAddress).trim().toLowerCase() : null;
  if (!wallet || !flagType) throw new Error('walletAddress and flagType required');
  if (useSupabase) {
    const { error } = await supabaseClient().from('risk_flags').insert({
      id,
      wallet_address: wallet,
      token_address: token,
      flag_type: String(flagType),
      source: String(source || 'manual'),
      metadata: metadata ? normalizeJson(metadata) : null
    });
    if (error) throw new Error(`risk_flags insert: ${error.message}`);
    return { id, walletAddress: wallet, tokenAddress: token, flagType: String(flagType), source: String(source || 'manual'), metadata, createdAt: new Date().toISOString() };
  }
  sqlite.prepare(
    `INSERT INTO risk_flags (id, wallet_address, token_address, flag_type, source, metadata) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, wallet, token, String(flagType), String(source || 'manual'), metadata ? JSON.stringify(metadata) : null);
  return { id, walletAddress: wallet, tokenAddress: token, flagType: String(flagType), source: String(source || 'manual'), metadata, createdAt: new Date().toISOString() };
};

const getRiskFlags = async ({ walletAddress = null, tokenAddress = null } = {}) => {
  if (useSupabase) {
    let q = supabaseClient().from('risk_flags').select('id, wallet_address, token_address, flag_type, source, metadata, created_at').order('created_at', { ascending: false });
    if (walletAddress) q = q.eq('wallet_address', String(walletAddress).trim().toLowerCase());
    if (tokenAddress) q = q.eq('token_address', String(tokenAddress).trim().toLowerCase());
    const { data, error } = await q.limit(500);
    if (error) throw new Error(`risk_flags get: ${error.message}`);
    return (data || []).map((r) => ({
      id: r.id,
      walletAddress: r.wallet_address,
      tokenAddress: r.token_address,
      flagType: r.flag_type,
      source: r.source,
      metadata: r.metadata,
      createdAt: r.created_at
    }));
  }
  let sql = 'SELECT id, wallet_address, token_address, flag_type, source, metadata, created_at FROM risk_flags WHERE 1=1';
  const params = [];
  if (walletAddress) { sql += ' AND wallet_address = ?'; params.push(String(walletAddress).trim().toLowerCase()); }
  if (tokenAddress) { sql += ' AND token_address = ?'; params.push(String(tokenAddress).trim().toLowerCase()); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  const rows = sqlite.prepare(sql).all(...params);
  return rows.map((r) => ({
    id: r.id,
    walletAddress: r.wallet_address,
    tokenAddress: r.token_address,
    flagType: r.flag_type,
    source: r.source,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
    createdAt: r.created_at
  }));
};

const deleteRiskFlag = async (id) => {
  if (useSupabase) {
    const { error } = await supabaseClient().from('risk_flags').delete().eq('id', id);
    if (error) throw new Error(`risk_flags delete: ${error.message}`);
    return true;
  }
  const r = sqlite.prepare('DELETE FROM risk_flags WHERE id = ?').run(id);
  return r.changes > 0;
};

const listFlaggedWallets = async (limit = 200) => {
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('risk_flags')
      .select('wallet_address')
      .order('created_at', { ascending: false })
      .limit(limit * 2);
    if (error) throw new Error(`risk_flags list: ${error.message}`);
    const seen = new Set();
    const out = [];
    for (const r of data || []) {
      if (r.wallet_address && !seen.has(r.wallet_address)) { seen.add(r.wallet_address); out.push(r.wallet_address); if (out.length >= limit) break; }
    }
    return out;
  }
  const rows = sqlite.prepare('SELECT DISTINCT wallet_address FROM risk_flags ORDER BY created_at DESC LIMIT ?').all(limit);
  return rows.map((r) => r.wallet_address);
};

const listFlaggedTokens = async (limit = 200) => {
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('risk_flags')
      .select('token_address')
      .not('token_address', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit * 2);
    if (error) throw new Error(`risk_flags list: ${error.message}`);
    const seen = new Set();
    const out = [];
    for (const r of data || []) {
      if (r.token_address && !seen.has(r.token_address)) { seen.add(r.token_address); out.push(r.token_address); if (out.length >= limit) break; }
    }
    return out;
  }
  const rows = sqlite.prepare('SELECT DISTINCT token_address FROM risk_flags WHERE token_address IS NOT NULL ORDER BY created_at DESC LIMIT ?').all(limit);
  return rows.map((r) => r.token_address);
};

const getLoanExposureByToken = async (tokenAddress, chain = null) => {
  const token = String(tokenAddress || '').trim().toLowerCase();
  if (!token) return 0;
  if (useSupabase) {
    let q = supabaseClient().from('loan_token_exposure').select('amount_usd').eq('token_address', token);
    if (chain) q = q.eq('chain', String(chain));
    const { data, error } = await q;
    if (error) throw new Error(`[supabase] getLoanExposureByToken failed: ${error.message}`);
    return (data || []).reduce((sum, r) => sum + Number(r.amount_usd || 0), 0);
  }
  let sql = 'SELECT COALESCE(SUM(amount_usd), 0) AS total FROM loan_token_exposure WHERE token_address = ?';
  const params = [token];
  if (chain) { sql += ' AND chain = ?'; params.push(String(chain)); }
  const row = sqlite.prepare(sql).get(...params);
  return Number(row?.total ?? 0);
};

const upsertLoanTokenExposure = async ({ loanId, chain = 'base', tokenAddress, amountUsd }) => {
  const loan = String(loanId || '');
  const ch = String(chain || 'base');
  const token = String(tokenAddress || '').trim().toLowerCase();
  const amount = Number(amountUsd);
  if (!loan || !token) return;
  if (useSupabase) {
    const { error } = await supabaseClient().from('loan_token_exposure').upsert(
      { loan_id: loan, chain: ch, token_address: token, amount_usd: amount, created_at: new Date().toISOString() },
      { onConflict: 'loan_id,chain' }
    );
    if (error) throw new Error(`[supabase] upsertLoanTokenExposure failed: ${error.message}`);
    return;
  }
  sqlite.prepare(
    'INSERT INTO loan_token_exposure (loan_id, chain, token_address, amount_usd) VALUES (?, ?, ?, ?) ON CONFLICT(loan_id, chain) DO UPDATE SET token_address = excluded.token_address, amount_usd = excluded.amount_usd'
  ).run(loan, ch, token, amount);
};

const deleteLoanTokenExposure = async (loanId, chain = 'base') => {
  const loan = String(loanId || '');
  const ch = String(chain || 'base');
  if (!loan) return;
  if (useSupabase) {
    const { error } = await supabaseClient()
      .from('loan_token_exposure')
      .delete()
      .eq('loan_id', loan)
      .eq('chain', ch);
    if (error) throw new Error(`[supabase] deleteLoanTokenExposure failed: ${error.message}`);
    return;
  }
  sqlite.prepare('DELETE FROM loan_token_exposure WHERE loan_id = ? AND chain = ?').run(loan, ch);
};

const getExposureByTokenList = async (chain = null) => {
  if (useSupabase) {
    let q = supabaseClient().from('loan_token_exposure').select('token_address, amount_usd');
    if (chain) q = q.eq('chain', String(chain));
    const { data, error } = await q;
    if (error) throw new Error(`[supabase] getExposureByTokenList failed: ${error.message}`);
    const byToken = {};
    (data || []).forEach((r) => {
      const t = (r.token_address || '').toLowerCase();
      if (!t) return;
      byToken[t] = (byToken[t] || 0) + Number(r.amount_usd || 0);
    });
    return Object.entries(byToken).map(([token, exposureUsd]) => ({ token, exposureUsd }));
  }
  let sql = 'SELECT token_address, SUM(amount_usd) AS total FROM loan_token_exposure WHERE 1=1';
  const params = [];
  if (chain) { sql += ' AND chain = ?'; params.push(String(chain)); }
  sql += ' GROUP BY token_address';
  const rows = sqlite.prepare(sql).all(...params);
  return rows.map((r) => ({ token: (r.token_address || '').toLowerCase(), exposureUsd: Number(r.total || 0) }));
};

// --- Lender privacy-lite aggregates ---
//
// Returns exposure totals without revealing which tokens are involved.
// This is safe for "portfolio-light" lender dashboards and public metrics pages.
const getExposureTotals = async (chain = null) => {
  const ch = chain ? String(chain) : null;
  if (useSupabase) {
    let exposureQuery = supabaseClient().from('loan_token_exposure').select('token_address, amount_usd');
    if (ch) exposureQuery = exposureQuery.eq('chain', ch);
    const { data: exposureRows, error: exposureErr } = await exposureQuery;
    if (exposureErr) throw new Error(`[supabase] getExposureTotals exposure failed: ${exposureErr.message}`);

    const { data: flaggedRows, error: flaggedErr } = await supabaseClient()
      .from('risk_flags')
      .select('token_address')
      .not('token_address', 'is', null);
    if (flaggedErr) throw new Error(`[supabase] getExposureTotals flags failed: ${flaggedErr.message}`);

    const flagged = new Set((flaggedRows || []).map((r) => String(r.token_address || '').toLowerCase()).filter(Boolean));
    let totalExposureUsd = 0;
    let flaggedExposureUsd = 0;
    let uniqueTokenCount = 0;
    let uniqueFlaggedTokenCount = 0;
    const seenTokens = new Set();
    const seenFlaggedTokens = new Set();

    (exposureRows || []).forEach((r) => {
      const token = String(r.token_address || '').toLowerCase();
      const amount = Number(r.amount_usd || 0);
      totalExposureUsd += amount;
      if (token && !seenTokens.has(token)) {
        seenTokens.add(token);
        uniqueTokenCount += 1;
      }
      if (token && flagged.has(token)) {
        flaggedExposureUsd += amount;
        if (!seenFlaggedTokens.has(token)) {
          seenFlaggedTokens.add(token);
          uniqueFlaggedTokenCount += 1;
        }
      }
    });
    return {
      chain: ch,
      totalExposureUsd,
      flaggedExposureUsd,
      uniqueTokenCount,
      uniqueFlaggedTokenCount
    };
  }

  // SQLite
  let sqlTotal = 'SELECT COALESCE(SUM(amount_usd), 0) AS total FROM loan_token_exposure WHERE 1=1';
  const paramsTotal = [];
  if (ch) { sqlTotal += ' AND chain = ?'; paramsTotal.push(ch); }
  const rowTotal = sqlite.prepare(sqlTotal).get(...paramsTotal);

  let sqlFlagged = `
    SELECT COALESCE(SUM(lte.amount_usd), 0) AS total
    FROM loan_token_exposure lte
    WHERE 1=1
      AND EXISTS (
        SELECT 1
        FROM risk_flags rf
        WHERE rf.token_address IS NOT NULL
          AND LOWER(rf.token_address) = LOWER(lte.token_address)
      )
  `;
  const paramsFlagged = [];
  if (ch) { sqlFlagged += ' AND lte.chain = ?'; paramsFlagged.push(ch); }
  const rowFlagged = sqlite.prepare(sqlFlagged).get(...paramsFlagged);

  let sqlUnique = 'SELECT COUNT(DISTINCT token_address) AS total FROM loan_token_exposure WHERE 1=1';
  const paramsUnique = [];
  if (ch) { sqlUnique += ' AND chain = ?'; paramsUnique.push(ch); }
  const rowUnique = sqlite.prepare(sqlUnique).get(...paramsUnique);

  let sqlUniqueFlagged = `
    SELECT COUNT(DISTINCT lte.token_address) AS total
    FROM loan_token_exposure lte
    WHERE 1=1
      AND EXISTS (
        SELECT 1
        FROM risk_flags rf
        WHERE rf.token_address IS NOT NULL
          AND LOWER(rf.token_address) = LOWER(lte.token_address)
      )
  `;
  const paramsUniqueFlagged = [];
  if (ch) { sqlUniqueFlagged += ' AND lte.chain = ?'; paramsUniqueFlagged.push(ch); }
  const rowUniqueFlagged = sqlite.prepare(sqlUniqueFlagged).get(...paramsUniqueFlagged);

  return {
    chain: ch,
    totalExposureUsd: Number(rowTotal?.total ?? 0),
    flaggedExposureUsd: Number(rowFlagged?.total ?? 0),
    uniqueTokenCount: Number(rowUnique?.total ?? 0),
    uniqueFlaggedTokenCount: Number(rowUniqueFlagged?.total ?? 0)
  };
};

// --- Repayment job queue (always-on sweeps) ---

const createRepayJob = async ({ chainType = 'solana', ownerWallet, maxUsdc = null } = {}) => {
  const chain = normalizeChainType(chainType);
  const owner = String(ownerWallet || '').trim();
  if (!owner) throw new Error('ownerWallet required');
  const id = createId();
  const now = new Date().toISOString();
  const payload = {
    id,
    chain_type: chain,
    owner_wallet: owner,
    max_usdc: maxUsdc === null || maxUsdc === undefined ? null : String(maxUsdc),
    status: 'pending',
    last_error: null,
    created_at: now,
    updated_at: now
  };
  if (useSupabase) {
    const { error } = await supabaseClient().from('repay_jobs').insert(payload);
    if (error) throw new Error(`[supabase] createRepayJob failed: ${error.message}`);
    return { id, chainType: chain, ownerWallet: owner, maxUsdc: payload.max_usdc, status: 'pending' };
  }
  sqlite
    .prepare(
      `INSERT INTO repay_jobs (id, chain_type, owner_wallet, max_usdc, status, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      payload.id,
      payload.chain_type,
      payload.owner_wallet,
      payload.max_usdc,
      payload.status,
      payload.last_error,
      payload.created_at,
      payload.updated_at
    );
  return { id, chainType: chain, ownerWallet: owner, maxUsdc: payload.max_usdc, status: 'pending' };
};

const listPendingRepayJobs = async ({ chainType = null, limit = 20 } = {}) => {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 200));
  const chain = chainType ? normalizeChainType(chainType) : null;
  if (useSupabase) {
    let q = supabaseClient()
      .from('repay_jobs')
      .select('id, chain_type, owner_wallet, max_usdc, status, last_error, created_at, updated_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(safeLimit);
    if (chain) q = q.eq('chain_type', chain);
    const { data, error } = await q;
    if (error) throw new Error(`[supabase] listPendingRepayJobs failed: ${error.message}`);
    return (data || []).map((row) => ({
      id: row.id,
      chainType: row.chain_type,
      ownerWallet: row.owner_wallet,
      maxUsdc: row.max_usdc,
      status: row.status,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
  let sql =
    'SELECT id, chain_type, owner_wallet, max_usdc, status, last_error, created_at, updated_at FROM repay_jobs WHERE status = ?';
  const params = ['pending'];
  if (chain) {
    sql += ' AND chain_type = ?';
    params.push(chain);
  }
  sql += ' ORDER BY created_at ASC LIMIT ?';
  params.push(safeLimit);
  const rows = sqlite.prepare(sql).all(...params);
  return rows.map((row) => ({
    id: row.id,
    chainType: row.chain_type,
    ownerWallet: row.owner_wallet,
    maxUsdc: row.max_usdc,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
};

const updateRepayJob = async ({ id, status, lastError = null } = {}) => {
  if (!id || !status) throw new Error('id and status required');
  const now = new Date().toISOString();
  if (useSupabase) {
    const { error } = await supabaseClient()
      .from('repay_jobs')
      .update({
        status: String(status),
        last_error: lastError ? String(lastError).slice(0, 800) : null,
        updated_at: now
      })
      .eq('id', String(id));
    if (error) throw new Error(`[supabase] updateRepayJob failed: ${error.message}`);
    return true;
  }
  sqlite
    .prepare(
      `UPDATE repay_jobs
       SET status = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(String(status), lastError ? String(lastError).slice(0, 800) : null, now, String(id));
  return true;
};

const listVestingSources = async ({ chainId, protocol, limit = 100 } = {}) => {
  if (useSupabase) {
    let q = supabaseClient()
      .from('vesting_sources')
      .select('id, chain_id, vesting_contract, protocol, lockup_address, stream_id, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (chainId) q = q.eq('chain_id', String(chainId));
    if (protocol) q = q.eq('protocol', String(protocol));
    const { data, error } = await q;
    if (error) throw new Error(`[supabase] listVestingSources failed: ${error.message}`);
    return (data || []).map((r) => ({
      id: r.id,
      chainId: r.chain_id,
      vestingContract: r.vesting_contract,
      protocol: r.protocol,
      lockupAddress: r.lockup_address,
      streamId: r.stream_id,
      createdAt: r.created_at
    }));
  }
  let sql = 'SELECT id, chain_id, vesting_contract, protocol, lockup_address, stream_id, created_at FROM vesting_sources WHERE 1=1';
  const params = [];
  if (chainId) { sql += ' AND chain_id = ?'; params.push(String(chainId)); }
  if (protocol) { sql += ' AND protocol = ?'; params.push(String(protocol)); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  const rows = sqlite.prepare(sql).all(...params);
  return rows.map((r) => ({
    id: r.id,
    chainId: r.chain_id,
    vestingContract: r.vesting_contract,
    protocol: r.protocol,
    lockupAddress: r.lockup_address,
    streamId: r.stream_id,
    createdAt: r.created_at
  }));
};

const getPrivacyVaultByUser = async (userId, chainType = 'evm') => {
  if (!userId) return null;
  const chain = normalizeChainType(chainType);
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('privacy_vaults')
      .select('id, user_id, chain_type, vault_address, created_at, updated_at')
      .eq('user_id', String(userId))
      .eq('chain_type', chain)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      throw new Error(`[supabase] getPrivacyVaultByUser failed: ${error.message}`);
    }
    if (!data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      chainType: data.chain_type,
      vaultAddress: data.vault_address,
      createdAt: data.created_at || null,
      updatedAt: data.updated_at || null
    };
  }
  const row = sqlite
    .prepare(
      'SELECT id, user_id, chain_type, vault_address, created_at, updated_at FROM privacy_vaults WHERE user_id = ? AND chain_type = ?'
    )
    .get(String(userId), chain);
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    chainType: row.chain_type,
    vaultAddress: row.vault_address,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
};

const upsertPrivacyVault = async ({ userId, chainType = 'evm', vaultAddress } = {}) => {
  if (!userId || !vaultAddress) throw new Error('userId and vaultAddress required');
  const chain = normalizeChainType(chainType);
  const now = new Date().toISOString();
  if (useSupabase) {
    const payload = {
      id: createId(),
      user_id: String(userId),
      chain_type: chain,
      vault_address: String(vaultAddress),
      created_at: now,
      updated_at: now
    };
    const { data, error } = await supabaseClient()
      .from('privacy_vaults')
      .upsert(payload, { onConflict: 'user_id,chain_type' })
      .select('id, user_id, chain_type, vault_address, created_at, updated_at')
      .single();
    if (error) throw new Error(`[supabase] upsertPrivacyVault failed: ${error.message}`);
    return {
      id: data.id,
      userId: data.user_id,
      chainType: data.chain_type,
      vaultAddress: data.vault_address,
      createdAt: data.created_at || null,
      updatedAt: data.updated_at || null
    };
  }
  const existing = sqlite
    .prepare('SELECT id FROM privacy_vaults WHERE user_id = ? AND chain_type = ?')
    .get(String(userId), chain);
  const id = existing?.id || createId();
  sqlite
    .prepare(
      `INSERT INTO privacy_vaults (id, user_id, chain_type, vault_address, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, chain_type) DO UPDATE SET
         vault_address = excluded.vault_address,
         updated_at = excluded.updated_at`
    )
    .run(id, String(userId), chain, String(vaultAddress), now, now);
  return getPrivacyVaultByUser(userId, chainType);
};

// --- Vestra Premium Privacy: data minimization (SQLite mode) ---
//
// This is intentionally simple: we enforce retention by deleting old rows. For local
// demos + MVP environments, this is safer than indefinitely storing sensitive chat,
// analytics, and geo presence data.
const purgeSensitiveData = async () => {
  if (useSupabase) return { ok: true, skipped: 'supabase' };
  if (!sqlite) return { ok: false, error: 'sqlite not initialized' };

  const daysAgent = Math.max(1, Math.min(Number(process.env.RETENTION_DAYS_AGENT_CONVERSATIONS || 14), 365));
  const daysAnalytics = Math.max(1, Math.min(Number(process.env.RETENTION_DAYS_ANALYTICS_EVENTS || 30), 365));
  const daysGeo = Math.max(1, Math.min(Number(process.env.RETENTION_DAYS_USER_GEO_PRESENCE || 7), 365));

  // ISO timestamps sort lexicographically, so we can compare text.
  const cutoffAgent = new Date(Date.now() - daysAgent * 24 * 60 * 60 * 1000).toISOString();
  const cutoffAnalytics = new Date(Date.now() - daysAnalytics * 24 * 60 * 60 * 1000).toISOString();
  const cutoffGeo = new Date(Date.now() - daysGeo * 24 * 60 * 60 * 1000).toISOString();

  const deleted = { agentConversations: 0, analyticsEvents: 0, geoPresence: 0, expiredSessions: 0 };
  try {
    deleted.agentConversations = sqlite
      .prepare('DELETE FROM agent_conversations WHERE created_at IS NOT NULL AND created_at < ?')
      .run(cutoffAgent).changes;
  } catch (_) { }
  try {
    deleted.analyticsEvents = sqlite
      .prepare('DELETE FROM analytics_events WHERE created_at IS NOT NULL AND created_at < ?')
      .run(cutoffAnalytics).changes;
  } catch (_) { }
  try {
    deleted.geoPresence = sqlite
      .prepare('DELETE FROM user_geo_presence WHERE updated_at IS NOT NULL AND updated_at < ?')
      .run(cutoffGeo).changes;
  } catch (_) { }
  try {
    const nowIso = new Date().toISOString();
    deleted.expiredSessions = sqlite
      .prepare('DELETE FROM app_sessions WHERE expires_at IS NOT NULL AND expires_at < ?')
      .run(nowIso).changes;
  } catch (_) { }

  return { ok: true, deleted };
};

const consumeRelayerNonce = async ({ userId, action = 'unknown', nonce, expiresAt = null } = {}) => {
  if (!userId || !nonce) throw new Error('userId and nonce required');
  const now = new Date().toISOString();
  const expiresIso =
    expiresAt && Number.isFinite(Number(expiresAt))
      ? new Date(Number(expiresAt) * 1000).toISOString()
      : null;

  if (useSupabase) {
    const client = supabaseClient();
    // Best-effort cleanup of expired rows.
    try {
      await client.from('relayer_nonces').delete().lt('expires_at', now);
    } catch (_) { }
    const { data, error } = await client
      .from('relayer_nonces')
      .insert({
        id: createId(),
        user_id: String(userId),
        action: String(action || 'unknown').slice(0, 80),
        nonce: String(nonce).slice(0, 200),
        expires_at: expiresIso,
        created_at: now
      })
      .select('id')
      .single();
    if (error) {
      if (String(error.message || '').toLowerCase().includes('duplicate')) {
        throw new Error('Nonce already used');
      }
      throw new Error(`[supabase] consumeRelayerNonce failed: ${error.message}`);
    }
    return { id: data?.id || null };
  }

  // SQLite
  try {
    sqlite
      .prepare('DELETE FROM relayer_nonces WHERE expires_at IS NOT NULL AND expires_at < ?')
      .run(now);
  } catch (_) { }
  const id = createId();
  try {
    sqlite
      .prepare(
        `INSERT INTO relayer_nonces (id, user_id, action, nonce, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, String(userId), String(action || 'unknown').slice(0, 80), String(nonce).slice(0, 200), expiresIso, now);
  } catch (error) {
    const msg = String(error?.message || '');
    if (msg.includes('UNIQUE') || msg.toLowerCase().includes('constraint')) {
      throw new Error('Nonce already used');
    }
    throw error;
  }
  return { id };
};

module.exports = {
  init,
  useSupabase,
  loadEvents,
  saveEvents,
  loadSnapshots,
  saveSnapshot,
  getMeta,
  setMeta,
  deleteMeta,
  clearIndexerCache,
  insertSubmission,
  insertNotification,
  getOrCreateUserByWallet,
  linkWalletToUser,
  listWalletLinksByUser,
  getLinkedEvmWallet,
  createSession,
  getNonceSession,
  getNonceSessionByProvider,
  getSessionByToken,
  deleteSession,
  clearSessionsByProvider,
  upsertUserGeoPresence,
  listGeoPings,
  createPool,
  updatePoolPreferences,
  listPools,
  getPoolById,
  createMatchEvent,
  getPoints,
  updatePoints,
  getLeaderboard,
  listRecentAgentConversations,
  saveAgentConversation,
  saveAnalyticsEvent,
  getAnalyticsSummary,
  getAnalyticsMetrics,
  getAnalyticsBenchmark,
  listAnalyticsEvents,
  getAirdropLeaderboard,
  saveAdminAuditLog,
  listAdminAuditLogs,
  getIdentityProfileByWallet,
  upsertIdentityProfile,
  listIdentityAttestations,
  upsertIdentityAttestation,
  saveVestingSource,
  createFundraisingSource,
  getFundraisingSource,
  listFundraisingSources,
  updateFundraisingSource,
  createRiskFlag,
  getRiskFlags,
  deleteRiskFlag,
  listFlaggedWallets,
  listFlaggedTokens,
  getLoanExposureByToken,
  upsertLoanTokenExposure,
  deleteLoanTokenExposure,
  getExposureByTokenList,
  getExposureTotals,
  listVestingSources,
  getPrivacyVaultByUser,
  upsertPrivacyVault,
  purgeSensitiveData,
  consumeRelayerNonce,
  createRepayJob,
  listPendingRepayJobs,
  updateRepayJob,
  getSqlite: () => sqlite
};
