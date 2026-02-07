import { useEffect, useRef } from 'react';

let turnstileScriptPromise = null;

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

export default function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
  onError,
  action = 'submit',
  theme = 'auto',
  size = 'normal',
  tabIndex = 0
}) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

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
