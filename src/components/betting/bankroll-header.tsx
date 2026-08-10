import { StyleSheet, View } from 'react-native';

import type { SettledRace } from '@/backend/betting';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';

/**
 * The screen-top money line: the balance in chip gold, with the one most
 * useful subline — what's riding right now, or how the last race went.
 * Theme-aware, unlike the deck itself, because it lives on the fantasy tab.
 */
export function BankrollHeader({
  balance,
  inPlay,
  lastSettled,
}: {
  balance: number;
  inPlay: number;
  lastSettled: SettledRace | null;
}) {
  const subline = inPlay > 0
    ? `${inPlay} in play`
    : lastSettled
      ? `${lastSettled.raceName}: ${lastSettled.net >= 0 ? '+' : ''}${lastSettled.net}`
      : 'Start a sheet to bet';

  return (
    <View style={styles.header}>
      <View style={styles.text}>
        <ThemedText type="smallBold" style={styles.label}>
          Bankroll
        </ThemedText>
        <ThemedText
          type="small"
          themeColor={
            inPlay > 0 || !lastSettled
              ? 'textSecondary'
              : lastSettled.net >= 0
                ? 'positive'
                : 'negative'
          }
          numberOfLines={1}>
          {subline}
        </ThemedText>
      </View>

      <ThemedText style={styles.balance} themeColor="podium">
        {balance}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balance: {
    fontFamily: Fonts.display,
    fontSize: 28,
    lineHeight: 30,
  },
});
