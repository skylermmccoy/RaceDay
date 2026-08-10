import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import {
  applySettlement,
  EmptyBankroll,
  finishesFromLiveRace,
  finishesFromResults,
  settleSheet,
  sheetPhase,
  stakeTotal,
  type BankrollRecord,
  type BetSheet,
  type DriverBet,
  type SettledRace,
} from '@/backend/betting';
import { fetchRaceFeed, type LiveRace, type UpcomingRace } from '@/backend/live-race';
import { getRaceResults } from '@/backend/nascar-api';

const BankrollKey = 'raceday.betting.bankroll.v1';
const PendingKey = 'raceday.betting.pending.v1';
const sheetKey = (raceId: number) => `raceday.betting.sheet.v1.${raceId}`;

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;

  try {
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    // Corrupt storage should cost the user their sheet, not the screen.
    return fallback;
  }
}

/** The official classification, falling back to the frozen live feed's order. */
async function finishesFor(sheet: BetSheet, finished: LiveRace) {
  try {
    const results = await getRaceResults(sheet.season, sheet.seriesId, sheet.raceId);
    if (results.length > 0) return finishesFromResults(results);
  } catch {
    // Weekend feed unavailable — the live feed still knows who finished where.
  }

  return finishesFromLiveRace(finished);
}

/**
 * The betting bankroll and the sheet for the upcoming race.
 *
 * Stakes are escrowed: placing a sheet deducts its total from the balance
 * immediately, and settlement pays winning bets back in. That makes
 * "total staked ≤ balance" structural, and it means the pending settle-up on
 * mount only ever adds points.
 *
 * The deck's draft is deliberately not held here — bets only exist once the
 * receipt's "Place bets" writes them, so dismissing the deck mid-swipe costs
 * nothing and an empty initial value can never overwrite a stored sheet.
 */
export function useBetSheet(upcoming: UpcomingRace | null, race: LiveRace | null) {
  const [bankroll, setBankroll] = useState<BankrollRecord | null>(null);
  const [sheets, setSheets] = useState<Record<number, BetSheet> | null>(null);

  // Settle up anything that finished while the app was closed.
  useEffect(() => {
    let cancelled = false;

    const settle = async () => {
      let record = parse<BankrollRecord>(await AsyncStorage.getItem(BankrollKey), EmptyBankroll);
      const pending = parse<number[]>(await AsyncStorage.getItem(PendingKey), []);
      const stillPending: number[] = [];

      for (const raceId of pending) {
        const sheet = parse<BetSheet | null>(await AsyncStorage.getItem(sheetKey(raceId)), null);
        if (!sheet) continue;

        try {
          const finished = await fetchRaceFeed(sheet.seriesId, sheet.raceId);

          if (finished.flag === 'finished') {
            record = applySettlement(record, sheet, settleSheet(sheet, await finishesFor(sheet, finished)));
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
          [BankrollKey, JSON.stringify(record)],
          [PendingKey, JSON.stringify(stillPending)],
        ]);
      }

      return record;
    };

    settle()
      .then((record) => {
        if (!cancelled) setBankroll(record);
      })
      .catch(() => {
        if (!cancelled) setBankroll(EmptyBankroll);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The upcoming race's stored sheet, if one was placed. With no upcoming race
  // there is nothing to load — `ready` treats that case as loaded.
  const upcomingRaceId = upcoming?.raceId ?? 0;
  useEffect(() => {
    if (!upcomingRaceId) return;

    let cancelled = false;

    AsyncStorage.getItem(sheetKey(upcomingRaceId))
      .then((raw) => {
        if (cancelled) return;
        const sheet = parse<BetSheet | null>(raw, null);
        setSheets(sheet ? { [sheet.raceId]: sheet } : {});
      })
      .catch(() => {
        if (!cancelled) setSheets({});
      });

    return () => {
      cancelled = true;
    };
  }, [upcomingRaceId]);

  const sheet = upcoming ? (sheets?.[upcoming.raceId] ?? null) : null;
  const ready = bankroll !== null && (upcomingRaceId === 0 || sheets !== null);
  const record = bankroll ?? EmptyBankroll;
  const phase = sheetPhase(sheet, race, upcoming?.startsAt ?? null, record);

  // The escrow is only "in play" until it resolves into the balance.
  const inPlay = sheet && phase !== 'settled' ? sheet.staked : 0;

  const lastSettled: SettledRace | null = Object.values(record.races).reduce(
    (latest: SettledRace | null, settled) =>
      latest && latest.settledAt >= settled.settledAt ? latest : settled,
    null
  );

  /**
   * Escrow and persist a sheet for the upcoming race. Editing an open sheet
   * refunds its previous escrow before deducting the new one.
   */
  const submitSheet = useCallback(
    (bets: DriverBet[]): boolean => {
      if (!upcoming || phase !== 'open' || bets.length === 0) return false;

      const staked = stakeTotal(bets);
      const current = bankroll ?? EmptyBankroll;
      const available = current.balance + (sheet?.staked ?? 0);
      if (staked <= 0 || staked > available) return false;

      const submitted: BetSheet = {
        raceId: upcoming.raceId,
        seriesId: upcoming.seriesId,
        season: new Date(upcoming.startsAt).getFullYear(),
        raceName: upcoming.name,
        bets,
        staked,
        submittedAt: Date.now(),
      };
      const escrowed: BankrollRecord = { ...current, balance: available - staked };

      setSheets((existing) => ({ ...(existing ?? {}), [submitted.raceId]: submitted }));
      setBankroll(escrowed);

      void (async () => {
        const pending = parse<number[]>(await AsyncStorage.getItem(PendingKey), []);
        // Re-submitting rewrites the sheet in place, so the pending list must
        // not gain a duplicate each time.
        const withThis = pending.includes(submitted.raceId)
          ? pending
          : [...pending, submitted.raceId];

        await AsyncStorage.multiSet([
          [sheetKey(submitted.raceId), JSON.stringify(submitted)],
          [PendingKey, JSON.stringify(withThis)],
          [BankrollKey, JSON.stringify(escrowed)],
        ]);
      })().catch(() => {
        // A failed write costs persistence only; the sheet stands this session.
      });

      return true;
    },
    [upcoming, phase, bankroll, sheet]
  );

  return {
    bankroll: record,
    balance: record.balance,
    inPlay,
    sheet,
    phase,
    ready,
    lastSettled,
    submitSheet,
  };
}
