'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAccount, useChainId } from 'wagmi';
import { askAgent, requestMatchQuote } from '@/utils/api';
import { generateRiskPaths } from '@/utils/riskPaths';
import { findLocalAnswer, FALLBACK_ANSWER } from '@/config/vestraKnowledge';
import TurnstileWidget from '@/components/ui/TurnstileWidget';
import CRDTMascot from '@/components/ui/CRDTMascot';
import { AnimatePresence, motion } from 'framer-motion';

const ValuationPreview3D = lazy(() =>
  import('@/components/borrow/ValuationPreview3D')
);

// Types
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Action {
  type: string;
  data?: any;
}

const buildRiskPaths = (stats: any) => {
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

const sanitizeKnowledgeAnswer = (answer: string) => {
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

const shouldUseUsageGuide = (query: string, answer: string) => {
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

const isSafeInternalPath = (value: string) => {
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

const getSavedOpenState = (pathname: string) => {
  const stateByRoute = readOpenStateByRoute();
  if (Object.prototype.hasOwnProperty.call(stateByRoute, pathname)) {
    return Boolean(stateByRoute[pathname]);
  }
  return false;
};

const saveOpenState = (pathname: string, isOpen: boolean) => {
  if (typeof window === 'undefined') return;
  const stateByRoute = readOpenStateByRoute();
  stateByRoute[pathname] = Boolean(isOpen);
  try {
    window.localStorage.setItem(AI_PANEL_STORAGE_KEY, JSON.stringify(stateByRoute));
  } catch {
    // Ignore storage failures
  }
};

export default function AIBubble() {
  const router = useRouter();
  const pathname = usePathname();
  const { address } = useAccount();
  const chainId = useChainId();
  const shellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [provider, setProvider] = useState('');
  const [intent, setIntent] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [status, setStatus] = useState< 'idle' | 'thinking' >('idle');
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnreadHint, setHasUnreadHint] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  const [poolMatches, setPoolMatches] = useState<Record<string, any>>({});
  const [guidedFlow, setGuidedFlow] = useState<any>(null);
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);
  const [pendingGuideStep, setPendingGuideStep] = useState<any>(null);
  const [guideNotice, setGuideNotice] = useState('');
  const [autoAdvanceGuide, setAutoAdvanceGuide] = useState(true);
  
  const highlightedRef = useRef<HTMLElement | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const highlightClickHandlerRef = useRef<any>(null);
  const highlightedBadgeRef = useRef<HTMLElement | null>(null);
  const clickAdvanceTimerRef = useRef<number | null>(null);
  const guidedFlowRef = useRef<any>(null);
  const guidedStepIndexRef = useRef(0);
  const autoAdvancePendingRef = useRef(false);

  // Site key from env
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const captchaReady = !turnstileSiteKey || Boolean(captchaToken);

  const shouldExpand =
    status === 'thinking' ||
    messages.some((item) => String(item?.content || '').length > 220);

  useEffect(() => {
    setIsOpen(getSavedOpenState(pathname));
  }, [pathname]);

  useEffect(() => {
    saveOpenState(pathname, isOpen);
  }, [pathname, isOpen]);

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
    guidedFlowRef.current = guidedFlow;
  }, [guidedFlow]);

  useEffect(() => {
    guidedStepIndexRef.current = guidedStepIndex;
  }, [guidedStepIndex]);

  // Clean up guide effects
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
    },
    []
  );

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!shellRef.current) return;
      if (shellRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [isOpen]);

  const handleQuery = async (forcedQuery?: string) => {
    const trimmed = String(forcedQuery ?? query).trim();
    if (!trimmed) return;
    if (!captchaReady) {
      setCaptchaError('Complete the captcha to continue.');
      return;
    }

    const nextHistory: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextHistory);
    setStatus('thinking');
    setError('');
    setCaptchaError('');

    const context = {
      path: pathname,
      chainId: Number.isFinite(chainId) ? chainId : undefined,
      walletAddress: address || undefined,
      page: 'frontend-v2'
    };

    try {
      const data = await askAgent(
        trimmed,
        nextHistory,
        captchaToken,
        context
      );

      const useGuide = shouldUseUsageGuide(trimmed, data.answer);
      const cleaned = sanitizeKnowledgeAnswer(data.answer || '');
      const content = useGuide ? buildUsageGuide() : cleaned || 'No answer yet.';
      
      setMessages((prev) => [...prev, { role: 'assistant', content }]);
      if (!isOpen) setHasUnreadHint(true);
      
      setSources(data.sources || []);
      setProvider(data.provider || (data.mode === 'knowledge-base' ? 'Knowledge Base' : ''));
      setIntent(data.intent || '');
      setConfidence(Number.isFinite(data.confidence) ? data.confidence : null);
      setActions(data.actions || []);

      const guideAction = (data.actions || []).find(
        (action: any) => action.type === 'guided_flow' && Array.isArray(action.data?.steps)
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
        if (!isOpen) setHasUnreadHint(true);
        setProvider('Knowledge Base (offline)');
        setIntent('knowledge_fallback');
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: FALLBACK_ANSWER }]);
        if (!isOpen) setHasUnreadHint(true);
        setProvider('Fallback');
      }
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

  const handlePoolMatch = useCallback(async (key: string, data: any) => {
    if (!data?.collateralId || !data?.desiredAmountUsd) {
      setPoolMatches((prev) => ({
        ...prev,
        [key]: { error: 'Provide collateral ID and desired amount.' }
      }));
      return;
    }

    setPoolMatches((prev) => ({ ...prev, [key]: { status: 'loading' } }));
    try {
      const result = await requestMatchQuote({
        chain: data.chain || 'base',
        collateralId: data.collateralId,
        desiredAmountUsd: Number(data.desiredAmountUsd),
        borrowerWallet: address || undefined
      });
      setPoolMatches((prev) => ({ ...prev, [key]: { status: 'ready', offers: result.offers || [] } }));
    } catch (err: any) {
      setPoolMatches((prev) => ({ ...prev, [key]: { status: 'error', error: err?.message || 'Match failed.' } }));
    }
  }, [address]);

  useEffect(() => {
    const poolActions = (actions || []).filter((action) => action.type === 'pool_match');
    if (!poolActions.length) return;
    poolActions.forEach((action, index) => {
      const key = `pool-${index}`;
      if (poolMatches[key]) return;
      handlePoolMatch(key, action.data);
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

  const applyGuideHighlight = (targetId: string, stepIndex = 0, totalSteps = 0) => {
    clearGuideHighlight();
    if (!GUIDE_TARGET_ID_RE.test(targetId)) return false;

    const target = document.querySelector(`[data-guide-id="${targetId}"]`) as HTMLElement;
    if (!target) {
      setGuideNotice('Target not visible yet. Go to the correct page first.');
      return false;
    }

    target.classList.add('guide-glow');
    const badge = document.createElement('span');
    badge.className = 'guide-step-pill';
    badge.textContent = stepIndex + 1 && totalSteps ? `Step ${stepIndex + 1}/${totalSteps}` : 'Next';
    target.appendChild(badge);
    highlightedBadgeRef.current = badge;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightedRef.current = target;

    highlightClickHandlerRef.current = () => {
      if (!autoAdvanceGuide) return;
      const flow = guidedFlowRef.current;
      const currentIndex = guidedStepIndexRef.current;
      if (!flow?.steps?.length) return;

      if (highlightedBadgeRef.current) {
        highlightedBadgeRef.current.textContent = 'DONE';
        highlightedBadgeRef.current.classList.add('done');
      }

      if (currentIndex >= flow.steps.length - 1) {
        setGuideNotice('Guide complete. Need more help?');
        clickAdvanceTimerRef.current = window.setTimeout(() => clearGuideHighlight(), 700) as any;
        return;
      }

      clickAdvanceTimerRef.current = window.setTimeout(() => {
        autoAdvancePendingRef.current = true;
        setGuidedStepIndex(currentIndex + 1);
        setGuideNotice(`Next: ${flow.steps[currentIndex + 1]?.label || 'continue'}`);
      }, 340) as any;
    };

    target.addEventListener('click', highlightClickHandlerRef.current);
    highlightTimerRef.current = window.setTimeout(() => clearGuideHighlight(), 5000) as any;
    setGuideNotice('Target highlighted.');
    return true;
  };

  const runGuideStep = (step: any) => {
    if (!step) return;
    const flow = guidedFlowRef.current;
    const totalSteps = flow?.steps?.length || 0;
    const safePath = isSafeInternalPath(step.path) ? step.path : '';
    
    if (safePath && pathname !== safePath) {
      setPendingGuideStep(step);
      router.push(safePath);
      return;
    }

    applyGuideHighlight(step.targetId, guidedStepIndexRef.current, totalSteps);
  };

  useEffect(() => {
    if (!autoAdvancePendingRef.current) return;
    autoAdvancePendingRef.current = false;
    const step = guidedFlowRef.current?.steps?.[guidedStepIndexRef.current];
    if (step) setTimeout(() => runGuideStep(step), 220);
  }, [guidedStepIndex]);

  useEffect(() => {
    if (!pendingGuideStep) return;
    if (pendingGuideStep.path && pendingGuideStep.path !== pathname) return;
    setTimeout(() => {
      applyGuideHighlight(pendingGuideStep.targetId, guidedStepIndexRef.current, guidedFlowRef.current?.steps?.length || 0);
      setPendingGuideStep(null);
    }, 220);
  }, [pathname, pendingGuideStep]);

  return (
    <div ref={shellRef} className={`fixed bottom-6 right-6 z-[9999] flex flex-col items-end pointer-events-none`}>
      {/* FAB */}
      <button
        className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-full bg-[#131B32] border border-blue-500/20 shadow-2xl transition-all hover:scale-105 active:scale-95 ${isOpen ? 'opacity-0 scale-90' : 'opacity-100'}`}
        onClick={() => setIsOpen(true)}
      >
        <CRDTMascot size={32} />
        <span className="text-sm font-bold text-white tracking-wide">CRDT AI</span>
        {hasUnreadHint && <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse" />}
      </button>

      {/* AI Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`pointer-events-auto flex flex-col w-[380px] ${shouldExpand ? 'h-[600px]' : 'h-[500px]'} bg-[#0A0E1A]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-3xl overflow-hidden`}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
              <div className="flex items-center gap-3">
                <CRDTMascot size={28} />
                <div>
                  <h3 className="text-sm font-bold text-white">CRDT AI</h3>
                  <p className="text-[10px] text-gray-400 font-medium">Risk & Liquidity Assistant</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={threadRef}>
              {!messages.length && (
                <p className="text-xs text-center text-gray-500 py-8 px-4">
                  Ask me about DPV valuations, LTV caps, unlock safety, or how to use the protocol.
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === 'assistant' ? 'items-start' : 'items-end'}`}>
                  <span className="text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">
                    {m.role === 'assistant' ? 'Assistant' : 'You'}
                  </span>
                  <div className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed ${m.role === 'assistant' ? 'bg-white/5 text-gray-200 border border-white/5' : 'bg-blue-600 text-white'}`}>
                    {m.content}
                  </div>
                </div>
              ))}

              {status === 'thinking' && (
                <div className="flex items-center gap-2 text-xs text-gray-500 animate-pulse">
                  <span>Analyzing protocol state...</span>
                </div>
              )}

              {/* Actions & Previews */}
              {actions?.map((action, i) => {
                if (action.type === 'risk_sim') {
                   const stats = action.data?.stats || {};
                   const paths = buildRiskPaths(stats);
                   return (
                     <div key={i} className="w-full">
                       <Suspense fallback={<div className="h-40 bg-white/5 animate-pulse rounded-lg" />}>
                         <ValuationPreview3D paths={paths} />
                       </Suspense>
                     </div>
                   );
                }
                return null;
              })}

              {guidedFlow && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                    <span>Guided Flow</span>
                    <span>Step {guidedStepIndex + 1}/{guidedFlow.steps.length}</span>
                  </div>
                  <p className="text-xs text-gray-300 font-medium">
                    {guidedFlow.steps[guidedStepIndex]?.label}
                  </p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => runGuideStep(guidedFlow.steps[guidedStepIndex])}
                      className="text-[10px] font-bold px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                    >
                      Highlight Next Action
                    </button>
                    <button 
                      onClick={() => handleNewThread()}
                      className="text-[10px] font-bold px-3 py-1.5 bg-white/5 text-gray-400 rounded-lg hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Input Overlay for Captcha */}
            {turnstileSiteKey && !captchaToken && (
               <div className="p-4 border-t border-white/5 bg-black/40">
                 <p className="text-[10px] text-gray-500 mb-2 font-bold uppercase tracking-widest text-center">Verify Identity</p>
                 <TurnstileWidget 
                    key={captchaKey}
                    siteKey={turnstileSiteKey} 
                    onVerify={setCaptchaToken} 
                    theme="dark"
                    size="flexible"
                    action="chat"
                 />
               </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-white/5 bg-white/5">
              <div className="relative">
                <input
                  ref={inputRef}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 transition-all"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                  placeholder="Ask about rewards or risk..."
                  disabled={status === 'thinking' || (!captchaReady && !!turnstileSiteKey)}
                />
                <button 
                  onClick={() => handleQuery()}
                  disabled={!query.trim() || status === 'thinking' || (!captchaReady && !!turnstileSiteKey)}
                  className="absolute right-2 top-1.5 p-1.5 text-blue-500 hover:text-blue-400 disabled:text-gray-700"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
