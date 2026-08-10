import { StyleSheet, View } from 'react-native';

import {
  slotInfo,
  trackSheet,
  type BetResult,
  type BetSheet,
  type SettledRace,
  type TrackBoard,
  type TrackedBet,
} from '@/backend/betting';
import type { LiveRace } from '@/backend/live-race';
import { CarNumberBadge } from '@/components/car-number-badge';
import { FlagBanner } from '@/components/flag-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';

/** Why the bets aren't tracking, in the user's terms rather than the enum's. */
function blockerMessage(board: TrackBoard, race: LiveRace | null): string {
  switch (board.blocker) {
    case 'wrong-race':
      return `${race?.runName || 'Another session'} on track — your race hasn't started`;
    case 'not-a-race':
      return `${race?.runName ?? 'This session'} is ${race?.runType ?? 'not a race'} — bets settle on the race`;
    case 'no-race':
      return 'Waiting for the race';
    default:
      return '';
  }
}

function LiveRow({ row }: { row: TrackedBet }) {
  const slot = slotInfo(row.bet.slot);

  return (
    <View style={[styles.row, row.position === null && styles.faded]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.position}>
        {row.position ? `P${row.position}` : '—'}
      </ThemedText>

      <CarNumberBadge url={row.bet.carNumberImageUrl} carNumber={row.bet.carNumber} />

      <View style={styles.details}>
        <ThemedText numberOfLines={1}>{row.bet.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {slot.label} · {row.bet.stake} on it{row.isOut ? ' · Out' : ''}
        </ThemedText>
      </View>

      <ThemedText style={styles.payout} themeColor={row.hitting ? 'positive' : 'textSecondary'}>
        {row.hitting ? row.provisionalPayout : '—'}
      </ThemedText>
    </View>
  );
}

function SettledRow({ result }: { result: BetResult }) {
  const slot = slotInfo(result.slot);
  const caption =
    result.outcome === 'refunded'
      ? 'Not entered · refunded'
      : `${slot.label} · staked ${result.stake}`;

  return (
    <View style={[styles.row, result.outcome === 'refunded' && styles.faded]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.position}>
        {result.position ? `P${result.position}` : '—'}
      </ThemedText>

      <CarNumberBadge url={result.carNumberImageUrl} carNumber={result.carNumber} />

      <View style={styles.details}>
        <ThemedText numberOfLines={1}>{result.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {caption}
        </ThemedText>
      </View>

      <ThemedText
        style={styles.payout}
        themeColor={result.outcome === 'won' ? 'positive' : 'textSecondary'}>
        {result.outcome === 'lost' ? '0' : result.payout}
      </ThemedText>
    </View>
  );
}

/**
 * The sheet on race day. While the race runs it shows each bet against the
 * live order — what would pay if the flag dropped now. Once settled it becomes
 * the final accounting, with the net up top.
 */
export function BetScoreboard({
  sheet,
  race,
  settled,
}: {
  sheet: BetSheet;
  race: LiveRace | null;
  settled: SettledRace | null;
}) {
  if (settled) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.contextRow}>
          <ThemedText type="smallBold" style={styles.eyebrow}>
            Settled
          </ThemedText>
          <ThemedText
            style={styles.net}
            themeColor={settled.net >= 0 ? 'positive' : 'negative'}>
            {settled.net >= 0 ? '+' : ''}
            {settled.net}
          </ThemedText>
        </View>

        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {settled.raceName} — staked {settled.staked}, returned {settled.returned}
        </ThemedText>

        <View style={styles.rows}>
          {settled.results.map((result) => (
            <SettledRow key={result.driverId} result={result} />
          ))}
        </View>
      </ThemedView>
    );
  }

  const board = trackSheet(sheet, race);
  const isRace = race?.runType === 'race' && race.lapsInRace > 0;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {race ? (
        <View style={styles.contextRow}>
          <FlagBanner
            flag={race.flag}
            status={board.trackable ? 'live' : 'idle'}
            runType={race.runType}
          />
          {isRace ? (
            <ThemedText type="small" themeColor="textSecondary">
              Lap {race.lapNumber} / {race.lapsInRace}
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {board.trackable
          ? `${race?.runName} — ${board.provisionalReturn} paying as things stand`
          : blockerMessage(board, race)}
      </ThemedText>

      <View style={styles.rows}>
        {board.rows.map((row) => (
          <LiveRow key={row.bet.driverId} row={row} />
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
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  net: {
    fontFamily: Fonts.display,
    fontSize: 24,
  },
  rows: {
    gap: Spacing.two,
  },
  row: {
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
  details: {
    flex: 1,
  },
  payout: {
    fontFamily: Fonts.display,
    fontSize: 22,
    minWidth: Spacing.five,
    textAlign: 'right',
  },
});
