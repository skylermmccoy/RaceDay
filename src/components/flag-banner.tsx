import { StyleSheet, View } from 'react-native';

import type { FlagState, LiveStatus, RunType } from '@/backend/live-race';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useFlagPalette } from '@/hooks/use-theme';

/**
 * The status the user cares about is a blend of the flag on track and whether
 * the feed is actually moving — a frozen board must never read "GREEN".
 */
function label(flag: FlagState, status: LiveStatus, runType: RunType): string {
  if (status === 'stalled') return 'WAITING FOR TIMING';
  if (status === 'final') return 'FINAL';
  if (runType === 'practice') return 'PRACTICE';
  if (runType === 'qualifying') return 'QUALIFYING';

  const flags: Record<FlagState, string> = {
    green: 'GREEN',
    yellow: 'CAUTION',
    red: 'RED FLAG',
    checkered: 'CHECKERED',
    finished: 'FINAL',
    stopped: 'STOPPED',
    warmup: 'WARM UP',
    unknown: 'ON TRACK',
  };

  return flags[flag];
}

/** A stalled feed keeps the last flag's color but the "waiting" label. */
export function FlagBanner({
  flag,
  status,
  runType,
}: {
  flag: FlagState;
  status: LiveStatus;
  runType: RunType;
}) {
  const palette = useFlagPalette();
  const tone = status === 'final' ? palette.finished : palette[flag];

  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <ThemedText style={[styles.label, { color: tone.fg }]}>
        {label(flag, status, runType)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    alignSelf: 'flex-start',
  },
  label: {
    fontFamily: Fonts.display,
    fontSize: 16,
    letterSpacing: 1,
    lineHeight: 20,
  },
});
