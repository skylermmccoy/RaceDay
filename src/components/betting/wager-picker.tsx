import { Pressable, StyleSheet, Text, View } from 'react-native';

import { slotInfo, type DraftBet } from '@/backend/betting';
import { Brand, Casino, Colors, Fonts, Spacing } from '@/constants/theme';

// Real chip denominations wear real chip colors: red 5, blue 10, green 25.
const ChipValues = [
  { value: 5, color: Brand.red },
  { value: 10, color: Brand.blue },
  { value: 25, color: Colors.dark.positive },
] as const;

/**
 * How much of the bankroll rides on this driver. Chips stack (tap +5 twice for
 * 10) and clamp at `limit` — the balance minus everything already committed on
 * other cards. Until a slot is chosen there is nothing to pay, so the tray sits
 * dimmed with the payout line explaining why.
 */
export function WagerPicker({
  draft,
  limit,
  onStake,
}: {
  draft: DraftBet;
  limit: number;
  onStake: (stake: number) => void;
}) {
  const slot = draft.slot ? slotInfo(draft.slot) : null;
  const active = slot !== null && limit > 0;

  // Kept short — the tray is a narrow column and this line must not wrap.
  const payoutLine = !slot
    ? limit > 0
      ? 'Pick a finish'
      : 'Nothing to stake'
    : draft.stake > 0
      ? `Pays ${draft.stake * slot.multiplier}`
      : `Up to ${limit}`;

  return (
    <View style={[styles.tray, !active && styles.inactive]} pointerEvents={active ? 'auto' : 'none'}>
      <View style={styles.stakeRow}>
        <Text style={styles.eyebrow}>Wager</Text>
        <Text style={styles.stake}>{draft.stake}</Text>
        <Pressable
          onPress={() => onStake(0)}
          disabled={draft.stake === 0}
          accessibilityRole="button"
          accessibilityLabel="Clear wager"
          style={({ pressed }) => [styles.clear, (pressed || draft.stake === 0) && styles.dimmed]}>
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      </View>

      <View style={styles.chips}>
        {ChipValues.map((chip) => {
          const overLimit = draft.stake + chip.value > limit;

          return (
            <Pressable
              key={chip.value}
              onPress={() => onStake(Math.min(limit, draft.stake + chip.value))}
              disabled={overLimit}
              accessibilityRole="button"
              accessibilityLabel={`Add ${chip.value} points`}
              style={({ pressed }) => [
                styles.chip,
                { borderColor: chip.color },
                (pressed || overLimit) && styles.dimmed,
              ]}>
              <Text style={[styles.chipText, { color: chip.color }]}>+{chip.value}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text
        style={[styles.payout, slot && draft.stake > 0 && { color: Casino.chip }]}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {payoutLine}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: Casino.inset,
  },
  inactive: {
    opacity: 0.45,
  },
  stakeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  eyebrow: {
    fontFamily: Fonts.display,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Casino.textDim,
  },
  stake: {
    flex: 1,
    fontFamily: Fonts.display,
    fontSize: 30,
    lineHeight: 32,
    color: Casino.chip,
    textAlign: 'right',
  },
  clear: {
    paddingHorizontal: Spacing.one,
  },
  clearText: {
    fontFamily: Fonts.display,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Casino.textDim,
  },
  chips: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.one,
  },
  chip: {
    // A poker chip: round, rimmed in its denomination color. Square-ish via
    // aspectRatio so three always share the tray's width, whatever the card size.
    flex: 1,
    aspectRatio: 1,
    maxHeight: 56,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Casino.cardFace,
  },
  chipText: {
    fontFamily: Fonts.display,
    fontSize: 17,
  },
  dimmed: {
    opacity: 0.35,
  },
  payout: {
    fontFamily: Fonts.display,
    fontSize: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Casino.textDim,
    textAlign: 'right',
  },
});
