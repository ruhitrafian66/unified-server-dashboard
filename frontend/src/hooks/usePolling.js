import { useEffect, useRef } from 'react';

/**
 * Call `fn` now and then every `intervalMs`, but only while the page is
 * visible. When the tab/PWA comes back to the foreground it refreshes at once.
 * Saves battery on phones and load on the server.
 */
export default function usePolling(fn, intervalMs, { enabled = true } = {}) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;

    const tick = () => fnRef.current();
    const start = () => {
      if (timer) return;
      tick();
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled]);
}
