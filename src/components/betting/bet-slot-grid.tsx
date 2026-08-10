import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BetSlots, type BetSlotKey } from '@/backend/betting';
import { Casino, Fonts, Spacing } from '@/constants/theme';

/** Per-slot table ink: the money bet and the wreck bet get their own colors. */
function slotAccent(key: BetSlotKey): string {
  if (key === 'win') return Casino.chip;
  if (key === 'dnf') return Casino.skip;
  return Casino.text;
}

/**
 * The roulette layout: six felt cells, one per finishing slot, each quoting its
 * multiplier. Exactly one can be down at a time — it's a radio group wearing a
 * table-cloth.
 */
export function BetSlotGrid({
  value,
  onChange,
}: {
  value: BetSlotKey | null;
  onChange: (slot: BetSlotKey) => void;
}) {
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {BetSlots.map((slot) => {
        const selected = slot.key === value;
        const accent = slotAccent(slot.key);

        return (
          <Pressable
            key={slot.key}
            onPress={() => onChange(slot.key)}
            accessibilityRole="radio"
            accessibilityLabel={`${slot.label}, pays ${slot.multiplier} to 1`}
            accessibilityState={{ checked: selected }}
            style={({ pressed }) => [
              styles.slot,
              { borderColor: selected ? Casino.chip : Casino.cardEdge },
              selected && styles.slotSelected,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.label, { color: selected ? Casino.chip : accent }]}>
              {slot.label}
            </Text>
            <Text style={[styles.mult, selected && { color: Casino.chip }]}>
              ×{slot.multiplier}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    // Fills the column so the six cells share the card's full height rather
    // than bunching at the top.
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'stretch',
    gap: Spacing.two,
  },
  slot: {
    // Two columns, three rows — the table grid.
    flexBasis: '45%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    borderWidth: 1.5,
    borderRadius: Spacing.two,
    backgroundColor: Casino.inset,
    gap: Spacing.half,
  },
  slotSelected: {
    backgroundColor: 'rgba(255, 213, 91, 0.12)',
  },
  pressed: {
    opacity: 0.75,
  },
  label: {
    fontFamily: Fonts.display,
    fontSize: 20,
    lineHeight: 23,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  mult: {
    fontFamily: Fonts.display,
    fontSize: 15,
    lineHeight: 17,
    color: Casino.textDim,
  },
});
