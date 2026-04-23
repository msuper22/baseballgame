const activePolls = new Set();

export function startPolling(fn, intervalMs = 8000) {
  let stopped = false;
  let timer = null;

  const tick = async () => {
    if (stopped) return;
    if (document.visibilityState === 'hidden') {
      timer = setTimeout(tick, intervalMs);
      return;
    }
    try { await fn(); } catch (e) { /* swallow — next tick */ }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };

  timer = setTimeout(tick, intervalMs);

  const handle = {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      activePolls.delete(handle);
    },
  };
  activePolls.add(handle);
  return handle;
}

export function stopAllPolling() {
  for (const h of Array.from(activePolls)) h.stop();
}
