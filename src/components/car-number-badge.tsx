import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// Car badges are 78x70 at source; render at half size so they stay crisp.
const BadgeWidth = 39;
const BadgeHeight = 35;

/**
 * The car-number graphic, shared by the standings and live-timing rows.
 *
 * Drivers between rides have no badge on file and the URL 403s, so the caller
 * passes null and gets a placeholder that keeps the row's columns aligned
 * rather than collapsing them.
 */
export function CarNumberBadge({ url, carNumber }: { url: string | null; carNumber: string }) {
  if (!url) {
    return (
      <ThemedView type="backgroundElement" style={[styles.badge, styles.placeholder]}>
        <ThemedText type="small" themeColor="textSecondary">
          –
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <Image
      source={url}
      style={styles.badge}
      contentFit="contain"
      transition={150}
      accessibilityLabel={`Car number ${carNumber}`}
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    width: BadgeWidth,
    height: BadgeHeight,
    borderRadius: Spacing.half,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
