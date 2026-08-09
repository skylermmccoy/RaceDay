import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Segment = { key: string; label: string };

/** Pill-style segmented control shared by the standings and watch screens. */
export function SegmentedControl({
  segments,
  value,
  onChange,
}: {
  segments: readonly Segment[];
  value: string;
  onChange: (key: string) => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
      {segments.map((segment) => {
        const selected = segment.key === value;

        return (
          <Pressable
            key={segment.key}
            onPress={() => onChange(segment.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.tab,
              selected && { backgroundColor: theme.accent },
              pressed && styles.pressed,
            ]}>
            <ThemedText
              numberOfLines={1}
              style={[
                styles.label,
                // Selected sits on the accent fill, so it stays white in both schemes.
                { color: selected ? '#FFFFFF' : theme.textSecondary },
              ]}>
              {segment.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    borderRadius: Spacing.three,
    padding: Spacing.half,
    gap: Spacing.half,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
    borderRadius: Spacing.three - Spacing.half,
  },
  label: {
    fontFamily: Fonts.display,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.7,
  },
});
