import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { driverstandings, recentFinishes, type DriverStanding, type RecentForm } from '@/backend/drivers';
import { fetchNextRaces, type LiveRace, type UpcomingRace } from '@/backend/live-race';
import { Series } from '@/backend/nascar-api';
import { BankrollHeader } from '@/components/betting/bankroll-header';
import { BetDeckOverlay } from '@/components/betting/bet-deck-overlay';
import { BetReceipt } from '@/components/betting/bet-receipt';
import { BetScoreboard } from '@/components/betting/bet-scoreboard';
import { BrandHero } from '@/components/brand-hero';
import { NextRaceCard } from '@/components/next-race-card';
import { StandingRow } from '@/components/standing-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Casino, Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useBetSheet } from '@/hooks/use-bet-sheet';
import { useLiveRace } from '@/hooks/use-live-race';

/** Whatever race the global live feed is currently serving, if any. */
function feedRace(state: ReturnType<typeof useLiveRace>['state']): LiveRace | null {
  switch (state.status) {
    case 'live':
    case 'checkered':
    case 'final':
    case 'stalled':
      return state.race;
    case 'idle':
      return state.last;
    default:
      return null;
  }
}

/**
 * The betting game is Cup-only — one card per driver in the deck, and three
 * parallel sheets would triple every screen state for little payoff.
 */
export default function FantasyScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const [upcoming, setUpcoming] = useState<UpcomingRace | null | undefined>(undefined);
  const [standings, setStandings] = useState<DriverStanding[] | null>(null);
  const [form, setForm] = useState<RecentForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);

  const { state: liveState } = useLiveRace();
  const race = feedRace(liveState);

  const { bankroll, balance, inPlay, sheet, phase, ready, lastSettled, submitSheet } = useBetSheet(
    upcoming ?? null,
    race
  );

  const loading = upcoming === undefined || standings === null || !ready;
  const listBottomInset = safeAreaInsets.bottom + BottomTabInset + Spacing.three;

  const loadStandings = useCallback(async () => {
    try {
      const rows = await driverstandings(Series.cup);
      setStandings(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load standings');
    }
  }, []);

  // Tabs stay mounted, so a plain useEffect would only ever fire once.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      fetchNextRaces()
        .then((races) => {
          if (!cancelled) setUpcoming(races.cup);
        })
        .catch(() => {
          if (!cancelled) setUpcoming(null);
        });

      // The form strip is garnish — it should never block the deck.
      recentFinishes(Series.cup)
        .then((recent) => {
          if (!cancelled) setForm(recent);
        })
        .catch(() => {});

      void loadStandings();

      return () => {
        cancelled = true;
      };
    }, [loadStandings])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadStandings();
    } finally {
      setRefreshing(false);
    }
  }, [loadStandings]);

  const settled = sheet ? (bankroll.races[String(sheet.raceId)] ?? null) : null;
  const canStart = !loading && phase === 'open' && upcoming != null && (standings?.length ?? 0) > 0;

  const ctaLabel = loading
    ? 'Loading…'
    : !upcoming
      ? 'No upcoming race'
      : phase === 'locked'
        ? 'Locked — race under way'
        : phase === 'settled'
          ? `Settled ${settled && settled.net >= 0 ? '+' : ''}${settled?.net ?? ''}`
          : sheet
            ? `Edit bets (${sheet.bets.length} placed)`
            : 'Start sheet';

  // The race the sheet should score against, once it's the one on track.
  const scoringRace = sheet && race?.raceId === sheet.raceId ? race : null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Fixed header — only the list below it scrolls. */}
        <BrandHero />

        <BankrollHeader balance={balance} inPlay={inPlay} lastSettled={lastSettled} />

        <Pressable
          onPress={() => setDeckOpen(true)}
          disabled={!canStart}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canStart }}
          style={({ pressed }) => [
            styles.startButton,
            !canStart && styles.startDisabled,
            pressed && canStart && styles.pressed,
          ]}>
          <ThemedText
            style={[styles.startLabel, canStart && styles.startLabelActive]}
            themeColor={canStart ? undefined : 'textSecondary'}>
            {ctaLabel}
          </ThemedText>
        </Pressable>

        <ThemedView style={styles.listContainer}>
          {loading ? <ActivityIndicator /> : null}
          {error ? <ThemedText type="small">{error}</ThemedText> : null}

          <FlatList
            data={standings ?? []}
            extraData={sheet}
            // Context, not controls: the sheet card and next-race card scroll
            // away so the standings aren't read through a keyhole. Passed as an
            // element — this screen re-renders on every live poll, and an
            // inline component type would remount the countdown each time.
            ListHeaderComponent={
              <View style={styles.listHeaderStack}>
                {upcoming ? <NextRaceCard race={upcoming} focused /> : null}
                {sheet && (phase !== 'open' || settled) ? (
                  <BetScoreboard sheet={sheet} race={scoringRace} settled={settled} />
                ) : sheet ? (
                  <BetReceipt bets={sheet.bets} balanceAfter={balance} />
                ) : null}
                {upcoming === null ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    No upcoming Cup races scheduled.
                  </ThemedText>
                ) : null}
              </View>
            }
            renderItem={({ item }) => <StandingRow standing={item} />}
            keyExtractor={(item) => item.id}
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={{ paddingBottom: listBottomInset }}
            ItemSeparatorComponent={() => (
              <ThemedView type="backgroundElement" style={styles.separator} />
            )}
          />
        </ThemedView>
      </SafeAreaView>

      {upcoming ? (
        <BetDeckOverlay
          visible={deckOpen}
          race={upcoming}
          standings={standings ?? []}
          form={form}
          // Editing refunds the old escrow before the new one is taken.
          availableBalance={balance + (sheet?.staked ?? 0)}
          initialBets={sheet?.bets ?? null}
          onPlace={submitSheet}
          onClose={() => setDeckOpen(false)}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  startButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: Casino.chip,
  },
  startDisabled: {
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.8,
  },
  startLabel: {
    fontFamily: Fonts.display,
    fontSize: 20,
    letterSpacing: 1,
    textTransform: 'uppercase',
    lineHeight: 24,
  },
  startLabelActive: {
    color: Casino.chipText,
  },
  listContainer: {
    flex: 1,
    alignSelf: 'stretch',
  },
  listHeaderStack: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
