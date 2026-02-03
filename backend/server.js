const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const Database = require('better-sqlite3');
const { ethers } = require('ethers');
const { initAgent, answerAgent } = require('./agent');

const app = express();
const port = process.env.PORT || 4000;

const RPC_URL =
  process.env.ALCHEMY_SEPOLIA_URL ||
  process.env.INFURA_SEPOLIA_URL ||
  'https://rpc.sepolia.org';
const INDEXER_LOOKBACK_BLOCKS = Number(
  process.env.INDEXER_LOOKBACK_BLOCKS || 2000
);
const INDEXER_POLL_INTERVAL_MS = Number(
  process.env.INDEXER_POLL_INTERVAL_MS || 15000
);
const INDEXER_MAX_EVENTS = Number(process.env.INDEXER_MAX_EVENTS || 200);
const INDEXER_VESTED_LIMIT = Number(process.env.INDEXER_VESTED_LIMIT || 20);
const INDEXER_SNAPSHOT_INTERVAL_MS = Number(
  process.env.INDEXER_SNAPSHOT_INTERVAL_MS || 60000
);
const INDEXER_SNAPSHOT_LIMIT = Number(process.env.INDEXER_SNAPSHOT_LIMIT || 24);
const EXPLORER_BASE_URL =
  process.env.EXPLORER_BASE_URL || 'https://sepolia.etherscan.io';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const agent = initAgent();
const blockCache = new Map();
const activityEvents = [];
const seenEvents = new Set();
let lastIndexedBlock = null;
let latestChainBlock = null;
let lastPollAt = 0;
let cachedRepaySchedule = [];
let lastScheduleRefresh = 0;
const vestedSnapshots = [];

const dbDir = path.join(__dirname, 'data');
fs.mkdirSync(dbDir, { recursive: true });
const dbPath = process.env.INDEXER_DB_PATH || path.join(dbDir, 'indexer.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
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
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

const getMeta = (key) => {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
};

const setMeta = (key, value) => {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
};

const loadPersistedEvents = () => {
  const rows = db
    .prepare(
      'SELECT txHash, logIndex, blockNumber, timestamp, type, loanId, borrower, amount, defaulted FROM events ORDER BY blockNumber DESC, logIndex DESC LIMIT ?'
    )
    .all(INDEXER_MAX_EVENTS);
  rows.forEach((row) => {
    activityEvents.push({
      txHash: row.txHash,
      logIndex: Number(row.logIndex),
      blockNumber: Number(row.blockNumber),
      timestamp: Number(row.timestamp),
      type: row.type,
      loanId: row.loanId || '',
      borrower: row.borrower || '',
      amount: row.amount || '',
      defaulted: row.defaulted ? Boolean(row.defaulted) : false
    });
    seenEvents.add(`${row.txHash}-${row.logIndex}`);
  });
};

const loadPersistedSnapshots = () => {
  const rows = db
    .prepare(
      'SELECT timestamp, total, active, avgLtvBps, avgPv FROM snapshots ORDER BY timestamp DESC LIMIT ?'
    )
    .all(INDEXER_SNAPSHOT_LIMIT);
  rows.forEach((row) => {
    vestedSnapshots.push({
      timestamp: Number(row.timestamp),
      summary: {
        total: Number(row.total || 0),
        active: Number(row.active || 0),
        avgLtvBps: Number(row.avgLtvBps || 0),
        avgPv: Number(row.avgPv || 0)
      },
      items: []
    });
  });
};

const persistedLastIndexed = getMeta('lastIndexedBlock');
if (persistedLastIndexed !== null) {
  lastIndexedBlock = Number(persistedLastIndexed);
}
loadPersistedEvents();
loadPersistedSnapshots();

const loadDeployment = (name) => {
  const filePath = path.join(
    __dirname,
    '..',
    'deployments',
    'sepolia',
    `${name}.json`
  );
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed;
};

const loanManagerDeployment = loadDeployment('LoanManager');
const loanManager = {
  address: loanManagerDeployment.address,
  iface: new ethers.Interface(loanManagerDeployment.abi)
};

const lendingPoolDeployment = loadDeployment('LendingPool');
const lendingPool = {
  address: lendingPoolDeployment.address,
  iface: new ethers.Interface(lendingPoolDeployment.abi)
};

const vestingAdapterDeployment = loadDeployment('VestingAdapter');
const vestingAdapter = {
  address: vestingAdapterDeployment.address,
  iface: new ethers.Interface(vestingAdapterDeployment.abi)
};

const valuationDeployment = loadDeployment('ValuationEngine');
const valuationEngine = {
  address: valuationDeployment.address,
  iface: new ethers.Interface(valuationDeployment.abi)
};

const erc20Abi = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
];

const normalizeEvent = async (log) => {
  const parsed = loanManager.iface.parseLog(log);
  const blockNumber = Number(log.blockNumber);
  let timestamp = blockCache.get(blockNumber);
  if (!timestamp) {
    const block = await provider.getBlock(blockNumber);
    timestamp = block?.timestamp || 0;
    blockCache.set(blockNumber, timestamp);
  }
  const base = {
    txHash: log.transactionHash,
    logIndex: Number(log.logIndex),
    blockNumber,
    timestamp
  };
  if (parsed.name === 'LoanCreated') {
    return {
      ...base,
      type: 'LoanCreated',
      loanId: parsed.args.loanId.toString(),
      borrower: parsed.args.borrower,
      amount: parsed.args.amount.toString()
    };
  }
  if (parsed.name === 'LoanRepaid') {
    return {
      ...base,
      type: 'LoanRepaid',
      loanId: parsed.args.loanId.toString(),
      amount: parsed.args.amount.toString()
    };
  }
  if (parsed.name === 'LoanSettled') {
    return {
      ...base,
      type: 'LoanSettled',
      loanId: parsed.args.loanId.toString(),
      defaulted: Boolean(parsed.args.defaulted)
    };
  }
  return null;
};

const persistEvent = (event) => {
  db.prepare(
    `INSERT OR IGNORE INTO events
      (txHash, logIndex, blockNumber, timestamp, type, loanId, borrower, amount, defaulted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    event.txHash,
    event.logIndex,
    event.blockNumber,
    event.timestamp,
    event.type,
    event.loanId || '',
    event.borrower || '',
    event.amount || '',
    event.defaulted ? 1 : 0
  );
};

const pushEvents = (events) => {
  events.forEach((event) => {
    if (!event) return;
    const key = `${event.txHash}-${event.logIndex}`;
    if (seenEvents.has(key)) return;
    persistEvent(event);
    seenEvents.add(key);
    activityEvents.push(event);
  });
  activityEvents.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return b.blockNumber - a.blockNumber;
    }
    return b.logIndex - a.logIndex;
  });
  if (activityEvents.length > INDEXER_MAX_EVENTS) {
    activityEvents.splice(INDEXER_MAX_EVENTS);
  }
  if (activityEvents.length === INDEXER_MAX_EVENTS) {
    const oldest = activityEvents[activityEvents.length - 1];
    const cutoff = oldest ? oldest.blockNumber - 10000 : 0;
    for (const key of seenEvents) {
      if (key.includes(`-${oldest?.logIndex}`) && cutoff > 0) {
        seenEvents.delete(key);
      }
    }
  }
};

const pollEvents = async () => {
  try {
    const latestBlock = await provider.getBlockNumber();
    latestChainBlock = latestBlock;
    lastPollAt = Date.now();
    if (lastIndexedBlock === null) {
      lastIndexedBlock = Math.max(latestBlock - INDEXER_LOOKBACK_BLOCKS, 0);
    }
    const startBlock = lastIndexedBlock + 1;
    if (startBlock > latestBlock) {
      return;
    }
    const chunkSize = 10;
    for (let from = startBlock; from <= latestBlock; from += chunkSize) {
      const to = Math.min(from + chunkSize - 1, latestBlock);
      const loanCreatedLogs = await provider.getLogs({
        address: loanManager.address,
        fromBlock: from,
        toBlock: to,
        topics: [loanManager.iface.getEvent('LoanCreated').topicHash]
      });
      const loanRepaidLogs = await provider.getLogs({
        address: loanManager.address,
        fromBlock: from,
        toBlock: to,
        topics: [loanManager.iface.getEvent('LoanRepaid').topicHash]
      });
      const loanSettledLogs = await provider.getLogs({
        address: loanManager.address,
        fromBlock: from,
        toBlock: to,
        topics: [loanManager.iface.getEvent('LoanSettled').topicHash]
      });

      const normalized = await Promise.all(
        [...loanCreatedLogs, ...loanRepaidLogs, ...loanSettledLogs].map(
          normalizeEvent
        )
      );
      pushEvents(normalized.filter(Boolean));
    }
    lastIndexedBlock = latestBlock;
    setMeta('lastIndexedBlock', lastIndexedBlock);
  } catch (error) {
    console.error('[indexer] poll error', error?.message || error);
  }
};

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'vestra-backend' });
});

app.post('/api/auth/signin', (req, res) => {
  res.json({ ok: true, action: 'signin', data: req.body || {} });
});

app.post('/api/auth/signup', (req, res) => {
  res.json({ ok: true, action: 'signup', data: req.body || {} });
});

app.post('/api/agent/chat', async (req, res) => {
  try {
    console.log('[agent] incoming chat', {
      message: req.body?.message?.slice?.(0, 80) || '',
      historyCount: Array.isArray(req.body?.history) ? req.body.history.length : 0
    });
    const result = await answerAgent(agent, {
      message: req.body?.message,
      history: req.body?.history
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[agent] chat error', error?.message || error, error);
    res.status(200).json({
      ok: false,
      error: error?.message || 'Agent unavailable'
    });
  }
});

app.post('/api/write', (req, res) => {
  res.json({ ok: true, action: 'write', data: req.body || {} });
});

app.post('/api/docs/open', (req, res) => {
  res.json({ ok: true, action: 'docs_open', data: req.body || {} });
});

app.post('/api/notify/auction', (req, res) => {
  res.json({ ok: true, action: 'auction_notify', data: req.body || {} });
});

app.post('/api/governance/subscribe', (req, res) => {
  res.json({ ok: true, action: 'governance_subscribe', data: req.body || {} });
});

app.post('/api/contact', (req, res) => {
  res.json({ ok: true, action: 'contact', data: req.body || {} });
});

app.get('/api/activity', (_req, res) => {
  res.json({
    ok: true,
    items: activityEvents,
    meta: {
      lookbackBlocks: INDEXER_LOOKBACK_BLOCKS,
      lastIndexedBlock,
      latestChainBlock,
      lastPollAt
    }
  });
});

app.get('/api/exports/activity', (_req, res) => {
  const rows = [
    ['Event', 'Loan ID', 'Borrower', 'Amount', 'Timestamp', 'TxHash'],
    ...activityEvents.map((event) => [
      event.type,
      event.loanId || '',
      event.borrower || '',
      event.amount || '',
      event.timestamp
        ? new Date(event.timestamp * 1000).toISOString()
        : '',
      event.txHash || ''
    ])
  ];
  const csv = rows.map((row) => row.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="vestra-activity.csv"');
  res.send(csv);
});

app.get('/api/repay-schedule', async (_req, res) => {
  try {
    const contract = new ethers.Contract(
      loanManager.address,
      loanManagerDeployment.abi,
      provider
    );
    const count = await contract.loanCount();
    const total = Number(count);
    const limit = Math.min(total, 10);
    const start = Math.max(total - limit, 0);
    const rows = [];
    for (let i = start; i < total; i += 1) {
      const loan = await contract.loans(i);
      rows.push({
        loanId: i,
        principal: loan[1].toString(),
        interest: loan[2].toString(),
        unlockTime: Number(loan[4]),
        status: loan[5] ? 'Active' : 'Settled'
      });
    }
    cachedRepaySchedule = rows;
    lastScheduleRefresh = Date.now();
    res.json({ ok: true, items: rows });
  } catch (error) {
    res.status(200).json({
      ok: false,
      error: error?.message || 'error',
      items: cachedRepaySchedule,
      cachedAt: lastScheduleRefresh
    });
  }
});

const buildExplorerLink = (type, value) => {
  if (!value) return '';
  return `${EXPLORER_BASE_URL}/${type}/${value}`;
};

const summarizeSnapshot = (items) => {
  const total = items.length;
  const active = items.filter((item) => item.active).length;
  const avgLtv =
    total > 0
      ? Math.round(
          items.reduce((sum, item) => sum + Number(item.ltvBps || 0), 0) / total
        )
      : 0;
  const avgPv =
    total > 0
      ? Math.round(
          items.reduce((sum, item) => sum + Number(item.pv || 0), 0) / total
        )
      : 0;

  return {
    total,
    active,
    avgLtvBps: avgLtv,
    avgPv
  };
};

const storeSnapshot = (items) => {
  const snapshot = {
    timestamp: Date.now(),
    summary: summarizeSnapshot(items),
    items
  };
  db.prepare(
    'INSERT OR REPLACE INTO snapshots (timestamp, total, active, avgLtvBps, avgPv) VALUES (?, ?, ?, ?, ?)'
  ).run(
    snapshot.timestamp,
    snapshot.summary.total,
    snapshot.summary.active,
    snapshot.summary.avgLtvBps,
    snapshot.summary.avgPv
  );
  db.prepare(
    'DELETE FROM snapshots WHERE timestamp NOT IN (SELECT timestamp FROM snapshots ORDER BY timestamp DESC LIMIT ?)'
  ).run(INDEXER_SNAPSHOT_LIMIT);
  vestedSnapshots.unshift(snapshot);
  if (vestedSnapshots.length > INDEXER_SNAPSHOT_LIMIT) {
    vestedSnapshots.splice(INDEXER_SNAPSHOT_LIMIT);
  }
};

const getVestedContracts = async () => {
  const loanContract = new ethers.Contract(
    loanManager.address,
    loanManagerDeployment.abi,
    provider
  );
  const adapterContract = new ethers.Contract(
    vestingAdapter.address,
    vestingAdapterDeployment.abi,
    provider
  );
  const valuationContract = new ethers.Contract(
    valuationEngine.address,
    valuationDeployment.abi,
    provider
  );

  const count = await loanContract.loanCount();
  const total = Number(count);
  const limit = Math.min(total, INDEXER_VESTED_LIMIT);
  const start = Math.max(total - limit, 0);
  const rows = [];

  for (let i = start; i < total; i += 1) {
    const loan = await loanContract.loans(i);
    const collateralId = loan[3];
    const [quantity, token, unlockTime] = await adapterContract.getDetails(collateralId);

    let tokenSymbol = '';
    let tokenDecimals = 18;
    try {
      const tokenContract = new ethers.Contract(token, erc20Abi, provider);
      tokenSymbol = await tokenContract.symbol();
      tokenDecimals = await tokenContract.decimals();
    } catch (error) {
      tokenSymbol = `Token ${token.slice(0, 6)}`;
    }

    let pv = 0n;
    let ltvBps = 0n;
    try {
      const valuation = await valuationContract.computeDPV(quantity, token, unlockTime);
      pv = valuation[0];
      ltvBps = valuation[1];
    } catch (error) {
      pv = 0n;
      ltvBps = 0n;
    }

    const createdEvent = activityEvents.find(
      (event) => event.type === 'LoanCreated' && event.loanId === i.toString()
    );
    const unlockTimestamp = Number(unlockTime || loan[4] || 0);
    const daysToUnlock =
      unlockTimestamp > 0
        ? Math.max(0, Math.round((unlockTimestamp * 1000 - Date.now()) / 86400000))
        : null;

    rows.push({
      loanId: i,
      borrower: loan[0],
      principal: loan[1].toString(),
      interest: loan[2].toString(),
      collateralId: collateralId.toString(),
      unlockTime: unlockTimestamp,
      active: Boolean(loan[5]),
      token,
      tokenSymbol,
      tokenDecimals,
      quantity: quantity.toString(),
      pv: pv.toString(),
      ltvBps: ltvBps.toString(),
      daysToUnlock,
      evidence: {
        escrowTx: createdEvent?.txHash
          ? buildExplorerLink('tx', createdEvent.txHash)
          : '',
        wallet: loan[0] ? buildExplorerLink('address', loan[0]) : '',
        token: token ? buildExplorerLink('address', token) : ''
      }
    });
  }

  return rows.reverse();
};

const takeVestedSnapshot = async () => {
  try {
    const items = await getVestedContracts();
    storeSnapshot(items);
  } catch (error) {
    console.error('[indexer] snapshot error', error?.message || error);
  }
};

app.get('/api/vested-contracts', async (_req, res) => {
  try {
    const items = await getVestedContracts();
    res.json({ ok: true, items });
  } catch (error) {
    res.status(200).json({
      ok: false,
      error: error?.message || 'error',
      items: []
    });
  }
});

app.get('/api/vested-snapshots', (req, res) => {
  const includeItems = req.query?.full === '1';
  const snapshots = includeItems
    ? vestedSnapshots
    : vestedSnapshots.map((snapshot) => ({
        timestamp: snapshot.timestamp,
        summary: snapshot.summary
      }));
  res.json({ ok: true, snapshots });
});

app.get('/api/exports/repay-schedule', async (_req, res) => {
  try {
    const contract = new ethers.Contract(
      loanManager.address,
      loanManagerDeployment.abi,
      provider
    );
    const count = await contract.loanCount();
    const total = Number(count);
    const limit = Math.min(total, 10);
    const start = Math.max(total - limit, 0);
    const rows = [['Loan ID', 'Principal', 'Interest', 'Unlock', 'Status']];
    for (let i = start; i < total; i += 1) {
      const loan = await contract.loans(i);
      rows.push([
        i,
        loan[1].toString(),
        loan[2].toString(),
        loan[4] ? new Date(Number(loan[4]) * 1000).toISOString() : '',
        loan[5] ? 'Active' : 'Settled'
      ]);
    }
    const csv = rows.map((row) => row.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="vestra-repayment-schedule.csv"'
    );
    res.send(csv);
  } catch (error) {
    const rows = [
      ['Loan ID', 'Principal', 'Interest', 'Unlock', 'Status'],
      ...cachedRepaySchedule.map((loan) => [
        loan.loanId,
        loan.principal,
        loan.interest,
        loan.unlockTime
          ? new Date(loan.unlockTime * 1000).toISOString()
          : '',
        loan.status
      ])
    ];
    const csv = rows.map((row) => row.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="vestra-repayment-schedule.csv"'
    );
    res.send(csv);
  }
});

app.listen(port, () => {
  console.log(`Vestra backend running on http://localhost:${port}`);
  pollEvents();
  takeVestedSnapshot();
  setInterval(pollEvents, INDEXER_POLL_INTERVAL_MS);
  setInterval(takeVestedSnapshot, INDEXER_SNAPSHOT_INTERVAL_MS);
});
