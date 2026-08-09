import { useEffect, useState } from 'react';

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
}

/**
 * A timestamp that advances once a second while `enabled`.
 *
 * Reading Date.now() during render is impure — the same render would produce a
 * different tree depending on when React happened to run it — so the clock has
 * to come through state. The interval is the only writer; there is deliberately
 * no synchronous resync when `enabled` flips, which means the value can be up to
 * one second stale on re-focus. That is invisible for the two things this drives
 * (a countdown and an "updated Ns ago" label) and keeps the effect a pure
 * subscription.
 */
export function useNow(enabled: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);

  return now;
}

function split(remaining: number): Countdown {
  const total = Math.floor(Math.max(0, remaining) / 1000);

  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor(total / 3_600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
    isPast: remaining <= 0,
  };
}

/**
 * Ticks toward `target` (epoch ms). `enabled` is driven by screen focus so the
 * interval stops behind other tabs.
 */
export function useCountdown(target: number | null, enabled: boolean): Countdown | null {
  const usable = target != null && Number.isFinite(target);
  const now = useNow(enabled && usable);

  if (!usable) return null;

  return split(target - now);
}
