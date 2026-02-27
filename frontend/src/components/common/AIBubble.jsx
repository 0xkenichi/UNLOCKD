import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAccount, useChainId } from 'wagmi';
import { askAgent, requestMatchQuote } from '../../utils/api.js';
import { generateRiskPaths } from '../../utils/riskPaths.js';
import { findLocalAnswer, FALLBACK_ANSWER } from '../../data/vestraKnowledge.js';
import TurnstileWidget from './TurnstileWidget.jsx';
import CRDTMascot from './CRDTMascot.jsx';

const ValuationPreview3D = lazy(() =>
  import('../borrow/ValuationPreview3D.jsx')
);

const buildRiskPaths = (stats) => {
  const mean = Number(stats?.meanPV || 0);
  const p5 = Number(stats?.p5PV || 0);
  if (!mean) return [];
  const ratio = mean > 0 ? p5 / mean : 0.3;
  const ltvBps = Math.round(
    Math.max(2500, Math.min(4000, ratio * 5000))
  );
  return generateRiskPaths({ pv: mean, ltvBps });
};

const buildUsageGuide = () =>
  [
    'Quick start:',
    '1) Connect wallet and confirm network.',
    '2) Borrow: escrow vesting collateral, review max borrow, then create a loan.',
    '3) Repay: fund gas + USDC, approve USDC, then repay by loan ID.',
    '4) Portfolio: track active loans, collateral, and settlement status.',
    '',
    'Repay checklist:',
    '- Use the same borrower wallet that created the loan.',
    '- Check loan status is active on the current network.',
    '- Approve at least your repay amount in USDC before submitting repay.'
  ].join('\n');

const sanitizeKnowledgeAnswer = (answer) => {
  const text = String(answer || '').trim();
  if (!text) return '';
  const blockedPrefixes = [
    'Related prior conversation context:',
    'No direct simulation/tool output was needed',
    'Using provider:',
    'Sources'
  ];
  const seen = new Set();
  const filtered = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .filter((line) => !blockedPrefixes.some((prefix) => line.startsWith(prefix)))
    .filter((line) => !line.startsWith('Question:'))
    .filter((line) => !/^-\s*Prior solved Q&A:/i.test(line))
    .filter((line) => !/knowledge-base mode right now/i.test(line))
    .filter((line) => {
      const normalized = line.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!normalized) return false;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join('\n')
    .trim();
  return filtered;
};

const shouldUseUsageGuide = (query, answer) => {
  const q = String(query || '').toLowerCase();
  const a = String(answer || '').toLowerCase();
  const asksForGuide =
    q.includes('how to use') ||
    q === 'explain' ||
    q.includes('walk me through') ||
    q.includes('getting started');
  const noisyAnswer =
    a.includes('related prior conversation context') ||
    a.includes('no direct simulation/tool output') ||
    a.includes('knowledge-base mode right now');
  return asksForGuide && noisyAnswer;
};

const AI_PANEL_STORAGE_KEY = 'vestra_ai_open_by_route';
const GUIDE_TARGET_ID_RE = /^[a-zA-Z0-9_-]{1,80}$/;

const isSafeInternalPath = (value) => {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  return !/^\s*(?:https?:|javascript:|data:)/i.test(value);
};

const readOpenStateByRoute = () => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(AI_PANEL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const getSavedOpenState = (pathname) => {
  const stateByRoute = readOpenStateByRoute();
  if (Object.prototype.hasOwnProperty.call(stateByRoute, pathname)) {
    return Boolean(stateByRoute[pathname]);
  }
  return false;
};

const saveOpenState = (pathname, isOpen) => {
  if (typeof window === 'undefined') return;
  const stateByRoute = readOpenStateByRoute();
  stateByRoute[pathname] = Boolean(isOpen);
  try {
    window.localStorage.setItem(AI_PANEL_STORAGE_KEY, JSON.stringify(stateByRoute));
  } catch {
    // Ignore storage failures and keep in-memory behavior.
  }
};

export default function AIBubble() {
  const navigate = useNavigate();
  const location = useLocation();
  const { address } = useAccount();
  const chainId = useChainId();
  const shellRef = useRef(null);
  const inputRef = useRef(null);
  const threadRef = useRef(null);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [sources, setSources] = useState([]);
  const [provider, setProvider] = useState('');
  const [intent, setIntent] = useState('');
  const [confidence, setConfidence] = useState(null);
  const [actions, setActions] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(() =>
    getSavedOpenState(typeof window === 'undefined' ? '/' : window.location.pathname)
  );
  const [hasUnreadHint, setHasUnreadHint] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  const [poolMatches, setPoolMatches] = useState({});
  const [guidedFlow, setGuidedFlow] = useState(null);
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);
  const [pendingGuideStep, setPendingGuideStep] = useState(null);
  const [guideNotice, setGuideNotice] = useState('');
  const [autoAdvanceGuide, setAutoAdvanceGuide] = useState(true);
  const highlightedRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const highlightClickHandlerRef = useRef(null);
  const highlightedBadgeRef = useRef(null);
  const clickAdvanceTimerRef = useRef(null);
  const guidedFlowRef = useRef(null);
  const guidedStepIndexRef = useRef(0);
  const autoAdvancePendingRef = useRef(false);

  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const captchaReady = !turnstileSiteKey || Boolean(captchaToken);

  const quickReplies = useMemo(
    () => [
      'Suggested parameters for loans',
      'Governance checklist for updates',
      'Risk overview for unlocks'
    ],
    []
  );
  const shouldExpand =
    status === 'thinking' ||
    messages.some((item) => String(item?.content || '').length > 220);

  useEffect(() => {
    if (!isOpen) return;
    setHasUnreadHint(false);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 140);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, status, isOpen]);

  useEffect(() => {
    setIsOpen(getSavedOpenState(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    saveOpenState(location.pathname, isOpen);
  }, [location.pathname, isOpen]);

  useEffect(() => {
    guidedFlowRef.current = guidedFlow;
  }, [guidedFlow]);

  useEffect(() => {
    guidedStepIndexRef.current = guidedStepIndex;
  }, [guidedStepIndex]);

  useEffect(
    () => () => {
      if (highlightedRef.current) {
        if (highlightClickHandlerRef.current) {
          highlightedRef.current.removeEventListener('click', highlightClickHandlerRef.current);
        }
        highlightedRef.current.classList.remove('guide-glow');
      }
      if (highlightedBadgeRef.current) {
        highlightedBadgeRef.current.remove();
      }
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      if (clickAdvanceTimerRef.current) {
        clearTimeout(clickAdvanceTimerRef.current);
      }
      highlightClickHandlerRef.current = null;
      highlightedBadgeRef.current = null;
      clickAdvanceTimerRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event) => {
      if (!shellRef.current) return;
      if (shellRef.current.contains(event.target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const handleQuery = async (forcedQuery) => {
    const trimmed = String(forcedQuery ?? query).trim();
    if (!trimmed) return;
    if (!captchaReady) {
      setCaptchaError('Complete the captcha to continue.');
      return;
    }
    const nextHistory = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextHistory);
    setStatus('thinking');
    setError('');
    setCaptchaError('');
    const context = {
      path: location.pathname,
      chainId: Number.isFinite(chainId) ? chainId : undefined,
      walletAddress: address || undefined,
      page: 'frontend'
    };
    try {
      const data = await askAgent(
        trimmed,
        nextHistory,
        captchaToken || undefined,
        context
      );
      const useGuide = shouldUseUsageGuide(trimmed, data.answer);
      const cleaned = sanitizeKnowledgeAnswer(data.answer || '');
      const content = useGuide ? buildUsageGuide() : cleaned || 'No answer yet.';
      setMessages((prev) => [...prev, { role: 'assistant', content }]);
      if (!isOpen) {
        setHasUnreadHint(true);
      }
      setSources(data.sources || []);
      setProvider(data.provider || (data.mode === 'knowledge-base' ? 'Knowledge Base' : ''));
      setIntent(data.intent || '');
      setConfidence(Number.isFinite(data.confidence) ? data.confidence : null);
      setActions(data.actions || []);
      const guideAction = (data.actions || []).find(
        (action) => action.type === 'guided_flow' && Array.isArray(action.data?.steps)
      );
      if (guideAction) {
        setGuidedFlow(guideAction.data);
        setGuidedStepIndex(0);
        setGuideNotice('Interactive guide ready. Press highlight to follow steps.');
      } else {
        setGuidedFlow(null);
        setGuidedStepIndex(0);
        setGuideNotice('');
      }
    } catch (err) {
      const local = findLocalAnswer(trimmed);
      if (local) {
        setMessages((prev) => [...prev, { role: 'assistant', content: local.answer }]);
        if (!isOpen) {
          setHasUnreadHint(true);
        }
        setProvider('Knowledge Base (offline)');
        setIntent('knowledge_fallback');
        setConfidence(null);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: FALLBACK_ANSWER }
        ]);
        if (!isOpen) {
          setHasUnreadHint(true);
        }
        setProvider('Fallback');
        setIntent('fallback');
        setConfidence(null);
      }
      setError('');
    } finally {
      setStatus('idle');
      setQuery('');
      if (turnstileSiteKey) {
        setCaptchaToken('');
        setCaptchaKey((prev) => prev + 1);
      }
    }
  };

  const handleNewThread = () => {
    setQuery('');
    setMessages([]);
    setSources([]);
    setError('');
    setIntent('');
    setConfidence(null);
    setActions([]);
    setGuidedFlow(null);
    setGuidedStepIndex(0);
    setPendingGuideStep(null);
    setGuideNotice('');
  };

  const handleQuickReply = async (text) => {
    setQuery(text);
    await handleQuery(text);
  };

  const handlePoolMatch = useCallback(async (key, data) => {
    if (!data?.collateralId || !data?.desiredAmountUsd) {
      setPoolMatches((prev) => ({
        ...prev,
        [key]: { error: 'Provide collateral ID and desired amount to match pools.' }
      }));
      return;
    }
    setPoolMatches((prev) => ({
      ...prev,
      [key]: { status: 'loading' }
    }));
    try {
      const result = await requestMatchQuote({
        chain: data.chain || 'base',
        collateralId: data.collateralId,
        desiredAmountUsd: Number(data.desiredAmountUsd),
        borrowerWallet: address || undefined
      });
      setPoolMatches((prev) => ({
        ...prev,
        [key]: { status: 'ready', offers: result.offers || [] }
      }));
    } catch (err) {
      setPoolMatches((prev) => ({
        ...prev,
        [key]: { status: 'error', error: err?.message || 'Unable to match pools.' }
      }));
    }
  }, [address]);

  useEffect(() => {
    const poolActions = (actions || []).filter((action) => action.type === 'pool_match');
    if (!poolActions.length) return;
    poolActions.forEach((action, index) => {
      const key = `pool-${index}`;
      const state = poolMatches[key];
      if (state?.status) return;
      const collateralId = action.data?.collateralId;
      const desiredAmountUsd = action.data?.desiredAmountUsd;
      if (collateralId && desiredAmountUsd) {
        handlePoolMatch(key, action.data);
      }
    });
  }, [actions, poolMatches, handlePoolMatch]);

  const clearGuideHighlight = () => {
    if (highlightedRef.current) {
      if (highlightClickHandlerRef.current) {
        highlightedRef.current.removeEventListener('click', highlightClickHandlerRef.current);
      }
      highlightedRef.current.classList.remove('guide-glow');
      highlightedRef.current = null;
      highlightClickHandlerRef.current = null;
    }
    if (highlightedBadgeRef.current) {
      highlightedBadgeRef.current.remove();
      highlightedBadgeRef.current = null;
    }
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    if (clickAdvanceTimerRef.current) {
      clearTimeout(clickAdvanceTimerRef.current);
      clickAdvanceTimerRef.current = null;
    }
  };

  const applyGuideHighlight = (targetId, stepIndex = null, totalSteps = null) => {
    clearGuideHighlight();
    if (typeof targetId !== 'string' || !GUIDE_TARGET_ID_RE.test(targetId)) {
      setGuideNotice('Invalid guide target.');
      return false;
    }
    const escapedTargetId = window.CSS?.escape ? window.CSS.escape(targetId) : targetId;
    const target = document.querySelector(`[data-guide-id="${escapedTargetId}"]`);
    if (!target) {
      setGuideNotice('Target not visible yet. Open the correct page/module first.');
      return false;
    }
    target.classList.add('guide-glow');
    const badge = document.createElement('span');
    badge.className = 'guide-step-pill';
    const safeStepIndex =
      Number.isFinite(stepIndex) && Number(stepIndex) >= 0 ? Number(stepIndex) + 1 : null;
    const safeTotal =
      Number.isFinite(totalSteps) && Number(totalSteps) > 0 ? Number(totalSteps) : null;
    badge.textContent =
      safeStepIndex && safeTotal
        ? `Step ${safeStepIndex}/${safeTotal}`
        : 'Next step';
    if (safeStepIndex && safeTotal) {
      const ratio = safeStepIndex / safeTotal;
      if (ratio <= 0.34) {
        badge.classList.add('guide-step-pill--start');
      } else if (ratio <= 0.67) {
        badge.classList.add('guide-step-pill--mid');
      } else {
        badge.classList.add('guide-step-pill--final');
      }
    }
    target.appendChild(badge);
    highlightedBadgeRef.current = badge;
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    highlightedRef.current = target;
    highlightClickHandlerRef.current = () => {
      if (!autoAdvanceGuide) return;
      const flow = guidedFlowRef.current;
      const currentIndex = guidedStepIndexRef.current;
      if (!flow?.steps?.length) return;
      if (highlightedBadgeRef.current) {
        highlightedBadgeRef.current.textContent = 'Done';
        highlightedBadgeRef.current.classList.add('guide-step-pill--done');
      }
      const isLast = currentIndex >= flow.steps.length - 1;
      if (isLast) {
        setGuideNotice('Nice. Guide complete. Need more help?');
        clickAdvanceTimerRef.current = window.setTimeout(() => {
          clearGuideHighlight();
        }, 700);
        return;
      }
      const nextIndex = currentIndex + 1;
      clickAdvanceTimerRef.current = window.setTimeout(() => {
        autoAdvancePendingRef.current = true;
        setGuidedStepIndex(nextIndex);
        setGuideNotice(`Great. Next: ${flow.steps[nextIndex]?.label || 'continue'}`);
      }, 340);
    };
    target.addEventListener('click', highlightClickHandlerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      clearGuideHighlight();
    }, 5000);
    setGuideNotice('Highlighted next step.');
    return true;
  };

  const runGuideStep = (step) => {
    if (!step) return;
    const flow = guidedFlowRef.current;
    const stepIndex = guidedStepIndexRef.current;
    const totalSteps = Array.isArray(flow?.steps) ? flow.steps.length : null;
    const safePath = isSafeInternalPath(step.path) ? step.path : '';
    if (step.path && !safePath) {
      setGuideNotice('Blocked unsafe guide route.');
      return;
    }
    if (safePath && location.pathname !== safePath) {
      setPendingGuideStep(step);
      navigate(safePath);
      return;
    }
    applyGuideHighlight(step.targetId, stepIndex, totalSteps);
  };

  useEffect(() => {
    if (!autoAdvancePendingRef.current) return;
    autoAdvancePendingRef.current = false;
    const flow = guidedFlowRef.current;
    const step = flow?.steps?.[guidedStepIndexRef.current];
    if (!step) return;
    const timer = window.setTimeout(() => {
      runGuideStep(step);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [guidedStepIndex, location.pathname]);

  useEffect(() => {
    if (!pendingGuideStep) return;
    const pendingSafePath = isSafeInternalPath(pendingGuideStep.path) ? pendingGuideStep.path : '';
    if (pendingSafePath && pendingSafePath !== location.pathname) return;
    const timer = window.setTimeout(() => {
      const flow = guidedFlowRef.current;
      const stepIndex = guidedStepIndexRef.current;
      const totalSteps = Array.isArray(flow?.steps) ? flow.steps.length : null;
      applyGuideHighlight(pendingGuideStep.targetId, stepIndex, totalSteps);
      setPendingGuideStep(null);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [location.pathname, pendingGuideStep]);

  return (
    <div ref={shellRef} className={`ai-bubble-shell ${isOpen ? 'open' : ''}`}>
      <button
        className={`ai-fab ${isOpen ? 'hidden' : ''} ${hasUnreadHint ? 'attention' : ''}`}
        type="button"
        onClick={() => {
          setIsOpen(true);
          setHasUnreadHint(false);
        }}
        aria-label="Open Vestra AI"
      >
        <CRDTMascot size={44} className="ai-bubble-mascot" />
        <span className="ai-fab-label">CRDT AI</span>
      </button>
      <div
        className={`ai-bubble ${isOpen ? 'open' : ''} ${shouldExpand ? 'expanded' : ''}`}
        aria-hidden={!isOpen}
      >
        <div className="ai-bubble-header">
          <div className="ai-bubble-title-row">
            <CRDTMascot size={30} className="ai-bubble-mascot" />
            <div>
              <div className="section-title">Vestra AI</div>
              <div className="section-subtitle">Risk assistant</div>
            </div>
          </div>
          <button
            className="ai-toggle"
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close Vestra AI"
          >
            ×
          </button>
        </div>
        <div className="ai-bubble-body">
          <input
            ref={inputRef}
            className="ai-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleQuery();
              }
            }}
            placeholder="Ask about risk or unlocks"
          />
          {turnstileSiteKey && (
            <div className="turnstile-panel">
              <div className="muted small">Verify to send a request.</div>
              <TurnstileWidget
                key={captchaKey}
                siteKey={turnstileSiteKey}
                onVerify={setCaptchaToken}
                onExpire={() => setCaptchaToken('')}
                onError={() => setCaptchaError('Captcha unavailable.')}
                action="agent_chat"
                theme="auto"
              />
              {captchaError && <div className="error-text">{captchaError}</div>}
            </div>
          )}
          <div className="inline-actions">
            <button
              className="button"
              onClick={handleQuery}
              disabled={status === 'thinking' || !captchaReady}
            >
              Send
            </button>
            <button className="button ghost" type="button" onClick={handleNewThread}>
              New Thread
            </button>
            <button className="button ghost" type="button" onClick={() => setIsOpen(false)}>
              Hide
            </button>
          </div>
          {guidedFlow && Array.isArray(guidedFlow.steps) && guidedFlow.steps.length > 0 && (
            <div className="ai-panel">
              <div className="section-subtitle">{guidedFlow.title || 'Interactive guide'}</div>
              <div className="muted small">
                Step {guidedStepIndex + 1} of {guidedFlow.steps.length}
              </div>
              <div className="muted">
                {guidedFlow.steps[guidedStepIndex]?.label || 'Follow the next highlighted action.'}
              </div>
              {guidedFlow.steps[guidedStepIndex]?.hint && (
                <div className="muted small">{guidedFlow.steps[guidedStepIndex].hint}</div>
              )}
              {guideNotice && <div className="muted small">{guideNotice}</div>}
              <div className="inline-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => runGuideStep(guidedFlow.steps[guidedStepIndex])}
                >
                  Highlight Next
                </button>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => setAutoAdvanceGuide((value) => !value)}
                >
                  {autoAdvanceGuide ? 'Auto-advance On' : 'Auto-advance Off'}
                </button>
                <button
                  className="button ghost"
                  type="button"
                  disabled={guidedStepIndex <= 0}
                  onClick={() => setGuidedStepIndex((index) => Math.max(0, index - 1))}
                >
                  Prev
                </button>
                <button
                  className="button ghost"
                  type="button"
                  disabled={guidedStepIndex >= guidedFlow.steps.length - 1}
                  onClick={() =>
                    setGuidedStepIndex((index) =>
                      Math.min(guidedFlow.steps.length - 1, index + 1)
                    )
                  }
                >
                  Next
                </button>
              </div>
            </div>
          )}
          <div ref={threadRef} className="stack ai-thread">
            {!messages.length && (
              <div className="muted">Ask about DPV, LTV, unlock safety, or governance steps.</div>
            )}
              {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className="stack">
                <div className="muted small">
                  {message.role === 'assistant' ? 'Vestra AI' : 'You'}
                </div>
                <div className="ai-message">{message.content}</div>
              </div>
            ))}
            {status === 'thinking' && <div className="muted">Analyzing docs…</div>}
            {error && <div className="error-text">{error}</div>}
            {provider && (
              <div className="muted small">
                Using provider: <span className="chip">{provider}</span>
              </div>
            )}
            {(intent || confidence !== null) && (
              <div className="muted small">
                {intent ? `Intent: ${intent}` : 'Intent: unknown'}
                {confidence !== null ? ` • Confidence: ${(confidence * 100).toFixed(0)}%` : ''}
              </div>
            )}
          </div>
          {actions?.length ? (
            <div className="stack ai-actions">
              {actions
                .filter((action) => action.type === 'risk_sim')
                .map((action, index) => {
                  const stats = action.data?.stats || {};
                  const paths = buildRiskPaths(stats);
                  return (
                    <div key={`risk-${index}`} className="ai-panel">
                      <div className="section-subtitle">Risk Simulation</div>
                      <div className="risk-grid">
                        <div>
                          <div className="muted small">Horizon</div>
                          <div className="stat-value">{action.data?.months ?? '--'} mo</div>
                        </div>
                        <div>
                          <div className="muted small">Volatility</div>
                          <div className="stat-value">{action.data?.volatility ?? '--'}%</div>
                        </div>
                        <div>
                          <div className="muted small">Mean PV</div>
                          <div className="stat-value">{stats.meanPV?.toFixed?.(0) ?? '--'}</div>
                        </div>
                        <div>
                          <div className="muted small">P5 PV</div>
                          <div className="stat-value">{stats.p5PV?.toFixed?.(0) ?? '--'}</div>
                        </div>
                        <div>
                          <div className="muted small">ES5 PV</div>
                          <div className="stat-value">{stats.es5PV?.toFixed?.(0) ?? '--'}</div>
                        </div>
                      </div>
                      <div className="inline-actions">
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => navigate('/borrow')}
                        >
                          Open Borrow
                        </button>
                      </div>
                      {paths.length ? (
                        <div className="ai-preview">
                          <Suspense fallback={<div className="muted small">Loading sim…</div>}>
                            <ValuationPreview3D paths={paths} />
                          </Suspense>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              {actions
                .filter((action) => action.type === 'dpv_estimate')
                .map((action, index) => (
                  <div key={`dpv-${index}`} className="ai-panel">
                    <div className="section-subtitle">DPV Estimate</div>
                    <div className="risk-grid">
                      <div>
                        <div className="muted small">PV</div>
                        <div className="stat-value">{action.data?.pv?.toFixed?.(2) ?? '--'}</div>
                      </div>
                      <div>
                        <div className="muted small">Suggested LTV</div>
                        <div className="stat-value">
                          {action.data?.ltv ? `${Math.round(action.data.ltv * 100)}%` : '--'}
                        </div>
                      </div>
                      <div>
                        <div className="muted small">Max Borrow</div>
                        <div className="stat-value">{action.data?.maxBorrow?.toFixed?.(2) ?? '--'}</div>
                      </div>
                      <div>
                        <div className="muted small">Unlock</div>
                        <div className="stat-value">{action.data?.months ?? '--'} mo</div>
                      </div>
                      <div>
                        <div className="muted small">Volatility</div>
                        <div className="stat-value">{action.data?.volatility ?? '--'}%</div>
                      </div>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="button ghost"
                        type="button"
                        onClick={() => navigate('/borrow')}
                      >
                        Open Borrow
                      </button>
                    </div>
                  </div>
                ))}
              {actions
                .filter((action) => action.type === 'governance_suggestion')
                .map((action, index) => (
                  <div key={`gov-${index}`} className="ai-panel">
                    <div className="section-subtitle">{action.data?.title || 'Governance'}</div>
                    <div className="muted">{action.data?.details}</div>
                    {Array.isArray(action.data?.nextSteps) && action.data.nextSteps.length ? (
                      <div className="chip-row">
                        {action.data.nextSteps.map((step) => (
                          <span key={step} className="chip">
                            {step}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="inline-actions">
                      <button
                        className="button ghost"
                        type="button"
                        onClick={() => navigate('/governance')}
                      >
                        Open Governance
                      </button>
                    </div>
                  </div>
                ))}
              {actions
                .filter((action) => action.type === 'pool_match')
                .map((action, index) => {
                  const key = `pool-${index}`;
                  const state = poolMatches[key] || {};
                  const chainLabel = action.data?.chain || 'base';
                  return (
                    <div key={key} className="ai-panel">
                      <div className="section-subtitle">Pool Match</div>
                      <div className="muted">
                        Match collateral ID {action.data?.collateralId || '--'} for $
                        {action.data?.desiredAmountUsd || '--'} on{' '}
                        {chainLabel}.
                      </div>
                      <div className="muted small" style={{ marginTop: 6 }}>
                        {chainLabel === 'solana'
                          ? 'Solana quotes are advisory-only in this MVP; settlement is Base-only.'
                          : 'Offers are advisory; settlement is Base-only in this MVP.'}
                      </div>
                      {state.error && <div className="error-text">{state.error}</div>}
                      {state.status === 'ready' && !state.offers?.length && (
                        <div className="muted">No matching pools yet.</div>
                      )}
                      {state.offers?.length ? (
                        <div className="data-table">
                          <div className="table-row header">
                            <div>Pool</div>
                            <div>Risk</div>
                            <div>Interest</div>
                            <div>Max</div>
                          </div>
                          {state.offers.map((offer) => (
                            <div key={offer.offerId} className="table-row">
                              <div>{offer.poolName || `${offer.poolId?.slice?.(0, 8) || 'pool'}...`}</div>
                              <div>{offer.riskTier}</div>
                              <div>{offer.interestBps} bps</div>
                              <div>${Number(offer.maxBorrowUsd || 0).toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {state.offers?.length ? (
                        <div className="inline-actions wrap" style={{ marginTop: 10 }}>
                          {state.offers.slice(0, 3).map((offer) => (
                            <button
                              key={`use-${offer.offerId}`}
                              className="chip"
                              type="button"
                              onClick={() => {
                                const collateralId = action.data?.collateralId || '';
                                const desiredAmountUsd = action.data?.desiredAmountUsd || null;
                                navigate('/borrow', {
                                  state: {
                                    prefill: {
                                      fromAgent: true,
                                      chain: chainLabel,
                                      collateralId,
                                      desiredAmountUsd,
                                      preferredOfferId: offer.offerId
                                    }
                                  }
                                });
                              }}
                              disabled={!action.data?.collateralId || !action.data?.desiredAmountUsd}
                              title="Open Borrow with this offer selected"
                            >
                              Use {offer.poolName || offer.poolId?.slice?.(0, 6) || 'offer'}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="inline-actions">
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => handlePoolMatch(key, action.data)}
                          disabled={state.status === 'loading'}
                        >
                          {state.status === 'loading' ? 'Matching…' : 'Fetch Offers'}
                        </button>
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => navigate('/lender')}
                        >
                          Open Lender
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : null}
          {sources?.length ? (
            <div className="stack">
              <div className="section-subtitle">Sources</div>
              <div className="inline-actions wrap">
                {sources.map((source, index) => (
                  <span key={`${source.file}-${index}`} className="chip">
                    {source.file.replace('.md', '')}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="inline-actions wrap">
            {quickReplies.map((text) => (
              <button
                key={text}
                className="chip"
                type="button"
                onClick={() => handleQuickReply(text)}
                disabled={status === 'thinking'}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
