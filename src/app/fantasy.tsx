import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { driverstandings, type DriverStanding } from '@/backend/drivers';
import { MaxPicks, scorePicks } from '@/backend/fantasy';
import { fetchNextRaces, type LiveRace, type NextRaces } from '@/backend/live-race';
import { Series, type SeriesKey } from '@/backend/nascar-api';
import { BrandHero } from '@/components/brand-hero';
import { NextRaceCard } from '@/components/next-race-card';
import { PickScoreboard } from '@/components/pick-scoreboard';
import { SeriesPicker } from '@/components/series-picker';
import { StandingRow } from '@/components/standing-row';
import { SubmitPicksButton } from '@/components/submit-picks-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useFantasyEntry } from '@/hooks/use-fantasy-entry';
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

export default function FantasyScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const [seriesKey, setSeriesKey] = useState<SeriesKey>('cup');
  const [upcoming, setUpcoming] = useState<NextRaces | null | undefined>(undefined);
  // Tag the standings with the series they belong to, so a slow response can
  // never paint under a different race's series.
  const [result, setResult] = useState<{
    seriesId: number;
    rows?: DriverStanding[];
    error?: string;
  } | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const { state: liveState } = useLiveRace();
  const race = feedRace(liveState);

  // Every series has its own upcoming race and its own entry, so all three can
  // be open at once; the picker only chooses which one is on screen.
  const {
    race: next,
    entry,
    picks: draft,
    phase,
    dirty,
    career,
    submittedSeries,
    ready,
    togglePick,
    submit,
  } = useFantasyEntry(upcoming ?? null, seriesKey, race);

  const series = Series[seriesKey];

  const current = result?.seriesId === series?.id ? result : null;
  const standings = current?.rows ?? [];
  const error = current?.error ?? null;

  // Once the entry is locked, show it scoring against the race on track;
  // otherwise this screen is about picking for what's next.
  const scoringRace = phase !== 'open' && race?.raceId === entry?.raceId ? race : null;
  const board = scorePicks(draft, standings, scoringRace, entry?.seriesId ?? series.id);
  const isFull = draft.length >= MaxPicks;
  const loading = upcoming === undefined || current === null || !ready;

  const listBottomInset = safeAreaInsets.bottom + BottomTabInset + Spacing.three;

  // Tabs stay mounted, so a plain useEffect would only ever fire once.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      fetchNextRaces()
        .then((races) => {
          if (!cancelled) setUpcoming(races);
        })
        .catch(() => {
          if (!cancelled) setUpcoming(null);
        });

      return () => {
        cancelled = true;
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const seriesId = series.id;

      driverstandings(series)
        .then((rows) => {
          if (!cancelled) setResult({ seriesId, rows });
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setResult({
              seriesId,
              error: err instanceof Error ? err.message : 'Could not load standings',
            });
          }
        });

      return () => {
        cancelled = true;
      };
    }, [series])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setResult({ seriesId: series.id, rows: await driverstandings(series) });
    } catch (err) {
      setResult({
        seriesId: series.id,
        error: err instanceof Error ? err.message : 'Could not load standings',
      });
    } finally {
      setRefreshing(false);
    }
  }, [series]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Fixed header — only the list below it scrolls. */}
        <BrandHero />

        <View style={styles.listHeader}>
          <View style={styles.headerText}>
            <ThemedText type="subtitle">Total points</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {Object.keys(career.races).length
                ? `${Object.keys(career.races).length} races scored`
                : 'Enter a race to start scoring'}
            </ThemedText>
          </View>

          <ThemedText style={styles.total} themeColor="positive">
            {career.total}
          </ThemedText>
        </View>

        {/* Each series has its own next race, so all three entries can be open
            at once. A tick marks the ones already submitted. */}
        <SeriesPicker value={seriesKey} onChange={setSeriesKey} done={submittedSeries} />

        {/* Pinned rather than living in the list header: this screen re-renders
            on every live poll, and an inline ListHeaderComponent element would
            be rebuilt — and the countdown remounted — each time. */}
        {scoringRace ? (
          <PickScoreboard
            board={board}
            race={scoringRace}
            seriesLabel={series.label}
            emptyHint="No picks were submitted for this race."
          />
        ) : next ? (
          <NextRaceCard race={next} focused />
        ) : null}

        {next ? (
          <SubmitPicksButton
            phase={phase}
            picked={draft.length}
            dirty={dirty}
            onSubmit={submit}
          />
        ) : null}

        <ThemedView style={styles.listContainer}>
          {loading ? <ActivityIndicator /> : null}
          {error ? <ThemedText type="small">{error}</ThemedText> : null}
          {upcoming && !next ? (
            <ThemedText type="small" themeColor="textSecondary">
              No upcoming {series.label} races scheduled.
            </ThemedText>
          ) : null}

          <FlatList
            data={standings}
            // Picks and score both live outside the row data.
            extraData={board}
            renderItem={({ item }) => {
              const isSelected = draft.includes(item.id);
              // At the cap, everyone not already picked is out of reach until a
              // pick is given back. Once locked, nothing is selectable.
              const isUnavailable = phase !== 'open' || (isFull && !isSelected);

              return (
                <Pressable
                  onPress={() => togglePick(item.id)}
                  disabled={isUnavailable || !ready}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: isUnavailable }}>
                  <ThemedView
                    type={isSelected ? 'backgroundSelected' : 'background'}
                    style={[styles.row, isUnavailable && !isSelected && styles.unavailable]}>
                    <StandingRow standing={item} />
                  </ThemedView>
                </Pressable>
              );
            }}
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
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
  },
  listHeader: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  total: {
    fontFamily: Fonts.display,
    fontSize: 44,
    lineHeight: 46,
  },
  listContainer: {
    flex: 1,
    alignSelf: 'stretch',
  },
  row: {
    // Pulled out to the screen's gutter so the selected fill reads as a band
    // across the row rather than a floating box.
    marginHorizontal: -Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  unavailable: {
    opacity: 0.4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
