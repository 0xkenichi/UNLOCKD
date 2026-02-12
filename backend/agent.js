const fs = require('fs');
const path = require('path');
const MiniSearch = require('minisearch');

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

const runAgentTools = (message, riskData) => {
  const actions = [];
  const normalized = String(message || '').toLowerCase();
  const wantsRiskSim = /risk|monte|simulation|percentile|p5|p1|curve|volatility|stress/.test(normalized);
  const wantsDpv = /dpv|present value|pv|ltv|loan-to-value|borrow limit/.test(normalized);
  const wantsGovernance = /governance|proposal|vote|dao|committee|shock factor|risk parameter/.test(normalized);
  const wantsPoolMatch = /pool|match|liquidity|lender|borrow offer/.test(normalized);

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

const selectSnippets = (search, docs, query, limit = 5) => {
  if (!search || !docs.length) return [];
  const safeQuery = query?.trim() || DEFAULT_QUERY;
  const results = search.search(safeQuery, { limit: Math.max(limit, 3) });
  if (results.length === 0) {
    return docs.slice(0, limit);
  }
  const seen = new Set();
  const snippets = [];
  results.forEach((result) => {
    if (snippets.length >= limit) return;
    const doc = docs.find((item) => item.id === result.id);
    if (doc && !seen.has(doc.id)) {
      snippets.push(doc);
      seen.add(doc.id);
    }
  });
  return snippets;
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

const buildKnowledgeFallback = (question, snippets, toolOutput, memorySnippets) => {
  const bullets = snippets.slice(0, 4).map((snippet) => {
    const excerpt = snippet.text.replace(/\s+/g, ' ').slice(0, 180);
    return `- ${snippet.heading || 'Context'} (${snippet.file}): ${excerpt}`;
  });
  const memoryBullets = (memorySnippets || []).slice(0, 2).map((memory) => {
    const answer = String(memory.answer || '').replace(/\s+/g, ' ').slice(0, 180);
    return `- Prior solved Q&A: ${answer}`;
  });
  const toolSummary = toolOutput?.summary
    ? `\n${toolOutput.summary}`
    : '\nNo direct simulation/tool output was needed for this question.';
  return [
    'Vestra AI is in knowledge-base mode right now (live model is temporarily unavailable), but here is a reliable answer from protocol context:',
    '',
    ...bullets,
    ...(memoryBullets.length
      ? ['', 'Related prior conversation context:', ...memoryBullets]
      : []),
    '',
    `Question: ${question}`,
    toolSummary,
    '',
    'If you want, I can give a stricter step-by-step borrow/governance checklist for this exact case.'
  ].join('\n');
};

const buildSystemPrompt = (snippets, latestUserMessage = '', memorySnippets = []) => {
  const languageHint = latestUserMessage
    ? `Detect the user's language from their latest message (${latestUserMessage.slice(
        0,
        120
      )}…) and respond in that language. If unclear, default to concise English.`
    : 'Respond in the user\'s language when possible; default to concise English.';
  const context = snippets
    .map(
      (snippet, index) =>
        `# Source ${index + 1}: ${snippet.file} — ${snippet.heading}\n${snippet.text}`
    )
    .join('\n\n');
  const memoryContext = memorySnippets.length
    ? `\nPrior conversation memory (reuse only if relevant and consistent with docs):\n${memorySnippets
        .map(
          (item, index) =>
            `# Memory ${index + 1}\nQ: ${String(item.message || '').slice(0, 280)}\nA: ${String(
              item.answer || ''
            ).slice(0, 320)}`
        )
        .join('\n\n')}`
    : '';
  return [
    'You are CRDT AI, a protocol assistant for the UNLOCKD / VESTRA vesting-credit system.',
    'Answer with concise, actionable steps. When you reference facts, cite the source file name.',
    'If something is unspecified or TODO in docs, say it clearly and suggest what data is needed.',
    'Prefer risk-first guidance: DPV, LTV, unlock timelines, governance/process integrity.',
    'Never invent parameters. Do not give financial advice; keep it product/support oriented.',
    'If the user asks something unrelated to the protocol, reply anyway in a Deadpool/Ryan Reynolds tone: witty, dark, sarcastic, with jokes, but stay brief and safe.',
    languageHint,
    'Use the provided context and say if the answer is not in docs.',
    '\nContext:\n',
    context,
    memoryContext
  ].join('\n');
};

const callLLM = async (messages) => {
  const candidates = [
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
      const base = (candidate.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
      const model = candidate.model || 'gpt-4o-mini';
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

  const toolOutput = runAgentTools(trimmed, agent.riskData || []);
  const snippets = selectSnippets(agent.search, agent.docs, trimmed, 5);
  const memorySnippets = selectMemorySnippets(input?.memory || [], trimmed, 3);
  const toolContext = toolOutput.summary
    ? `\n\nTool output (use as factual context):\n${toolOutput.summary}`
    : '';
  const systemPrompt = `${buildSystemPrompt(snippets, trimmed, memorySnippets)}${toolContext}`;
  const prior = sanitizeHistory(history);
  const messages = [{ role: 'system', content: systemPrompt }, ...prior, { role: 'user', content: trimmed }];

  const llm = await callLLM(messages);
  const fallback = buildKnowledgeFallback(trimmed, snippets, toolOutput, memorySnippets);
  const finalAnswer = llm.usedLLM
    ? llm.answer || fallback
    : fallback;

  return {
    answer: finalAnswer,
    sources: formatSources(snippets),
    mode: llm.usedLLM ? 'llm' : 'knowledge-base',
    provider: llm.provider || null,
    actions: toolOutput.actions || []
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
