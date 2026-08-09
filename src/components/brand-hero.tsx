import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** Logo + wordmark lockup shared by every top-level tab so they read as one app. */
export function BrandHero() {
  return (
    <ThemedView style={styles.hero}>
      <Image
        source={require('@/assets/images/nascar-logo.png')}
        style={styles.logo}
        contentFit="contain"
        accessibilityLabel="NASCAR Racing"
      />

      <ThemedText type="title" themeColor="accent" style={styles.title}>
        RaceDay
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  hero: {
    // Horizontal lockup: keeps the branding pinned without eating the list.
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  logo: {
    width: 95,
    // Source is 657x571; pin the ratio so the logo never distorts.
    aspectRatio: 657 / 571,
  },
  title: {
    // lineHeight comes from the `title` type (sized for 56pt) — override it too
    // or the row keeps the old height.
    fontSize: 39,
    lineHeight: 38,
  },
});
