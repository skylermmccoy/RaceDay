import { Pressable, StyleSheet, Text, View } from 'react-native';

import { slotInfo, stakeTotal, type DriverBet } from '@/backend/betting';
import { CarNumberBadge } from '@/components/car-number-badge';
import { Casino, Fonts, Spacing } from '@/constants/theme';

function ReceiptRow({ bet }: { bet: DriverBet }) {
  const slot = slotInfo(bet.slot);

  return (
    <View style={styles.row}>
      <CarNumberBadge url={bet.carNumberImageUrl} carNumber={bet.carNumber} />
      <View style={styles.rowText}>
        <Text style={styles.driver} numberOfLines={1}>
          {bet.name}
        </Text>
        <Text style={styles.slot}>
          {slot.label} · ×{slot.multiplier}
        </Text>
      </View>
      <Text style={styles.stakeCol}>{bet.stake}</Text>
      <Text style={styles.paysCol}>{bet.stake * slot.multiplier}</Text>
    </View>
  );
}

/**
 * The bet slip: every bet on the sheet, what it cost, and what it could pay.
 * Styled as the casino's paper whichever screen it sits on — in the deck it is
 * the confirm step (`onPlace`/`onStartOver` present), on the fantasy tab it is
 * the read-only record of what's riding this weekend.
 */
export function BetReceipt({
  bets,
  balanceAfter,
  note,
  onPlace,
  onStartOver,
}: {
  bets: DriverBet[];
  /** What the balance will be (or is) with this sheet's stake escrowed. */
  balanceAfter: number;
  note?: string;
  onPlace?: () => void;
  onStartOver?: () => void;
}) {
  const staked = stakeTotal(bets);
  const maxReturn = bets.reduce((sum, bet) => sum + bet.stake * slotInfo(bet.slot).multiplier, 0);

  return (
    <View style={styles.slip}>
      <View style={styles.header}>
        <Text style={styles.title}>Bet slip</Text>
        <Text style={styles.count}>
          {bets.length} bet{bets.length === 1 ? '' : 's'}
        </Text>
      </View>

      {bets.length > 0 ? (
        <>
          <View style={styles.columns}>
            <Text style={[styles.columnLabel, styles.columnDriver]}>Driver</Text>
            <Text style={[styles.columnLabel, styles.columnNumber]}>Stake</Text>
            <Text style={[styles.columnLabel, styles.columnNumber]}>Pays</Text>
          </View>

          <View style={styles.rows}>
            {bets.map((bet) => (
              <ReceiptRow key={bet.driverId} bet={bet} />
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.empty}>No bets on this sheet — everyone got skipped.</Text>
      )}

      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total staked</Text>
          <Text style={styles.totalValue}>{staked}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Max return</Text>
          <Text style={[styles.totalValue, { color: Casino.chip }]}>{maxReturn}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Balance after</Text>
          <Text style={styles.totalValue}>{balanceAfter}</Text>
        </View>
      </View>

      {note ? <Text style={styles.note}>{note}</Text> : null}

      {onPlace || onStartOver ? (
        <View style={styles.actions}>
          {onStartOver ? (
            <Pressable
              onPress={onStartOver}
              accessibilityRole="button"
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>Start over</Text>
            </Pressable>
          ) : null}
          {onPlace && bets.length > 0 ? (
            <Pressable
              onPress={onPlace}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>Place bets</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slip: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: Casino.cardEdge,
    backgroundColor: Casino.cardFace,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: Fonts.displayItalic,
    fontSize: 26,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Casino.chip,
  },
  count: {
    fontFamily: Fonts.display,
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Casino.textDim,
  },
  columns: {
    flexDirection: 'row',
    paddingBottom: Spacing.half,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Casino.cardEdge,
  },
  columnLabel: {
    fontFamily: Fonts.display,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Casino.textDim,
  },
  columnDriver: {
    flex: 1,
  },
  columnNumber: {
    width: Spacing.six,
    textAlign: 'right',
  },
  rows: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowText: {
    flex: 1,
  },
  driver: {
    fontSize: 15,
    fontWeight: '600',
    color: Casino.text,
  },
  slot: {
    fontFamily: Fonts.display,
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Casino.textDim,
  },
  stakeCol: {
    width: Spacing.six,
    fontFamily: Fonts.display,
    fontSize: 18,
    textAlign: 'right',
    color: Casino.text,
  },
  paysCol: {
    width: Spacing.six,
    fontFamily: Fonts.display,
    fontSize: 18,
    textAlign: 'right',
    color: Casino.chip,
  },
  empty: {
    fontSize: 14,
    color: Casino.textDim,
  },
  totals: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Casino.cardEdge,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontFamily: Fonts.display,
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Casino.textDim,
  },
  totalValue: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Casino.text,
  },
  note: {
    fontSize: 13,
    color: Casino.textDim,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  secondary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1.5,
    borderColor: Casino.cardEdge,
  },
  secondaryText: {
    fontFamily: Fonts.display,
    fontSize: 18,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Casino.textDim,
  },
  primary: {
    flex: 2,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: Casino.chip,
  },
  primaryText: {
    fontFamily: Fonts.display,
    fontSize: 18,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Casino.chipText,
  },
  pressed: {
    opacity: 0.8,
  },
});
