import { StyleSheet, View } from 'react-native';

import type { PickScore, ScoreBoard } from '@/backend/fantasy';
import type { LiveRace } from '@/backend/live-race';
import { CarNumberBadge } from '@/components/car-number-badge';
import { FlagBanner } from '@/components/flag-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';

/** Why the picks aren't scoring, in the user's terms rather than the enum's. */
function blockerMessage(board: ScoreBoard, race: LiveRace | null, seriesLabel: string): string {
  switch (board.blocker) {
    case 'series-mismatch':
      return `${race?.seriesLabel || 'Another series'} on track — your ${seriesLabel} picks aren't scoring`;
    case 'not-a-race':
      return `${race?.runName ?? 'This session'} is ${race?.runType ?? 'not a race'} — only races score`;
    case 'no-race':
      return 'Waiting for a race';
    default:
      return '';
  }
}

function PickRow({ pick, scorable }: { pick: PickScore; scorable: boolean }) {
  const showPoints = scorable && pick.points > 0;

  return (
    <View style={[styles.pickRow, pick.outcome === 'not-entered' && styles.faded]}>
      <ThemedText
        type="smallBold"
        themeColor="textSecondary"
        style={styles.position}>
        {pick.position ? `P${pick.position}` : '—'}
      </ThemedText>

      <CarNumberBadge url={pick.carNumberImageUrl} carNumber={pick.carNumber} />

      <View style={styles.pickDetails}>
        <ThemedText numberOfLines={1}>{pick.name}</ThemedText>
        {pick.outcome !== 'running' ? (
          <ThemedText type="small" themeColor="textSecondary">
            {pick.outcome === 'out' ? 'Out' : 'Not entered'}
          </ThemedText>
        ) : null}
      </View>

      <ThemedText
        style={styles.points}
        themeColor={showPoints ? 'positive' : 'textSecondary'}>
        {scorable ? pick.points : '—'}
      </ThemedText>
    </View>
  );
}

/**
 * The picks and what they are currently worth.
 *
 * Always names the race being scored — with a global live feed and picks that
 * outlive a race weekend, "160 points" is meaningless without saying which race
 * produced it.
 */
export function PickScoreboard({
  board,
  race,
  seriesLabel,
  emptyHint,
}: {
  board: ScoreBoard;
  race: LiveRace | null;
  seriesLabel: string;
  emptyHint: string;
}) {
  if (!board.rows.length) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          {emptyHint}
        </ThemedText>
      </ThemedView>
    );
  }

  const isRace = race?.runType === 'race' && race.lapsInRace > 0;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {race ? (
        <View style={styles.contextRow}>
          <FlagBanner flag={race.flag} status={board.scorable ? 'live' : 'idle'} runType={race.runType} />
          {isRace ? (
            <ThemedText type="small" themeColor="textSecondary">
              Lap {race.lapNumber} / {race.lapsInRace}
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {board.scorable ? race?.runName : blockerMessage(board, race, seriesLabel)}
      </ThemedText>

      <View style={styles.picks}>
        {board.rows.map((pick) => (
          <PickRow key={pick.id} pick={pick} scorable={board.scorable} />
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    marginBottom: Spacing.three,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  picks: {
    gap: Spacing.two,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  faded: {
    opacity: 0.5,
  },
  position: {
    // Fixed so the badges and names line up regardless of P1 vs P35.
    width: Spacing.five,
    fontFamily: Fonts.display,
    fontSize: 16,
  },
  pickDetails: {
    flex: 1,
  },
  points: {
    fontFamily: Fonts.display,
    fontSize: 22,
    minWidth: Spacing.five,
    textAlign: 'right',
  },
});
