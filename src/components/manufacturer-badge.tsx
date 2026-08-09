import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';

const BadgeSize = 22;

// Marque colors, used for the drawn fallback. Keys are lowercased car_make.
const MakeColors: Record<string, string> = {
  toyota: '#EB0A1E',
  chevrolet: '#C5A455',
  ford: '#00539B',
};

const MakeAbbreviations: Record<string, string> = {
  toyota: 'TOY',
  chevrolet: 'CHV',
  ford: 'FRD',
};

/**
 * Shows the manufacturer logo when it loads. The logos are hosted on
 * www.nascar.com, which is behind Cloudflare and 403s non-browser clients, so
 * a failure here is expected rather than exceptional — `failed` swaps in a
 * marque-colored chip so the column never renders empty.
 */
export function ManufacturerBadge({
  manufacturer,
  badgeUrl,
}: {
  manufacturer: string;
  badgeUrl: string | null;
}) {
  const [failed, setFailed] = useState(false);

  if (!manufacturer) return null;

  const key = manufacturer.toLowerCase();

  if (badgeUrl && !failed) {
    return (
      <Image
        source={badgeUrl}
        style={styles.logo}
        contentFit="contain"
        onError={() => setFailed(true)}
        accessibilityLabel={manufacturer}
      />
    );
  }

  return (
    <View
      style={[styles.chip, { backgroundColor: MakeColors[key] ?? '#5A5F66' }]}
      accessibilityLabel={manufacturer}>
      <ThemedText style={styles.chipText}>
        {MakeAbbreviations[key] ?? manufacturer.slice(0, 3).toUpperCase()}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: BadgeSize,
    height: BadgeSize,
  },
  chip: {
    height: Spacing.three,
    paddingHorizontal: Spacing.one,
    borderRadius: Spacing.half,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    // Always on a saturated marque color, so this stays white in both schemes.
    color: '#FFFFFF',
    fontFamily: Fonts.display,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.4,
  },
});
