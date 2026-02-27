const fs = require('fs');
const path = require('path');
const MiniSearch = require('minisearch');

const { getPriceBehavior } = require('./lib/priceBehavior');

const DOC_DIR = path.join(__dirname, '..', 'docs');
const RISK_DATA_PATH = path.join(__dirname, '..', 'notebooks', 'risk_sim_results.csv');
const MAX_CHUNK_LENGTH = 900;
const DEFAULT_QUERY = 'CRDT protocol risk unlock borrowing vesting governance';
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'what',
  'when',
  'where',
  'your',
  'about',
  'into',
  'have',
  'just',
  'over',
  'then',
  'than',
  'they',
  'them'
]);
const INTENT_DEFINITIONS = [
  {
    id: 'getting_started',
    keywords: ['how to use', 'getting started', 'walk me through', 'explain app', 'use this app', 'start here']
  },
  {
    id: 'repay_troubleshoot',
    keywords: ['repay', 'repayment', 'loan id', 'allowance', 'revert', 'transfer failed', 'inactive', 'not borrower']
  },
  {
    id: 'borrow_flow',
    keywords: ['borrow', 'ltv', 'dpv', 'collateral', 'escrow', 'max borrow']
  },
  {
    id: 'pool_matching',
    keywords: ['pool', 'lender', 'match', 'offer', 'liquidity', 'interest bps']
  },
  {
    id: 'governance',
    keywords: ['governance', 'proposal', 'committee', 'vote', 'dao']
  },
  {
    id: 'risk_model',
    keywords: ['risk', 'monte', 'p5', 'es5', 'volatility', 'stress', 'simulation']
  },
  {
    id: 'price_behavior',
    keywords: ['price behavior', 'price behaviour', 'ath', 'atl', 'all time high', 'all time low', 'drawdown', 'price history', 'how has', 'token price']
  },
  {
    id: 'portfolio',
    keywords: ['portfolio', 'positions', 'loans', 'status', 'dashboard']
  }
];
const INTENT_DOC_BOOST = {
  getting_started: ['MVP', 'TECHNICAL_SPEC', 'ARCHITECTURE', 'FRONTEND'],
  repay_troubleshoot: ['REPAY', 'TECHNICAL_SPEC', 'INCIDENT', 'RUNBOOK'],
  borrow_flow: ['WHITEPAPER', 'MVP', 'BORROW', 'TECHNICAL_SPEC'],
  pool_matching: ['LIQUIDITY', 'TECHNICAL_SPEC', 'ARCHITECTURE'],
  governance: ['GOVERNANCE', 'RISK_COMMITTEE', 'METRICS'],
  risk_model: ['WHITEPAPER', 'RISK', 'METRICS'],
  price_behavior: ['RISK_MODELS', 'ORACLES_AND_PRICE_BEHAVIOR', 'SECURITY_ORACLES'],
  portfolio: ['METRICS', 'ARCHITECTURE', 'MVP']
};

const buildChunkId = (file, index) => `${file}-${index}`;

const chunkDocument = (file, contents) => {
  const lines = contents.split('\n');
  const chunks = [];
  let buffer = [];
  let size = 0;
  lines.forEach((line) => {
    const lineSize = line.length + 1;
    if (size + lineSize > MAX_CHUNK_LENGTH && buffer.length) {
      chunks.push(buffer.join('\n'));
      buffer = [];
      size = 0;
    }
    buffer.push(line);
    size += lineSize;
  });
  if (buffer.length) {
    chunks.push(buffer.join('\n'));
  }
  return chunks.map((text, index) => ({
    id: buildChunkId(file, index),
    file,
    heading: text.split('\n')[0]?.replace(/^#*\s*/, '').slice(0, 80) || 'Context',
    text: text.trim()
  }));
};

const loadDocs = () => {
  const docs = [];
  try {
    const files = fs.readdirSync(DOC_DIR).filter((file) => file.endsWith('.md'));
    files.forEach((file) => {
      try {
        const raw = fs.readFileSync(path.join(DOC_DIR, file), 'utf8');
        const chunks = chunkDocument(file, raw);
        docs.push(...chunks);
      } catch (error) {
        console.error(`[agent] failed to read ${file}:`, error?.message || error);
      }
    });
  } catch (error) {
    console.error('[agent] unable to load docs:', error?.message || error);
  }
  return docs;
};

const loadRiskData = () => {
  try {
    const raw = fs.readFileSync(RISK_DATA_PATH, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const header = lines.shift();
    if (!header) return [];
    return lines.map((line) => {
      const [
        months,
        vol30Mean,
        vol30P1,
        vol30P5,
        vol30P10,
        vol30Es5,
        vol50Mean,
        vol50P1,
        vol50P5,
        vol50P10,
        vol50Es5,
        vol70Mean,
        vol70P1,
        vol70P5,
        vol70P10,
        vol70Es5
      ] = line.split(',').map((value) => Number(value));
      return {
        months,
        vol30: { mean: vol30Mean, p1: vol30P1, p5: vol30P5, p10: vol30P10, es5: vol30Es5 },
        vol50: { mean: vol50Mean, p1: vol50P1, p5: vol50P5, p10: vol50P10, es5: vol50Es5 },
        vol70: { mean: vol70Mean, p1: vol70P1, p5: vol70P5, p10: vol70P10, es5: vol70Es5 }
      };
    });
  } catch (error) {
    console.error('[agent] unable to load risk data:', error?.message || error);
    return [];
  }
};

const selectClosestMonths = (riskData, months) => {
  if (!riskData.length) return null;
  return riskData.reduce((closest, row) => {
    if (!closest) return row;
    return Math.abs(row.months - months) < Math.abs(closest.months - months) ? row : closest;
  }, null);
};

const inferMonths = (message) => {
  if (!message) return 12;
  const match = message.match(/(\d{1,2})\s*(?:months?|mos?|mo\b)/i);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) return Math.max(0, Math.min(value, 36));
  }
  return 12;
};

const inferVolatility = (message) => {
  if (!message) return 50;
  if (/low\s*vol/i.test(message)) return 30;
  if (/high\s*vol/i.test(message)) return 70;
  if (/med(ium)?\s*vol/i.test(message)) return 50;
  const explicit = message.match(/(\d{2})\s*%?\s*vol/i);
  if (explicit) {
    const value = Number(explicit[1]);
    if (value <= 40) return 30;
    if (value <= 60) return 50;
    return 70;
  }
  return 50;
};

const extractNumber = (message, labelPatterns) => {
  for (const pattern of labelPatterns) {
    const match = message.match(pattern);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
};

const computeDpvEstimate = ({ quantity, price, months, sigma = 0.5 }) => {
  const r = 0.05;
  const t = Math.max(months, 0) / 12;
  const dTime = Math.exp(-r * t);
  const dVol = Math.max(1 - sigma * Math.sqrt(t), 0);
  const liquidity = 0.9;
  const shock = 0.95;
  const discount = dTime * dVol * liquidity * shock;
  const pv = quantity * price * discount;
  const baseLtv = 0.4;
  const minLtv = 0.25;
  const tCap = Math.min(t, 3);
  const ltv = Math.max(minLtv, baseLtv - (0.15 * tCap) / 3);
  return {
    pv,
    ltv,
    maxBorrow: pv * ltv,
    params: { r, sigma, liquidity, shock }
  };
};

const buildGuidedFlow = ({ path = '/', intent = 'general' } = {}) => {
  const page = String(path || '/').toLowerCase();
  if (page === '/dashboard') {
    return {
      title: 'Dashboard quick start',
      steps: [
        {
          path: '/dashboard',
          targetId: 'dashboard-open-borrow',
          label: 'Open Borrow',
          hint: 'Start by opening Borrow from the dashboard grid.'
        },
        {
          path: '/borrow',
          targetId: 'fund-wallet-status',
          label: 'Fund wallet',
          hint: 'Add gas/USDC first if needed.'
        },
        {
          path: '/borrow',
          targetId: 'borrow-create-loan',
          label: 'Create loan',
          hint: 'After review, submit the loan transaction.'
        },
        {
          path: '/dashboard',
          targetId: 'dashboard-open-repay',
          label: 'Go to Repay',
          hint: 'Use this when you want to reduce debt later.'
        }
      ]
    };
  }
  if (page === '/borrow') {
    return {
      title: 'Borrow flow',
      steps: [
        {
          path: '/borrow',
          targetId: 'fund-wallet-status',
          label: 'Fund wallet',
          hint: 'Ensure gas and USDC availability first.'
        },
        {
          path: '/borrow',
          targetId: 'borrow-use-max',
          label: 'Auto-fill amount',
          hint: 'Optionally use max borrow for this collateral.'
        },
        {
          path: '/borrow',
          targetId: 'borrow-create-loan',
          label: 'Create loan',
          hint: 'Confirm terms and submit.'
        }
      ]
    };
  }
  if (page === '/repay') {
    return {
      title: 'Repay flow',
      steps: [
        {
          path: '/repay',
          targetId: 'repay-approve-usdc',
          label: 'Approve USDC',
          hint: 'Approve allowance for the repay amount first.'
        },
        {
          path: '/repay',
          targetId: 'repay-use-total-due',
          label: 'Use total due',
          hint: 'Optional: auto-fill the exact due amount.'
        },
        {
          path: '/repay',
          targetId: 'repay-submit',
          label: 'Submit repay',
          hint: 'Repay with the borrower wallet on the correct chain.'
        }
      ]
    };
  }
  if (page === '/lender') {
    return {
      title: 'Lender flow',
      steps: [
        {
          path: '/lender',
          targetId: 'lender-create-pool',
          label: 'Create pool',
          hint: 'Configure lender preferences first.'
        },
        {
          path: '/lender',
          targetId: 'lender-approve',
          label: 'Approve USDC',
          hint: 'Approve before deposit.'
        },
        {
          path: '/lender',
          targetId: 'lender-deposit',
          label: 'Deposit liquidity',
          hint: 'Deposit USDC into lending pool.'
        }
      ]
    };
  }
  if (intent === 'getting_started') {
    return {
      title: 'Protocol walkthrough',
      steps: [
        {
          path: '/dashboard',
          targetId: 'dashboard-open-borrow',
          label: 'Start at Borrow',
          hint: 'Open Borrow to create your first loan.'
        },
        {
          path: '/borrow',
          targetId: 'borrow-create-loan',
          label: 'Create loan',
          hint: 'Review terms and submit.'
        },
        {
          path: '/dashboard',
          targetId: 'dashboard-open-repay',
          label: 'Then go to Repay',
          hint: 'Repay or settle debt when needed.'
        }
      ]
    };
  }
  return null;
};

const extractSymbolForPriceBehavior = (message) => {
  const str = String(message || '');
  const forMatch = str.match(/(?:for|token|symbol)\s+([A-Za-z]{2,8})\b/i);
  if (forMatch) return forMatch[1].toUpperCase();
  const tickerMatch = str.match(/\b([A-Z]{2,6})\b/);
  if (tickerMatch) return tickerMatch[1].toUpperCase();
  return null;
};

const runAgentTools = async (message, riskData, context = null) => {
  const actions = [];
  const normalized = String(message || '').toLowerCase();
  const wantsRiskSim = /risk|monte|simulation|percentile|p5|p1|curve|volatility|stress/.test(normalized);
  const wantsDpv = /dpv|present value|pv|ltv|loan-to-value|borrow limit/.test(normalized);
  const wantsGovernance = /governance|proposal|vote|dao|committee|shock factor|risk parameter/.test(normalized);
  const wantsPoolMatch = /pool|match|liquidity|lender|borrow offer/.test(normalized);
  const wantsGuidedFlow = /how to|walk me|step by step|what do i click|guide me|interactive|explain/.test(normalized);
  const wantsPriceBehavior = /price behavior|price behaviour|ath|atl|all.time.high|all.time.low|drawdown|price history|how has.*(price|performed)|token price/.test(normalized);
  const inferredIntent = (() => {
    if (/repay|repayment|allowance|loan id|revert|inactive|not borrower/.test(normalized)) {
      return 'repay_troubleshoot';
    }
    if (/how to use|getting started|walk me through|start here|use this app/.test(normalized)) {
      return 'getting_started';
    }
    return 'general';
  })();

  let summary = '';

  if (wantsRiskSim && riskData.length) {
    const months = inferMonths(message);
    const volatility = inferVolatility(message);
    const row = selectClosestMonths(riskData, months);
    const bucket = volatility === 30 ? row?.vol30 : volatility === 70 ? row?.vol70 : row?.vol50;
    if (row && bucket) {
      actions.push({
        type: 'risk_sim',
        data: {
          months: row.months,
          volatility,
          stats: {
            meanPV: bucket.mean,
            p1PV: bucket.p1,
            p5PV: bucket.p5,
            p10PV: bucket.p10,
            es5PV: bucket.es5
          }
        }
      });
      summary += `Monte Carlo snapshot (${row.months} months, ${volatility}% vol): mean PV ~ ${bucket.mean.toFixed(
        0
      )}, P5 ~ ${bucket.p5.toFixed(0)}, ES5 ~ ${bucket.es5.toFixed(0)}. Use P5 for conservative caps.`;
    }
  }

  if (wantsDpv) {
    const quantity = extractNumber(message, [/quantity\s*[:=]?\s*([\d,.]+)/i, /(\d{2,})\s*tokens?/i]);
    const price = extractNumber(message, [/price\s*[:=]?\s*\$?([\d,.]+)/i, /\$([\d,.]+)/i]);
    const months = inferMonths(message);
    if (quantity && price) {
      const sigma = inferVolatility(message) / 100;
      const estimate = computeDpvEstimate({ quantity, price, months, sigma });
      actions.push({
        type: 'dpv_estimate',
        data: {
          quantity,
          price,
          months,
          volatility: Math.round(sigma * 100),
          pv: estimate.pv,
          ltv: estimate.ltv,
          maxBorrow: estimate.maxBorrow,
          params: estimate.params
        }
      });
      summary += `${summary ? '\n\n' : ''}DPV estimate for ${quantity} tokens at $${price} unlocking in ${months} months: PV ~ ${estimate.pv.toFixed(
        2
      )}, suggested LTV ${Math.round(estimate.ltv * 100)}% (max borrow ~ ${estimate.maxBorrow.toFixed(2)}).`;
    }
  }

  if (wantsGovernance) {
    actions.push({
      type: 'governance_suggestion',
      data: {
        title: 'Risk parameter review',
        details:
          'Consider updating volatility buckets and shock factor based on recent unlock schedules. Use Monte Carlo P5/ES5 to justify tighter LTV caps.',
        nextSteps: ['Draft a proposal', 'Share simulation evidence', 'Open a DAO vote']
      }
    });
    summary += `${summary ? '\n\n' : ''}Governance note: review volatility buckets and shock factor; use Monte Carlo P5/ES5 to justify conservative LTV caps.`;
  }

  if (wantsPoolMatch) {
    const collateralId = extractNumber(message, [
      /collateral\s*id\s*[:=]?\s*(\d+)/i,
      /collateral\s*(\d+)/i,
      /id\s*(\d+)/i
    ]);
    const desiredAmountUsd = extractNumber(message, [
      /borrow\s*[:=]?\s*\$?([\d,.]+)/i,
      /loan\s*[:=]?\s*\$?([\d,.]+)/i,
      /\$([\d,.]+)/i
    ]);
    actions.push({
      type: 'pool_match',
      data: {
        chain: 'base',
        collateralId: collateralId ? String(collateralId) : '',
        desiredAmountUsd: desiredAmountUsd || null
      }
    });
    summary += `${summary ? '\n\n' : ''}Pool match ready: provide collateral ID and desired amount to fetch lender offers.`;
  }

  if (wantsPriceBehavior) {
    const symbol = extractSymbolForPriceBehavior(message);
    const chainId = context?.chainId != null ? Number(context.chainId) : undefined;
    try {
      const data = await getPriceBehavior(symbol || 'UNKNOWN', chainId);
      actions.push({
        type: 'price_behavior',
        data: {
          symbol: symbol || 'unknown',
          price: data.price,
          ath: data.ath,
          atl: data.atl,
          drawdownBps: data.drawdownBps,
          rangeRatioBps: data.rangeRatioBps,
          suggestion: data.suggestion,
          source: data.source,
          athAtlSource: data.athAtlSource
        }
      });
      if (data.price != null && data.ath != null && data.atl != null) {
        summary += `${summary ? '\n\n' : ''}Price behavior (${symbol || 'token'}): spot $${data.price.toFixed(4)}; ATH $${data.ath.toFixed(4)}, ATL $${data.atl.toFixed(4)}; drawdown ${(data.drawdownBps / 100).toFixed(1)}%; range ratio ${(data.rangeRatioBps / 100).toFixed(1)}%. ${data.suggestion}`;
      } else {
        summary += `${summary ? '\n\n' : ''}Price behavior: ATH/ATL not configured for this token (set PRICE_BEHAVIOR_<SYMBOL>_ATH and _ATL for metrics). ${data.suggestion}`;
      }
    } catch (err) {
      summary += `${summary ? '\n\n' : ''}Price behavior: unavailable (${err?.message || 'error'}). Use on-chain valuation.`;
    }
  }

  if (wantsGuidedFlow || inferredIntent === 'getting_started' || inferredIntent === 'repay_troubleshoot') {
    const guided = buildGuidedFlow({
      path: context?.path || '/',
      intent: inferredIntent
    });
    if (guided) {
      actions.push({
        type: 'guided_flow',
        data: guided
      });
      summary += `${summary ? '\n\n' : ''}Interactive guide prepared with ${guided.steps.length} steps for ${guided.title.toLowerCase()}.`;
    }
  }

  if (!actions.length) {
    return { actions: [], summary: '' };
  }

  return { actions, summary };
};

const initSearch = (docs) => {
  const search = new MiniSearch({
    fields: ['text', 'heading', 'file'],
    storeFields: ['text', 'file', 'heading'],
    searchOptions: {
      boost: { heading: 2 },
      prefix: true,
      fuzzy: 0.2
    }
  });
  search.addAll(docs);
  return search;
};

const classifyIntent = (message) => {
  const normalized = String(message || '').toLowerCase();
  let best = { id: 'general', score: 0 };
  for (const intent of INTENT_DEFINITIONS) {
    const score = intent.keywords.reduce((total, keyword) => {
      if (normalized.includes(keyword)) return total + keyword.length;
      const words = keyword.split(' ').filter(Boolean);
      const partial = words.filter((word) => normalized.includes(word)).length;
      return total + partial;
    }, 0);
    if (score > best.score) {
      best = { id: intent.id, score };
    }
  }
  const confidence = Math.max(0.1, Math.min(0.98, best.score / 22));
  return { intent: best.id, confidence };
};

const overlapScore = (queryTokens, text) => {
  if (!queryTokens.length || !text) return 0;
  const corpus = String(text).toLowerCase();
  return queryTokens.reduce((sum, token) => {
    if (!token) return sum;
    if (corpus.includes(token)) return sum + 1;
    return sum;
  }, 0);
};

const scoreSnippet = ({ snippet, queryTokens, intent }) => {
  const overlap = overlapScore(queryTokens, `${snippet.heading} ${snippet.text}`);
  const density = queryTokens.length ? overlap / queryTokens.length : 0;
  const intentBoostTerms = INTENT_DOC_BOOST[intent] || [];
  const docBoost = intentBoostTerms.some((term) =>
    String(snippet.file || '').toUpperCase().includes(term)
  )
    ? 0.2
    : 0;
  return density + docBoost;
};

const selectSnippets = (search, docs, query, limit = 5, intent = 'general') => {
  if (!search || !docs.length) return [];
  const safeQuery = query?.trim() || DEFAULT_QUERY;
  const queryTokens = tokenize(safeQuery);
  const lexicalResults = search.search(safeQuery, { limit: Math.max(limit * 3, 8) });
  const seen = new Set();
  const ranked = [];
  lexicalResults.forEach((result) => {
    const doc = docs.find((item) => item.id === result.id);
    if (!doc || seen.has(doc.id)) return;
    seen.add(doc.id);
    ranked.push({
      doc,
      score: Number(result.score || 0) / 10 + scoreSnippet({ snippet: doc, queryTokens, intent })
    });
  });
  if (ranked.length === 0) {
    return docs
      .map((doc) => ({
        doc,
        score: scoreSnippet({ snippet: doc, queryTokens, intent })
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((row) => row.doc);
  }
  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.doc);
};

const sanitizeHistory = (history) => {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-6)
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: String(item.content || '').slice(0, 2000)
    }))
    .filter((item) => item.content);
};

const tokenize = (input) =>
  String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && token.length > 2 && !STOP_WORDS.has(token));

const scoreMemory = (queryTokens, memory) => {
  const corpus = `${memory?.message || ''} ${memory?.answer || ''}`.toLowerCase();
  let score = 0;
  queryTokens.forEach((token) => {
    if (corpus.includes(token)) score += token.length;
  });
  return score;
};

const selectMemorySnippets = (memories, query, limit = 3) => {
  if (!Array.isArray(memories) || !memories.length) return [];
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return memories.slice(0, limit);
  return memories
    .map((memory) => ({ memory, score: scoreMemory(queryTokens, memory) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.memory);
};

const summarizeMemory = (memories, query) => {
  if (!Array.isArray(memories) || !memories.length) {
    return {
      summaryText: '',
      topIntent: 'none',
      avgConfidence: null
    };
  }
  const relevant = memories.slice(0, 40);
  const intentCounts = new Map();
  let confidenceSum = 0;
  let confidenceCount = 0;
  let repayIssueCount = 0;
  const recentOutcomes = [];
  const sanitizeOutcome = (value) => {
    const raw = String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!raw) return '';
    if (/knowledge-base mode right now|prior solved q&a|related prior conversation context/i.test(raw)) {
      return '';
    }
    return raw.replace(/^[-*]\s*/, '').slice(0, 120);
  };

  relevant.forEach((memory) => {
    const metadata = memory?.metadata || {};
    const intent =
      typeof metadata.intent === 'string' && metadata.intent
        ? metadata.intent
        : classifyIntent(memory?.message || '').intent;
    intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);

    const confidence = Number(metadata.confidence);
    if (Number.isFinite(confidence)) {
      confidenceSum += confidence;
      confidenceCount += 1;
    }

    const combined = `${memory?.message || ''} ${memory?.answer || ''}`.toLowerCase();
    if (/repay|revert|allowance|inactive|not borrower|transfer failed/.test(combined)) {
      repayIssueCount += 1;
    }

    const headline = String(memory?.answer || '')
      .split('\n')
      .find((line) => String(line || '').trim().length > 0);
    const cleanedHeadline = sanitizeOutcome(headline);
    if (cleanedHeadline) {
      recentOutcomes.push(cleanedHeadline);
    }
  });

  const sortedIntents = Array.from(intentCounts.entries()).sort((a, b) => b[1] - a[1]);
  const topIntent = sortedIntents[0]?.[0] || 'general';
  const avgConfidence =
    confidenceCount > 0 ? Math.round((confidenceSum / confidenceCount) * 100) / 100 : null;
  const queryIntent = classifyIntent(query || '').intent;
  const recentUniqueOutcomes = Array.from(new Set(recentOutcomes)).slice(0, 2);

  const summaryParts = [
    `Memory summary: ${relevant.length} recent turns.`,
    `Top intent: ${topIntent}.`,
    avgConfidence !== null ? `Avg confidence: ${(avgConfidence * 100).toFixed(0)}%.` : '',
    repayIssueCount > 0 ? `Repay-related issue mentions: ${repayIssueCount}.` : '',
    queryIntent !== 'general' ? `Current query intent: ${queryIntent}.` : '',
    recentUniqueOutcomes.length
      ? `Recent outcomes: ${recentUniqueOutcomes.join(' | ')}.`
      : ''
  ].filter(Boolean);

  return {
    summaryText: summaryParts.join(' '),
    topIntent,
    avgConfidence
  };
};

const buildCitationList = (snippets) =>
  snippets.slice(0, 4).map((snippet) => `- ${snippet.file}: ${snippet.heading || 'Context'}`);

const buildContextHints = (context) => {
  if (!context || typeof context !== 'object') return [];
  const hints = [];
  if (context.path) hints.push(`Current page: ${context.path}`);
  if (context.chainId) hints.push(`Chain ID: ${context.chainId}`);
  if (context.walletAddress) {
    hints.push('Wallet connected: yes');
  }
  return hints;
};

const buildTemplateAnswer = ({ intent, question, snippets, toolOutput, context, confidence }) => {
  const citations = buildCitationList(snippets);
  const excerpt = snippets[0]?.text?.replace(/\s+/g, ' ').slice(0, 240) || '';
  const hints = buildContextHints(context);
  const riskNote = confidence < 0.45
    ? 'I may be missing app-specific details for this exact case. Use the checks below and verify on your current network.'
    : '';
  if (intent === 'getting_started') {
    return [
      '## How To Use Vestra',
      '',
      '- Connect your wallet and confirm the target testnet.',
      '- Borrow: enter vesting collateral, review max borrow, then create loan.',
      '- Repay: fund gas + USDC, approve USDC, then repay using the exact loan ID.',
      '- Portfolio: track active loans, unlock timeline, and settlement status.',
      '',
      '## Quick Checks',
      '- Use the same borrower wallet for repay actions.',
      '- Confirm loan is active and on the same chain as your wallet.',
      '- If repay fails, verify USDC allowance and balance first.',
      ...(hints.length ? ['', '## Context Used', ...hints] : []),
      ...(citations.length ? ['', '## Sources', ...citations] : [])
    ].join('\n');
  }
  if (intent === 'repay_troubleshoot') {
    return [
      '## Repay Troubleshooting',
      '',
      '- Confirm `Loan ID` exists and is active.',
      '- Connected wallet must be the loan borrower.',
      '- Approve USDC >= repay amount before pressing Repay.',
      '- Keep enough native gas for both approve and repay tx.',
      '',
      '## If You See Revert / Simulation Error',
      '- `inactive`: loan settled or wrong chain.',
      '- `not borrower`: switch to original borrower wallet.',
      '- `transfer failed`: insufficient USDC balance or allowance.',
      ...(toolOutput?.summary ? ['', '## Model Output', toolOutput.summary] : []),
      ...(riskNote ? ['', `_${riskNote}_`] : []),
      ...(citations.length ? ['', '## Sources', ...citations] : [])
    ].join('\n');
  }
  return [
    '## Answer',
    '',
    `For: "${question}"`,
    '',
    excerpt || 'No exact snippet found in indexed docs.',
    ...(toolOutput?.summary ? ['', '## Computation', toolOutput.summary] : []),
    ...(riskNote ? ['', `_${riskNote}_`] : []),
    ...(citations.length ? ['', '## Sources', ...citations] : [])
  ].join('\n');
};

const buildSystemPrompt = (
  snippets,
  latestUserMessage = '',
  memorySummary = '',
  intent = 'general',
  runtimeContext = null,
  platformSnapshot = null
) => {
  const languageHint = latestUserMessage
    ? `Detect the user's language from their latest message (${latestUserMessage.slice(
        0,
        120
      )}…) and respond in that language. If unclear, default to concise English.`
    : 'Respond in the user\'s language when possible; default to concise English.';
  const contextText = snippets
    .map(
      (snippet, index) =>
        `# Source ${index + 1}: ${snippet.file} — ${snippet.heading}\n${snippet.text}`
    )
    .join('\n\n');
  const memoryContext = memorySummary
    ? `\nPrior conversation memory summary (compressed): ${memorySummary}`
    : '';
  const snapshotContext = platformSnapshot
    ? `\n\nPlatform snapshot (aggregate only; use to inform users what is happening on the platform—no individual user or wallet data): ${JSON.stringify(platformSnapshot)}`
    : '';
  const privacyRule =
    'You have protocol knowledge and aggregate platform stats only. Never infer or expose individual user or wallet activity; never ask for or store wallet addresses.';
  return [
    'You are CRDT AI, a protocol assistant for the UNLOCKD / VESTRA vesting-credit system.',
    'Answer with concise, actionable steps. When you reference facts, cite the source file name.',
    'If something is unspecified or TODO in docs, say it clearly and suggest what data is needed.',
    'Prefer risk-first guidance: DPV, LTV, unlock timelines, governance/process integrity.',
    'Never invent parameters. Do not give financial advice; keep it product/support oriented.',
    privacyRule,
    'If the user asks something unrelated to the protocol, reply anyway in a Deadpool/Ryan Reynolds tone: witty, dark, sarcastic, with jokes, but stay brief and safe.',
    languageHint,
    'Use the provided context and say if the answer is not in docs.',
    `Detected intent: ${intent}. Keep the response structured with sections: "Answer", "Checks", "Next steps", "Sources".`,
    runtimeContext
      ? `Runtime context: ${JSON.stringify({ ...runtimeContext, walletAddress: undefined }).slice(0, 800)}`
      : '',
    snapshotContext,
    '\nContext:\n',
    contextText,
    memoryContext
  ].join('\n');
};

const callLLM = async (messages) => {
  const candidates = [
    {
      name: 'asi-one',
      apiKey: process.env.ASI_ONE_API_KEY,
      baseUrl: process.env.ASI_ONE_BASE_URL || 'https://api.asi1.ai/v1',
      model: process.env.ASI_ONE_MODEL || 'asi1'
    },
    {
      name: 'primary',
      apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
      model: process.env.LLM_MODEL
    },
    {
      name: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      model: process.env.OPENROUTER_MODEL
    },
    {
      name: 'zai',
      apiKey: process.env.ZAI_API_KEY,
      baseUrl: process.env.ZAI_BASE_URL,
      model: process.env.ZAI_MODEL
    }
  ].filter((entry) => entry.apiKey);

  if (!candidates.length) {
    return {
      usedLLM: false,
      answer:
        'Agent is running in retrieval-only mode because no LLM key is configured. Top context was returned.',
      raw: null
    };
  }

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const defaultBase =
        candidate.name === 'asi-one' ? 'https://api.asi1.ai/v1' : 'https://api.openai.com/v1';
      const base = (candidate.baseUrl || defaultBase).replace(/\/$/, '');
      const defaultModel = candidate.name === 'asi-one' ? 'asi1' : 'gpt-4o-mini';
      const model = candidate.model || defaultModel;
      const url = `${base}/chat/completions`;
      const body = {
        model,
        temperature: 0.2,
        messages
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${candidate.apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `[${candidate.name}] ${response.status}: ${errorText.slice(0, 200)}`
        );
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      return {
        usedLLM: true,
        answer: content || 'No response from model',
        raw: data,
        provider: candidate.name
      };
    } catch (error) {
      lastError = error;
      console.error('[agent] LLM attempt failed', candidate.name, error?.message || error);
    }
  }

  return {
    usedLLM: false,
    answer: `Model calls failed: ${lastError?.message || 'unknown error'}`,
    raw: null,
    provider: null
  };
};

const formatSources = (snippets) =>
  snippets.map((snippet) => ({
    file: snippet.file,
    heading: snippet.heading,
    text: snippet.text.slice(0, 400)
  }));

const answerAgent = async (agent, input) => {
  const { message, history } = input || {};
  const trimmed = (message || '').trim();
  if (!trimmed) {
    throw new Error('Message is required');
  }

  const intentResult = classifyIntent(trimmed);
  const toolOutput = await runAgentTools(trimmed, agent.riskData || [], input?.context || null);
  const snippets = selectSnippets(
    agent.search,
    agent.docs,
    trimmed,
    5,
    intentResult.intent
  );
  const memorySummary = summarizeMemory(input?.memory || [], trimmed);
  const toolContext = toolOutput.summary
    ? `\n\nTool output (use as factual context):\n${toolOutput.summary}`
    : '';
  const systemPrompt = `${buildSystemPrompt(
    snippets,
    trimmed,
    memorySummary.summaryText,
    intentResult.intent,
    input?.context || null,
    input?.platformSnapshot || null
  )}${toolContext}`;
  const prior = sanitizeHistory(history);
  const messages = [{ role: 'system', content: systemPrompt }, ...prior, { role: 'user', content: trimmed }];

  const llm = await callLLM(messages);
  const retrievalConfidence = snippets.length
    ? Math.max(
        0.2,
        Math.min(
          0.98,
          snippets
            .slice(0, 3)
            .reduce(
              (sum, snippet) =>
                sum +
                scoreSnippet({
                  snippet,
                  queryTokens: tokenize(trimmed),
                  intent: intentResult.intent
                }),
              0
            ) / 3
        )
      )
    : 0.2;
  const overallConfidence =
    Math.round(
      Math.min(0.99, intentResult.confidence * 0.45 + retrievalConfidence * 0.55) * 100
    ) / 100;
  const fallback = buildTemplateAnswer({
    intent: intentResult.intent,
    question: trimmed,
    snippets,
    toolOutput,
    context: input?.context || null,
    confidence: overallConfidence
  });
  const finalAnswer = llm.usedLLM
    ? llm.answer || fallback
    : fallback;

  return {
    answer: finalAnswer,
    sources: formatSources(snippets),
    mode: llm.usedLLM ? 'llm' : 'knowledge-base',
    provider: llm.provider || null,
    actions: toolOutput.actions || [],
    intent: intentResult.intent,
    confidence: overallConfidence
  };
};

const initAgent = () => {
  const docs = loadDocs();
  const search = initSearch(docs);
  const riskData = loadRiskData();
  console.log(`[agent] loaded ${docs.length} doc chunks from ${DOC_DIR}`);
  if (riskData.length) {
    console.log(`[agent] loaded ${riskData.length} risk rows from ${RISK_DATA_PATH}`);
  }
  return { docs, search, riskData };
};

module.exports = {
  initAgent,
  answerAgent
};
