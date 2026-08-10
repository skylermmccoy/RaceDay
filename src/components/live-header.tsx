import { StyleSheet, View } from 'react-native';

import type { LiveRace, LiveStatus } from '@/backend/live-race';
import { FlagBanner } from '@/components/flag-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-countdown';

function agoLabel(at: number | null, now: number): string | null {
  if (at == null) return null;

  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `updated ${seconds}s ago`;

  return `updated ${Math.round(seconds / 60)}m ago`;
}

/**
 * Flag state, where we are in the race, and how stale the board is.
 *
 * Practice and qualifying report laps_in_race: 0, so the lap counter and stage
 * chip are hidden for them rather than rendering "LAP 12 / 0".
 */
export function LiveHeader({
  race,
  status,
  focused,
}: {
  race: LiveRace;
  status: LiveStatus;
  focused: boolean;
}) {
  // Ticks the "updated Ns ago" label, and only while this tab is on screen.
  const now = useNow(focused);
  const isRace = race.runType === 'race' && race.lapsInRace > 0;
  const ago = agoLabel(race.lastModified, now);

  // Track name rides the meta line rather than a line of its own — the header
  // is pinned above the running order, so every line it takes is one the list
  // loses.
  const stats = [
    race.trackName,
    race.cautions > 0 ? `${race.cautions} cautions` : null,
    race.leadChanges > 0 ? `${race.leadChanges} lead changes` : null,
    ago,
  ].filter(Boolean) as string[];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.topRow}>
        <FlagBanner flag={race.flag} status={status} runType={race.runType} />
        {race.seriesLabel ? (
          <ThemedText type="small" themeColor="textSecondary">
            {race.seriesLabel}
          </ThemedText>
        ) : null}
      </View>

      <ThemedText type="smallBold" numberOfLines={1}>
        {race.runName}
      </ThemedText>

      {isRace ? (
        <View style={styles.lapRow}>
          <ThemedText style={styles.lapCount}>
            {race.lapNumber} / {race.lapsInRace}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.lapMeta}>
            {race.lapsToGo} to go
            {race.stage ? ` · Stage ${race.stage.number} ends L${race.stage.finishAtLap}` : ''}
          </ThemedText>
        </View>
      ) : null}

      {stats.length ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {stats.join(' · ')}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    gap: Spacing.half,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  lapRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  lapCount: {
    fontFamily: Fonts.display,
    fontSize: 20,
    lineHeight: 22,
  },
  lapMeta: {
    flex: 1,
  },
});
