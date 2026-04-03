'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile: any;
  }
}

let turnstileScriptPromise: Promise<any> | null = null;

function loadTurnstileScript() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScriptPromise) return turnstileScriptPromise;
  
  turnstileScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => reject(new Error('Failed to load Turnstile'));
    document.head.appendChild(script);
  });
  
  return turnstileScriptPromise;
}

interface TurnstileWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (error: Error) => void;
  action?: string;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'flexible' | 'compact';
  tabIndex?: number;
}

export default function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
  onError,
  action = 'submit',
  theme = 'auto',
  size = 'normal',
  tabIndex = 0
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return undefined;
    let cancelled = false;

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !turnstile || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme,
          size,
          tabindex: tabIndex,
          callback: onVerify,
          'expired-callback': onExpire,
          'error-callback': onError
        });
      })
      .catch((error) => {
        if (onError) onError(error);
      });

    return () => {
      cancelled = true;
      if (window.turnstile && widgetIdRef.current !== null) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [siteKey, action, theme, size, tabIndex, onVerify, onExpire, onError]);

  return <div className="turnstile-widget" ref={containerRef} />;
}
