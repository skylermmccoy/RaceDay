import { Pressable, StyleSheet } from 'react-native';

import { MaxPicks, type EntryPhase } from '@/backend/fantasy';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function label(phase: EntryPhase, picked: number, dirty: boolean): string {
  if (phase === 'scored') return 'Scored';
  if (phase === 'locked') return 'Locked — race under way';
  if (picked < MaxPicks) return `Pick ${MaxPicks - picked} more`;

  return dirty ? 'Submit picks' : 'Submitted';
}

/**
 * Commits the entry for the upcoming race.
 *
 * Enabled only when there is something to commit — a full set of picks that
 * differs from what is already stored. Every other state is a label explaining
 * why not, rather than a live button that silently does nothing.
 */
export function SubmitPicksButton({
  phase,
  picked,
  dirty,
  onSubmit,
}: {
  phase: EntryPhase;
  picked: number;
  dirty: boolean;
  onSubmit: () => void;
}) {
  const theme = useTheme();
  const enabled = phase === 'open' && picked === MaxPicks && dirty;

  return (
    <Pressable
      onPress={onSubmit}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: enabled ? theme.accent : theme.backgroundElement },
        pressed && enabled && styles.pressed,
      ]}>
      <ThemedText
        // Enabled, the label sits on the saturated accent fill and stays white
        // in both schemes — same reasoning as ManufacturerBadge's chip text.
        // Disabled, it is a status line rather than a call to action.
        style={[styles.label, enabled && styles.onAccent]}
        themeColor={enabled ? undefined : 'textSecondary'}>
        {label(phase, picked, dirty)}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    // Pinned above the driver list, so it stays a tap target without taking a
    // row's worth of room from the list. The screen's own gap spaces it below.
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  pressed: {
    opacity: 0.8,
  },
  onAccent: {
    color: '#FFFFFF',
  },
  label: {
    fontFamily: Fonts.display,
    fontSize: 20,
    letterSpacing: 1,
    textTransform: 'uppercase',
    lineHeight: 24,
  },
});
