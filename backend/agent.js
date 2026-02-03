const fs = require('fs');
const path = require('path');
const MiniSearch = require('minisearch');

const DOC_DIR = path.join(__dirname, '..', 'docs');
const MAX_CHUNK_LENGTH = 900;
const DEFAULT_QUERY = 'CRDT protocol risk unlock borrowing vesting governance';

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

const buildSystemPrompt = (snippets, latestUserMessage = '') => {
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
    context
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

  const snippets = selectSnippets(agent.search, agent.docs, trimmed, 5);
  const systemPrompt = buildSystemPrompt(snippets, trimmed);
  const prior = sanitizeHistory(history);
  const messages = [{ role: 'system', content: systemPrompt }, ...prior, { role: 'user', content: trimmed }];

  const llm = await callLLM(messages);
  const fallback = !llm.usedLLM
    ? `Context-only summary:\n${snippets
        .map((snippet) => `- (${snippet.file}) ${snippet.heading}: ${snippet.text.slice(0, 160)}`)
        .join('\n')}`
    : '';

  return {
    answer: llm.answer || fallback,
    sources: formatSources(snippets),
    mode: llm.usedLLM ? 'llm' : 'context-only',
    provider: llm.provider || null
  };
};

const initAgent = () => {
  const docs = loadDocs();
  const search = initSearch(docs);
  console.log(`[agent] loaded ${docs.length} doc chunks from ${DOC_DIR}`);
  return { docs, search };
};

module.exports = {
  initAgent,
  answerAgent
};
