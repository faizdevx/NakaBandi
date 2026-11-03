import { useEffect, useRef } from "react";

/** Runs on an interval while the tab is visible, and at once on return if a run is overdue. Hidden tabs spend no quota. */
export function useLive(run: () => void, ms: number, enabled = true) {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    const tick = () => {
      if (document.hidden || Date.now() - last < ms) return;
      last = Date.now();
      latest.current();
    };
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms, enabled]);
}
