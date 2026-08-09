import { StyleSheet, View } from 'react-native';

import { CarNumberBadge } from '@/components/car-number-badge';
import { ManufacturerBadge } from '@/components/manufacturer-badge';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import type { DriverStanding } from '@/backend/drivers';

export function StandingRow({ standing }: { standing: DriverStanding }) {
  const isPodium = standing.position <= 3;

  return (
    <View style={styles.row}>
      <ThemedText
        type="smallBold"
        themeColor={isPodium ? 'podium' : 'textSecondary'}
        style={styles.position}>
        {standing.position}
      </ThemedText>

      <CarNumberBadge url={standing.carNumberImageUrl} carNumber={standing.carNumber} />

      <View style={styles.details}>
        <ThemedText numberOfLines={1}>{standing.name}</ThemedText>
        {standing.team || standing.manufacturer ? (
          <View style={styles.subtitleRow}>
            <ManufacturerBadge
              manufacturer={standing.manufacturer}
              badgeUrl={standing.manufacturerBadge}
            />
            {standing.team ? (
              <ThemedText
                type="small"
                themeColor="textSecondary"
                numberOfLines={1}
                style={styles.team}>
                {standing.team}
              </ThemedText>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.points}>
        <ThemedText type="smallBold" style={styles.pointsValue}>
          {standing.points}
        </ThemedText>
        {standing.pointsBehindLeader > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            -{standing.pointsBehindLeader}
          </ThemedText>
        ) : null}
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
  position: {
    // Trucks fields 93 drivers, so positions reach 3 digits — size for that or
    // the last rows clip.
    width: Spacing.five,
    textAlign: 'right',
    // Condensed numerals keep the position column narrow and on-brand.
    fontFamily: Fonts.display,
    fontSize: 18,
  },
  pointsValue: {
    fontFamily: Fonts.display,
    fontSize: 20,
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
  team: {
    flexShrink: 1,
  },
  points: {
    alignItems: 'flex-end',
    // Fixed width so the totals form a straight column and the name column
    // stops resizing per row. O'Reilly totals reach 4 digits (1015).
    minWidth: Spacing.five + Spacing.three,
  },
});
