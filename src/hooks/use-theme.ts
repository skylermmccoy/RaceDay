/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, Flags } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

function activeScheme(scheme: ReturnType<typeof useColorScheme>) {
  return scheme === 'unspecified' ? 'light' : scheme;
}

export function useTheme() {
  return Colors[activeScheme(useColorScheme())];
}

/** Flag fill/foreground pairs for the active scheme — see Flags in theme.ts. */
export function useFlagPalette() {
  return Flags[activeScheme(useColorScheme())];
}
