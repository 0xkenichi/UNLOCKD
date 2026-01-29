import { useEffect, useState } from 'react';

export default function useIdleMount({ timeout = 1200 } = {}) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const enable = () => {
      if (!isCancelled) {
        setIsReady(true);
      }
    };

    if (typeof window === 'undefined') {
      enable();
      return () => {};
    }

    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(enable, { timeout });
      return () => {
        isCancelled = true;
        window.cancelIdleCallback(handle);
      };
    }

    const handle = window.setTimeout(enable, timeout);
    return () => {
      isCancelled = true;
      window.clearTimeout(handle);
    };
  }, [timeout]);

  return isReady;
}
