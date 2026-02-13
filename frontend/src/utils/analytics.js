import { readWalletAuthToken } from './authStorage.js';

const ANALYTICS_QUEUE_KEY = 'unlockd-analytics-queue';
const ANALYTICS_CLIENT_KEY = 'unlockd-analytics-client-id';
const MAX_QUEUE_SIZE = 200;
let listenersBound = false;
let autoCaptureBound = false;

function getApiBase() {
  const raw = import.meta.env.VITE_BACKEND_URL || '';
  return raw ? raw.replace(/\/$/, '') : '';
}

function getAnalyticsEndpoint() {
  const apiBase = getApiBase();
  return apiBase ? `${apiBase}/api/analytics` : '/api/analytics';
}

function readAuthToken() {
  return readWalletAuthToken();
}

function readAuthWalletAddress() {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem('wallet-auth');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed?.walletAddress || '';
  } catch {
    return '';
  }
}

function getOrCreateClientId() {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(ANALYTICS_CLIENT_KEY);
    if (existing) return existing;
    const next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(ANALYTICS_CLIENT_KEY, next);
    return next;
  } catch {
    return '';
  }
}

function readQueue() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ANALYTICS_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      ANALYTICS_QUEUE_KEY,
      JSON.stringify((items || []).slice(-MAX_QUEUE_SIZE))
    );
  } catch {
    // Ignore storage failures; analytics must not break UX.
  }
}

async function postEvent(body) {
  const endpoint = getAnalyticsEndpoint();
  const authToken = readAuthToken();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
    },
    body: JSON.stringify(body),
    keepalive: true
  });
  if (!response.ok) {
    throw new Error(`Analytics request failed: ${response.status}`);
  }
}

function tryBeacon(body) {
  try {
    if (!navigator?.sendBeacon) return false;
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    return navigator.sendBeacon(getAnalyticsEndpoint(), blob);
  } catch {
    return false;
  }
}

export async function flushAnalyticsQueue() {
  const queue = readQueue();
  if (!queue.length) return;
  const remaining = [];
  for (const item of queue) {
    try {
      await postEvent(item);
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
}

function bindListeners() {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;
  window.addEventListener('online', () => {
    flushAnalyticsQueue();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      flushAnalyticsQueue();
    }
  });
}

export function trackEvent(event, payload = {}) {
  if (!event) return;
  bindListeners();
  const now = Date.now();
  const body = {
    event,
    page: typeof window !== 'undefined' ? window.location.pathname : '',
    walletAddress: readAuthWalletAddress() || undefined,
    properties: {
      ...payload,
      clientId: getOrCreateClientId(),
      appVersion: import.meta.env.VITE_APP_VERSION || 'dev',
      releaseChannel: import.meta.env.VITE_RELEASE_CHANNEL || 'beta',
      evmChainId:
        typeof window !== 'undefined' ? Number(window.localStorage.getItem('last-known-chain-id') || 0) || undefined : undefined
    },
    ts: now
  };

  if (!tryBeacon(body)) {
    postEvent(body).catch(() => {
      const queue = readQueue();
      queue.push(body);
      writeQueue(queue);
    });
  }

  if (import.meta.env.DEV) {
    console.info('[analytics]', event, body.properties);
  }
}

function normalizeLabelFromElement(element) {
  if (!element) return '';
  const fromDataset = element.getAttribute('data-track');
  if (fromDataset) return fromDataset;
  const fromTestId = element.getAttribute('data-testid');
  if (fromTestId) return fromTestId;
  const fromAria = element.getAttribute('aria-label');
  if (fromAria) return fromAria;
  const fromName = element.getAttribute('name');
  if (fromName) return fromName;
  const fromId = element.getAttribute('id');
  if (fromId) return fromId;
  const text = element.textContent?.trim?.() || '';
  if (text) return text.slice(0, 80);
  return element.tagName?.toLowerCase?.() || 'unknown';
}

function getActionElement(startNode) {
  if (!startNode || typeof startNode.closest !== 'function') return null;
  return (
    startNode.closest('[data-track]') ||
    startNode.closest('button') ||
    startNode.closest('a') ||
    startNode.closest('[role="button"]') ||
    startNode.closest('input[type="checkbox"]') ||
    startNode.closest('input[type="radio"]')
  );
}

export function initAnalyticsAutoCapture() {
  if (autoCaptureBound || typeof document === 'undefined') return;
  autoCaptureBound = true;

  document.addEventListener(
    'click',
    (event) => {
      const element = getActionElement(event.target);
      if (!element) return;
      trackEvent('ui_click', {
        element: element.tagName?.toLowerCase?.() || 'unknown',
        label: normalizeLabelFromElement(element)
      });
    },
    true
  );

  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!form || form.tagName?.toLowerCase() !== 'form') return;
      trackEvent('form_submit', {
        formId: form.getAttribute('id') || form.getAttribute('name') || 'anonymous_form'
      });
    },
    true
  );

  document.addEventListener(
    'change',
    (event) => {
      const field = event.target;
      if (!field || !field.tagName) return;
      const tag = field.tagName.toLowerCase();
      if (!['input', 'select', 'textarea'].includes(tag)) return;
      trackEvent('form_change', {
        field: normalizeLabelFromElement(field),
        inputType: field.getAttribute('type') || tag
      });
    },
    true
  );

  window.addEventListener('error', (event) => {
    trackEvent('frontend_error', {
      message: event?.message || 'Unknown error',
      source: event?.filename || ''
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason =
      typeof event?.reason === 'string'
        ? event.reason
        : event?.reason?.message || 'Unhandled promise rejection';
    trackEvent('frontend_unhandled_rejection', { reason: String(reason).slice(0, 240) });
  });
}
