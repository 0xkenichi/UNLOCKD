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

const createId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');

const normalizeJson = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, val) =>
      typeof val === 'bigint' ? val.toString() : val
    )
  );

const toEvent = (row) => ({
  txHash: row.tx_hash || row.txHash,
  logIndex: Number(row.log_index ?? row.logIndex ?? 0),
  blockNumber: Number(row.block_number ?? row.blockNumber ?? 0),
  timestamp: Number(row.timestamp ?? 0),
  type: row.type,
  loanId: row.loan_id || row.loanId || '',
  borrower: row.borrower || '',
  amount: row.amount || '',
  defaulted: Boolean(row.defaulted)
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
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'x-client-info': 'vestra-backend/1.0' } }
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
  `);
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
        'tx_hash, log_index, block_number, timestamp, type, loan_id, borrower, amount, defaulted'
      )
      .order('block_number', { ascending: false })
      .order('log_index', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`[supabase] loadEvents failed: ${error.message}`);
    return (data || []).map(toEvent);
  }
  const rows = sqlite
    .prepare(
      'SELECT txHash, logIndex, blockNumber, timestamp, type, loanId, borrower, amount, defaulted FROM events ORDER BY blockNumber DESC, logIndex DESC LIMIT ?'
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
    defaulted: row.defaulted ? Boolean(row.defaulted) : false
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
          defaulted: event.defaulted ?? null
        })),
        { onConflict: 'tx_hash,log_index' }
      );
    if (error) throw new Error(`[supabase] saveEvents failed: ${error.message}`);
    return;
  }
  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO events
      (txHash, logIndex, blockNumber, timestamp, type, loanId, borrower, amount, defaulted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        event.defaulted ? 1 : 0
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
        .not('timestamp', 'in', keep);
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

const getOrCreateUserByWallet = async (walletAddress) => {
  if (useSupabase) {
    const client = supabaseClient();
    const { data: existing, error: selectError } = await client
      .from('app_users')
      .select('id, wallet_address')
      .eq('wallet_address', walletAddress)
      .maybeSingle();
    if (selectError && selectError.code !== 'PGRST116') {
      throw new Error(`[supabase] get user failed: ${selectError.message}`);
    }
    if (existing) return { id: existing.id, walletAddress: existing.wallet_address };
    const { data, error } = await client
      .from('app_users')
      .insert({ wallet_address: walletAddress })
      .select('id, wallet_address')
      .single();
    if (error) throw new Error(`[supabase] insert user failed: ${error.message}`);
    return { id: data.id, walletAddress: data.wallet_address };
  }
  const existing = sqlite
    .prepare('SELECT id, wallet_address FROM app_users WHERE wallet_address = ?')
    .get(walletAddress);
  if (existing) {
    return { id: existing.id, walletAddress: existing.wallet_address };
  }
  const id = createId();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO app_users (id, wallet_address, created_at, last_seen_at) VALUES (?, ?, ?, ?)'
    )
    .run(id, walletAddress, now, now);
  return { id, walletAddress };
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

const getNonceSession = async (userId, nonce) => {
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('app_sessions')
      .select('id, user_id, provider, nonce, issued_at, expires_at, ip_hash')
      .eq('user_id', userId)
      .eq('provider', 'wallet_nonce')
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
    .get(userId, 'wallet_nonce', nonce);
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

const getSessionByToken = async (token) => {
  if (!token) return null;
  if (useSupabase) {
    const { data, error } = await supabaseClient()
      .from('app_sessions')
      .select(
        'id, user_id, provider, nonce, issued_at, expires_at, ip_hash, app_users ( id, wallet_address )'
      )
      .eq('provider', 'wallet_session')
      .eq('nonce', token)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      throw new Error(`[supabase] session lookup failed: ${error.message}`);
    }
    if (!data) return null;
    return {
      id: data.id,
      provider: data.provider,
      nonce: data.nonce,
      issuedAt: data.issued_at ? Date.parse(data.issued_at) : null,
      expiresAt: data.expires_at ? Date.parse(data.expires_at) : null,
      ipHash: data.ip_hash || '',
      user: data.app_users
        ? { id: data.app_users.id, walletAddress: data.app_users.wallet_address }
        : null
    };
  }
  const row = sqlite
    .prepare(
      `SELECT s.id, s.user_id, s.provider, s.nonce, s.issued_at, s.expires_at, s.ip_hash, u.wallet_address
       FROM app_sessions s
       LEFT JOIN app_users u ON s.user_id = u.id
       WHERE s.provider = ? AND s.nonce = ?`
    )
    .get('wallet_session', token);
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    nonce: row.nonce,
    issuedAt: row.issued_at ? Date.parse(row.issued_at) : null,
    expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
    ipHash: row.ip_hash || '',
    user: row.user_id ? { id: row.user_id, walletAddress: row.wallet_address } : null
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
    message: row.message || '',
    answer: row.answer || '',
    mode: row.mode || '',
    provider: row.provider || '',
    metadata: (() => {
      try {
        return row.metadata ? JSON.parse(row.metadata) : {};
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
      String(message).slice(0, 3000),
      String(answer).slice(0, 8000),
      String(mode || '').slice(0, 80),
      String(provider || '').slice(0, 80),
      JSON.stringify(normalizeJson(normalizedMetadata)),
      createdAt
    );
  return { id, createdAt };
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
  insertSubmission,
  insertNotification,
  getOrCreateUserByWallet,
  createSession,
  getNonceSession,
  getSessionByToken,
  deleteSession,
  clearSessionsByProvider,
  createPool,
  updatePoolPreferences,
  listPools,
  getPoolById,
  createMatchEvent,
  listRecentAgentConversations,
  saveAgentConversation
};
