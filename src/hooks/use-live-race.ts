import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  classifyLiveRace,
  fetchIdleState,
  fetchLiveRace,
  type ClassifyPrev,
  type LiveRace,
  type LiveStatus,
  type UpcomingRace,
} from '@/backend/live-race';

export type LiveRaceState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'live' | 'checkered' | 'final' | 'stalled'; race: LiveRace }
  | { status: 'idle'; next: UpcomingRace | null; last: LiveRace | null };

/**
 * How long to wait before the next poll, by what we last saw.
 *
 * CloudFront caches the feed for ~30s and an `age` of 27s was observed on a
 * fresh fetch, so polling faster than ~10s returns bytes we already have.
 * Everything that isn't a green-flag race backs well off — those polls are
 * conditional GETs that come back 304 with an empty body.
 */
const PollIntervals: Record<LiveStatus, number> = {
  live: 10_000,
  checkered: 15_000,
  stalled: 15_000,
  final: 60_000,
  idle: 60_000,
};

const ErrorBackoff = [5_000, 10_000, 20_000, 40_000, 60_000];

/**
 * Polls the global live feed and classifies what comes back.
 *
 * All the poller's moving parts live in refs, not state: the schedule must not
 * restart when a tick lands, and React Compiler leaves refs alone, so this stays
 * correct without hand-memoizing anything. The only setState calls are the ones
 * that actually change what is on screen — a 304 updates bookkeeping and
 * reschedules without re-rendering, which is what makes a backgrounded-but-
 * focused tab nearly free.
 */
export function useLiveRace() {
  const [state, setState] = useState<LiveRaceState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const etag = useRef<string | null>(null);
  const prev = useRef<ClassifyPrev>({ lastModified: null, advancedAt: null, status: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const failures = useRef(0);
  const running = useRef(false);
  // The idle payload is a three-feed fan-out, so don't refetch it every minute
  // once we have one — only when the underlying race changes.
  const idleFor = useRef<number | null>(null);

  // Lets schedule() reach the poll defined below it without a forward reference.
  const pollRef = useRef<(force?: boolean) => Promise<void>>(async () => {});

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  // Recursive setTimeout rather than setInterval: a slow response must not let
  // polls pile up on top of each other.
  const schedule = useCallback(
    (status: LiveStatus) => {
      if (!running.current) return;
      clearTimer();
      timer.current = setTimeout(() => void pollRef.current(), PollIntervals[status]);
    },
    [clearTimer]
  );

  const poll = useCallback(
    async (force = false) => {
      if (!running.current) return;

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      try {
        // A forced refresh skips the ETag so the user always gets a real body.
        const result = await fetchLiveRace({
          etag: force ? null : etag.current,
          signal: controller.signal,
        });

        if (!running.current || controller.signal.aborted) return;

        if (result.kind === 'unchanged') {
          failures.current = 0;
          schedule(prev.current.status ?? 'idle');
          return;
        }

        etag.current = result.etag;
        const race = result.race;
        const status = classifyLiveRace(race, prev.current);
        const advanced =
          prev.current.lastModified != null &&
          race.lastModified != null &&
          race.lastModified > prev.current.lastModified;

        prev.current = {
          lastModified: race.lastModified,
          advancedAt: advanced || prev.current.advancedAt == null ? Date.now() : prev.current.advancedAt,
          status,
        };

        failures.current = 0;
        setLastUpdatedAt(race.fetchedAt);

        if (status === 'idle') {
          // Reuse the frozen feed as "last race" when it is itself a finished
          // race — saves the extra round trip in the common between-weekends case.
          if (idleFor.current !== race.raceId) {
            const idle = await fetchIdleState(race, controller.signal);
            if (!running.current || controller.signal.aborted) return;
            idleFor.current = race.raceId;
            setState({ status: 'idle', next: idle.next, last: idle.last });
          }
        } else {
          idleFor.current = null;
          setState({ status, race });
        }

        schedule(status);
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        if (!running.current) return;

        // Keep whatever is already on screen; a dropped poll should not blank a
        // board the user is reading.
        setState(current =>
          current.status === 'loading'
            ? { status: 'error', message: err instanceof Error ? err.message : 'Could not load the live feed' }
            : current
        );

        const wait = ErrorBackoff[Math.min(failures.current, ErrorBackoff.length - 1)];
        failures.current += 1;
        clearTimer();
        timer.current = setTimeout(() => void pollRef.current(), wait);
      }
    },
    [clearTimer, schedule]
  );

  pollRef.current = poll;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await poll(true);
    } finally {
      setRefreshing(false);
    }
  }, [poll]);

  // Tabs stay mounted, so a plain useEffect would only ever start this once —
  // the same reason index.tsx uses useFocusEffect for the standings.
  useFocusEffect(
    useCallback(() => {
      running.current = true;
      void poll();

      const subscription = AppState.addEventListener('change', next => {
        if (next === 'active') {
          // Refresh immediately on resume rather than letting a stale board sit
          // until the next scheduled tick.
          void poll();
        } else {
          clearTimer();
          abort.current?.abort();
        }
      });

      return () => {
        running.current = false;
        clearTimer();
        abort.current?.abort();
        subscription.remove();
      };
    }, [poll, clearTimer])
  );

  return { state, refreshing, refresh, lastUpdatedAt };
}
