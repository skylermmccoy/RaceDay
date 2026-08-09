import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';


import { BrandHero } from '@/components/brand-hero';
import { SeriesPicker } from '@/components/series-picker';
import { StandingRow } from '@/components/standing-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { driverstandings, Series, type DriverStanding, type SeriesKey } from '@/backend/drivers';

export default function HomeScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const [series, setSeries] = useState<SeriesKey>('cup');
  // Tag the result with the series it belongs to. Deriving from that tag means
  // a stale response can never paint under the wrong heading, and there is no
  // synchronous reset in the effect body to trigger a cascading render.
  const [result, setResult] = useState<{
    series: SeriesKey;
    rows?: DriverStanding[];
    error?: string;
  } | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  const current = result?.series === series ? result : null;
  const standings = current?.rows ?? [];
  const error = current?.error ?? null;
  const loading = current === null;

  // The tab bar floats above the content, so the room it needs belongs to the
  // scrolled content — not the container. Same approach as watch.tsx.
  const listBottomInset = safeAreaInsets.bottom + BottomTabInset + Spacing.three;

  const toResult = (series: SeriesKey, rows: DriverStanding[]) => ({ series, rows });
  const toError = (series: SeriesKey, err: unknown) => ({
    series,
    error: err instanceof Error ? err.message : 'Could not load standings',
  });

  // Tabs stay mounted when you navigate away, so a plain useEffect would only
  // ever fire once. useFocusEffect re-runs each time this tab is shown, which is
  // what keeps the standings from going stale.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      driverstandings(Series[series])
        .then((rows) => {
          if (!cancelled) setResult(toResult(series, rows));
        })
        .catch((err: unknown) => {
          if (!cancelled) setResult(toError(series, err));
        });

      return () => {
        cancelled = true;
      };
    }, [series])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setResult(toResult(series, await driverstandings(Series[series])));
    } catch (err) {
      setResult(toError(series, err));
    } finally {
      setRefreshing(false);
    }
  }, [series]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Fixed header — only the list below it scrolls. */}
        <BrandHero />

        <ThemedView style={styles.listHeader}>
          <ThemedText type="subtitle">Standings</ThemedText>
        </ThemedView>

        <SeriesPicker value={series} onChange={setSeries} />

        <ThemedView style={styles.listContainer}>
          {loading ? <ActivityIndicator /> : null}
          {error ? <ThemedText type="small">{error}</ThemedText> : null}

          <FlatList
            data={standings}
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
  },
  listContainer: {
    flex: 1,
    alignSelf: 'stretch',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  code: {
    textTransform: 'uppercase',
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
});
