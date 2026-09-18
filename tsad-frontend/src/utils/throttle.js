// Trailing-edge throttle: calls `fn` immediately if enough time has passed
// since the last call, otherwise schedules exactly one call for when the
// interval elapses (so the final update in a burst is never dropped).
export function throttleTrailing(fn, intervalMs) {
  let lastCall = 0;
  let timeoutId = null;
  let pendingArgs = null;

  const invoke = (args) => {
    lastCall = Date.now();
    fn(...args);
  };

  return (...args) => {
    const remaining = intervalMs - (Date.now() - lastCall);
    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      invoke(args);
    } else {
      pendingArgs = args;
      if (!timeoutId) {
        timeoutId = setTimeout(() => {
          timeoutId = null;
          invoke(pendingArgs);
        }, remaining);
      }
    }
  };
}
