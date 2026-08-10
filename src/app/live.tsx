import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LiveEntry, LiveRace, RunType } from '@/backend/live-race';
import { BrandHero } from '@/components/brand-hero';
import { LiveHeader } from '@/components/live-header';
import { LiveRow } from '@/components/live-row';
import { NextRaceCard } from '@/components/next-race-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useLiveRace } from '@/hooks/use-live-race';

export default function LiveScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const { state, refreshing, refresh } = useLiveRace();
  const [focused, setFocused] = useState(false);

  // The tab bar floats above the content, so the room it needs belongs to the
  // scrolled content — not the container. Same approach as index.tsx.
  const listBottomInset = safeAreaInsets.bottom + BottomTabInset + Spacing.three;

  // Drives the countdown's interval so it stops ticking behind another tab.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  const renderOrder = (race: LiveRace, runType: RunType) => (
    <FlatList
      data={race.entries}
      renderItem={({ item }: { item: LiveEntry }) => <LiveRow entry={item} runType={runType} />}
      keyExtractor={(item) => item.id}
      refreshing={refreshing}
      onRefresh={refresh}
      initialNumToRender={20}
      contentContainerStyle={{ paddingBottom: listBottomInset }}
      ItemSeparatorComponent={() => (
        <ThemedView type="backgroundElement" style={styles.separator} />
      )}
    />
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Fixed header — only the running order below it scrolls. */}
        <BrandHero />

        {/* No "Live" heading — the flag banner and race name below say it, and
            the tab bar already names the screen. The list needs the room more. */}
        {state.status === 'loading' ? <ActivityIndicator /> : null}

        {state.status === 'error' ? (
          <ThemedView style={styles.centered}>
            <ThemedText type="small">{state.message}</ThemedText>
            <Pressable onPress={refresh} accessibilityRole="button">
              <ThemedText type="linkPrimary">Try again</ThemedText>
            </Pressable>
          </ThemedView>
        ) : null}

        {state.status === 'idle' ? (
          <ThemedView style={styles.listContainer}>
            {state.next ? (
              <NextRaceCard race={state.next} focused={focused} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                No upcoming races scheduled.
              </ThemedText>
            )}

            {state.last ? (
              <>
                <ThemedText type="smallBold" style={styles.sectionLabel}>
                  Last race · {state.last.runName}
                </ThemedText>
                {renderOrder(state.last, state.last.runType)}
              </>
            ) : null}
          </ThemedView>
        ) : null}

        {state.status === 'live' ||
        state.status === 'checkered' ||
        state.status === 'final' ||
        state.status === 'stalled' ? (
          <ThemedView style={styles.listContainer}>
            <LiveHeader race={state.race} status={state.status} focused={focused} />
            {renderOrder(state.race, state.race.runType)}
          </ThemedView>
        ) : null}
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
  listContainer: {
    flex: 1,
    alignSelf: 'stretch',
    gap: Spacing.three,
  },
  centered: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
