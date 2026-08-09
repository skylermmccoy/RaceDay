import { StyleSheet, View } from 'react-native';

import { formatGap, formatLapTime, type LiveEntry, type RunType } from '@/backend/live-race';
import { CarNumberBadge } from '@/components/car-number-badge';
import { ManufacturerBadge } from '@/components/manufacturer-badge';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';

/**
 * One car in the running order.
 *
 * A sibling of StandingRow rather than a variant of it: the right-hand column is
 * a gap that switches between seconds and whole laps, the position carries a
 * gain/loss caret, and retired cars dim out — none of which the points table has.
 *
 * Practice and qualifying have no meaningful gap-to-leader, so those sessions
 * show the best lap instead.
 */
export function LiveRow({ entry, runType }: { entry: LiveEntry; runType: RunType }) {
  const isPodium = entry.position <= 3;
  const isTimedSession = runType === 'practice' || runType === 'qualifying';
  const gained = entry.positionsGained;

  return (
    <View style={[styles.row, entry.isOut && styles.retired]}>
      <View style={styles.positionColumn}>
        <ThemedText
          type="smallBold"
          themeColor={isPodium ? 'podium' : 'textSecondary'}
          style={styles.position}>
          {entry.position}
        </ThemedText>
        {gained !== 0 && !entry.isOut ? (
          <ThemedText
            type="small"
            themeColor={gained > 0 ? 'positive' : 'negative'}
            style={styles.delta}>
            {gained > 0 ? `▲${gained}` : `▼${-gained}`}
          </ThemedText>
        ) : null}
      </View>

      <CarNumberBadge url={entry.carNumberImageUrl} carNumber={entry.carNumber} />

      <View style={styles.details}>
        <ThemedText numberOfLines={1}>{entry.name}</ThemedText>
        <View style={styles.subtitleRow}>
          <ManufacturerBadge manufacturer={entry.manufacturer} badgeUrl={null} />
          {entry.sponsor ? (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              numberOfLines={1}
              style={styles.sponsor}>
              {entry.sponsor}
            </ThemedText>
          ) : null}
        </View>
      </View>

      <View style={styles.timing}>
        <ThemedText type="smallBold" style={styles.gap}>
          {isTimedSession ? formatLapTime(entry.bestLapTime) : formatGap(entry)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {isTimedSession
            ? `${entry.lapsCompleted} laps`
            : formatLapTime(entry.lastLapTime)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  // Retired cars stay in the order — they finished there — but recede.
  retired: {
    opacity: 0.45,
  },
  positionColumn: {
    width: Spacing.five,
    alignItems: 'flex-end',
  },
  position: {
    // Condensed numerals keep the position column narrow and on-brand.
    fontFamily: Fonts.display,
    fontSize: 18,
  },
  delta: {
    fontSize: 11,
    lineHeight: 13,
  },
  details: {
    flex: 1,
    gap: Spacing.half,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  sponsor: {
    flexShrink: 1,
  },
  timing: {
    alignItems: 'flex-end',
    // Fixed so the gaps form a straight column and the name column stops
    // resizing per row. "+1:02.443" is the widest realistic value.
    minWidth: Spacing.six + Spacing.three,
  },
  gap: {
    fontFamily: Fonts.display,
    fontSize: 18,
  },
});
