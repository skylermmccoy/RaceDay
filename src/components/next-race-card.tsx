import { StyleSheet, View } from 'react-native';

import type { UpcomingRace } from '@/backend/live-race';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useCountdown } from '@/hooks/use-countdown';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The upcoming race and how long until the green flag.
 *
 * When the start time was inferred from race_date rather than the schedule feed
 * it can be an hour out, so the seconds are dropped and the card says so — a
 * ticking second-hand implies a precision we do not have.
 */
export function NextRaceCard({ race, focused }: { race: UpcomingRace; focused: boolean }) {
  const countdown = useCountdown(race.startsAt, focused && race.startIsExact);
  const startsAt = Number.isFinite(race.startsAt) ? new Date(race.startsAt) : null;

  const meta = [
    race.seriesLabel,
    race.scheduledLaps > 0 ? `${race.scheduledLaps} laps` : null,
    race.tv,
  ].filter(Boolean) as string[];

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
        Next race
      </ThemedText>

      <ThemedText numberOfLines={2}>{race.name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {race.trackName}
      </ThemedText>

      {countdown ? (
        <View style={styles.countdownRow}>
          <ThemedText style={styles.countdown}>
            {countdown.days > 0 ? `${countdown.days}d ` : ''}
            {pad(countdown.hours)}:{pad(countdown.minutes)}:{pad(countdown.seconds)}
          </ThemedText>
        </View>
      ) : null}

      {startsAt ? (
        <ThemedText type="small" themeColor="textSecondary">
          {startsAt.toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
          {race.startIsExact ? '' : ' · start time approximate'}
        </ThemedText>
      ) : null}

      {meta.length ? (
        <ThemedText type="small" themeColor="textSecondary">
          {meta.join(' · ')}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  countdownRow: {
    marginTop: Spacing.one,
  },
  countdown: {
    fontFamily: Fonts.display,
    fontSize: 40,
    lineHeight: 44,
  },
});
