import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function AIBubble() {
  const navigate = useNavigate();
  const shellRef = useRef(null);
  const inputRef = useRef(null);
  const threadRef = useRef(null);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [sources, setSources] = useState([]);
  const [provider, setProvider] = useState('');
  const [actions, setActions] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnreadHint, setHasUnreadHint] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  const [poolMatches, setPoolMatches] = useState({});

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
    try {
      const data = await askAgent(trimmed, nextHistory, captchaToken || undefined);
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer || 'No answer yet.' }]);
      if (!isOpen) {
        setHasUnreadHint(true);
      }
      setSources(data.sources || []);
      setProvider(data.provider || (data.mode === 'knowledge-base' ? 'Knowledge Base' : ''));
      setActions(data.actions || []);
    } catch (err) {
      const local = findLocalAnswer(trimmed);
      if (local) {
        setMessages((prev) => [...prev, { role: 'assistant', content: local.answer }]);
        if (!isOpen) {
          setHasUnreadHint(true);
        }
        setProvider('Knowledge Base (offline)');
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: FALLBACK_ANSWER }
        ]);
        if (!isOpen) {
          setHasUnreadHint(true);
        }
        setProvider('Fallback');
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
    setActions([]);
  };

  const handleQuickReply = async (text) => {
    setQuery(text);
    await handleQuery(text);
  };

  const handlePoolMatch = async (key, data) => {
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
        desiredAmountUsd: Number(data.desiredAmountUsd)
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
  };

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
          </div>
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
                  return (
                    <div key={key} className="ai-panel">
                      <div className="section-subtitle">Pool Match</div>
                      <div className="muted">
                        Match collateral ID {action.data?.collateralId || '--'} for $
                        {action.data?.desiredAmountUsd || '--'} on{' '}
                        {action.data?.chain || 'base'}.
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
                              <div>{offer.poolId.slice(0, 8)}...</div>
                              <div>{offer.riskTier}</div>
                              <div>{offer.interestBps} bps</div>
                              <div>${Number(offer.maxBorrowUsd || 0).toFixed(2)}</div>
                            </div>
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
