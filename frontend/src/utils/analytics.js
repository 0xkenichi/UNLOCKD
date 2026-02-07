export function trackEvent(event, payload = {}) {
  if (!event) return;
  const body = {
    event,
    payload,
    ts: Date.now()
  };
  try {
    if (navigator?.sendBeacon) {
      const blob = new Blob([JSON.stringify(body)], {
        type: 'application/json'
      });
      navigator.sendBeacon('/api/analytics', blob);
    }
  } catch (error) {
    console.warn('Analytics beacon failed', error);
  }
  if (import.meta.env.DEV) {
    console.info('[analytics]', event, payload);
  }
}
