"use client";

import { useEffect, useState } from "react";

function secondsUntil(until: number | null): number {
  return until === null ? 0 : Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

/** Whole seconds until `until` (epoch ms), never below 0; ticks every second; null → 0. */
export function useCountdown(until: number | null): number {
  const [seconds, setSeconds] = useState(() => secondsUntil(until));
  const [tracked, setTracked] = useState(until);
  if (tracked !== until) {
    // A new deadline: recompute during render instead of waiting for the next tick.
    setTracked(until);
    setSeconds(secondsUntil(until));
  }
  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => setSeconds(secondsUntil(until)), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return seconds;
}
