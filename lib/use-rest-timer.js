"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { remainingSeconds } from "@/lib/rest-timer.mjs";

export function useRestTimer(key, onEnd) {
  const [deadline, setDeadline] = useState(0), [rest, setRest] = useState(0);
  const callback = useRef(onEnd); callback.current = onEnd;
  const storageKey = `pv_rest_${key}`;
  useEffect(() => { try { const d = Number(sessionStorage.getItem(storageKey)) || 0; setDeadline(d); setRest(remainingSeconds(d)); } catch {} }, [storageKey]);
  const start = useCallback((seconds) => {
    const d = seconds > 0 ? Date.now() + seconds * 1000 : 0;
    try { sessionStorage.setItem(storageKey, String(d)); } catch {}
    setDeadline(d); setRest(remainingSeconds(d));
  }, [storageKey]);
  useEffect(() => {
    if (!deadline) return;
    let ended = false;
    const tick = () => {
      const seconds = remainingSeconds(deadline); setRest(seconds);
      if (!seconds && !ended) { ended = true; start(0); callback.current(); }
    };
    tick();
    const timer = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [deadline, start]);
  return [rest, start];
}
