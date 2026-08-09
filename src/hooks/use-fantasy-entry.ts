import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import {
  bankEntry,
  EmptyCareer,
  entryPhase,
  MaxPicks,
  type CareerRecord,
  type FantasyEntry,
} from '@/backend/fantasy';
import { fetchRaceFeed, type LiveRace, type NextRaces } from '@/backend/live-race';
import { SeriesKeys, type SeriesKey } from '@/backend/nascar-api';

const CareerKey = 'raceday.fantasy.career.v1';
const PendingKey = 'raceday.fantasy.pending.v1';
const entryKey = (raceId: number) => `raceday.fantasy.entry.v1.${raceId}`;

// Shared so the pre-load value keeps a stable identity — a fresh [] each render
// would change the callbacks' dependencies on every pass.
const NoPicks: string[] = [];

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;

  try {
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    // Corrupt storage should cost the user their entry, not the screen.
    return fallback;
  }
}

function samePicks(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Entries for every series' next race, plus the all-time score.
 *
 * Each series has its own upcoming race and its own entry, so all three can be
 * open at once; `series` only selects which one this call is about. Entries are
 * keyed by raceId throughout, which is what lets the career total and the
 * settle-up logic stay series-agnostic.
 *
 * The draft is deliberately not persisted on every tap — only `submit` writes.
 * That is what makes the button mean something, and it removes any chance of an
 * empty initial value overwriting a stored entry before the read lands.
 */
export function useFantasyEntry(
  upcoming: NextRaces | null,
  series: SeriesKey,
  race: LiveRace | null
) {
  const [career, setCareer] = useState<CareerRecord | null>(null);
  const [entries, setEntries] = useState<Record<number, FantasyEntry> | null>(null);
  const [draft, setDraft] = useState<{ raceId: number; picks: string[] } | null>(null);

  const selected = upcoming?.[series] ?? null;
  // A stable dependency for the load effect: the object identity changes on
  // every fetch, but the race ids rarely do.
  const raceIds = upcoming ? SeriesKeys.map((key) => upcoming[key]?.raceId ?? 0).join(',') : '';

  // Career + settle up anything that finished while the app was closed.
  useEffect(() => {
    let cancelled = false;

    const settle = async () => {
      let record = parse<CareerRecord>(await AsyncStorage.getItem(CareerKey), EmptyCareer);
      const pending = parse<number[]>(await AsyncStorage.getItem(PendingKey), []);
      const stillPending: number[] = [];

      for (const raceId of pending) {
        const entry = parse<FantasyEntry | null>(await AsyncStorage.getItem(entryKey(raceId)), null);
        if (!entry) continue;

        try {
          const finished = await fetchRaceFeed(entry.seriesId, entry.raceId);

          if (finished.flag === 'finished') {
            record = bankEntry(record, entry, finished);
          } else {
            stillPending.push(raceId);
          }
        } catch {
          // Network trouble — leave it pending and try again next launch.
          stillPending.push(raceId);
        }
      }

      if (stillPending.length !== pending.length) {
        await AsyncStorage.multiSet([
          [CareerKey, JSON.stringify(record)],
          [PendingKey, JSON.stringify(stillPending)],
        ]);
      }

      return record;
    };

    settle()
      .then((record) => {
        if (!cancelled) setCareer(record);
      })
      .catch(() => {
        if (!cancelled) setCareer(EmptyCareer);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Every series' entry in one read, so the picker can show what's already in.
  useEffect(() => {
    const ids = raceIds
      .split(',')
      .map(Number)
      .filter((id) => id > 0);

    let cancelled = false;

    AsyncStorage.multiGet(ids.map(entryKey))
      .then((pairs) => {
        if (cancelled) return;

        const loaded: Record<number, FantasyEntry> = {};
        for (const [, raw] of pairs) {
          const entry = parse<FantasyEntry | null>(raw, null);
          if (entry) loaded[entry.raceId] = entry;
        }

        setEntries(loaded);
      })
      .catch(() => {
        if (!cancelled) setEntries({});
      });

    return () => {
      cancelled = true;
    };
  }, [raceIds]);

  const entry = selected ? (entries?.[selected.raceId] ?? null) : null;
  // The draft only exists once the user has touched something; until then the
  // selection is whatever was submitted.
  const picks =
    draft && selected && draft.raceId === selected.raceId ? draft.picks : (entry?.picks ?? NoPicks);

  const ready = career !== null && entries !== null;
  const phase = entryPhase(entry, race, selected?.startsAt ?? null, career ?? EmptyCareer);
  const dirty = entry ? !samePicks(entry.picks, picks) : picks.length > 0;

  /** Series whose next race already has a submitted entry. */
  const submittedSeries = SeriesKeys.filter((key) => {
    const raceId = upcoming?.[key]?.raceId;
    return raceId != null && entries?.[raceId] != null;
  });

  const togglePick = useCallback(
    (id: string) => {
      if (phase !== 'open' || !selected) return;

      const raceId = selected.raceId;
      const currentPicks = picks;

      const next = currentPicks.includes(id)
        ? currentPicks.filter((pick) => pick !== id)
        : // At the cap, ignore the tap rather than evicting an earlier pick.
          currentPicks.length >= MaxPicks
          ? currentPicks
          : [...currentPicks, id];

      if (next === currentPicks) return;

      setDraft({ raceId, picks: next });
    },
    [phase, selected, picks]
  );

  const submit = useCallback(() => {
    if (!selected || phase !== 'open' || picks.length !== MaxPicks) return;

    const submitted: FantasyEntry = {
      raceId: selected.raceId,
      seriesId: selected.seriesId,
      raceName: selected.name,
      picks,
      submittedAt: Date.now(),
    };

    setEntries((current) => ({ ...(current ?? {}), [submitted.raceId]: submitted }));
    setDraft(null);

    void (async () => {
      const pending = parse<number[]>(await AsyncStorage.getItem(PendingKey), []);
      // Re-submitting rewrites the entry in place, so the pending list must not
      // gain a duplicate each time.
      const withThis = pending.includes(submitted.raceId)
        ? pending
        : [...pending, submitted.raceId];

      await AsyncStorage.multiSet([
        [entryKey(submitted.raceId), JSON.stringify(submitted)],
        [PendingKey, JSON.stringify(withThis)],
      ]);
    })().catch(() => {
      // A failed write costs persistence only; the entry stands for this session.
    });
  }, [selected, phase, picks]);

  return {
    race: selected,
    entry,
    picks,
    phase,
    dirty,
    career: career ?? EmptyCareer,
    submittedSeries,
    ready,
    togglePick,
    submit,
  };
}
