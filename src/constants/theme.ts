/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Sampled directly from assets/images/nascar-logo.png — these are the logo's
 * own ink, not approximations. Use them for accents; the surface colors below
 * stay neutral so the standings table remains readable.
 */
export const Brand = {
  red: '#EE3E41',
  blue: '#007AC1',
  gold: '#FFD55B',
  magenta: '#B83291',
} as const;

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    accent: Brand.red,
    // Logo blue/gold are tuned for white backgrounds — darkened to stay legible.
    link: '#0069A8',
    podium: '#A97A08',
    positive: '#1B7F3B',
    negative: '#C62828',
  },
  dark: {
    text: '#ffffff',
    background: '#252526',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    // Lightened so they hold contrast against black.
    accent: '#FF5F62',
    link: '#4FB0EE',
    podium: Brand.gold,
    positive: '#4CC97A',
    negative: '#FF6B6B',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Flag states are the one place a single theme color will not do: the banner
 * fills with the flag's own color, so each needs a foreground picked to stay
 * legible on it — white on the yellow flag fails contrast outright. Keeping them
 * out of `Colors` also stops eight one-off keys polluting `ThemeColor`, which
 * every ThemedText call site sees.
 *
 * `finished`, `stopped` and `unknown` share a neutral so an unmapped flag_state
 * degrades to something readable rather than blank.
 */
export const Flags = {
  light: {
    green: { bg: '#1B7F3B', fg: '#FFFFFF' },
    yellow: { bg: '#F2C200', fg: '#241E00' },
    red: { bg: '#C62828', fg: '#FFFFFF' },
    checkered: { bg: '#1C1C1E', fg: '#FFFFFF' },
    finished: { bg: '#3A3A3C', fg: '#FFFFFF' },
    warmup: { bg: '#5A5F66', fg: '#FFFFFF' },
    stopped: { bg: '#5A5F66', fg: '#FFFFFF' },
    unknown: { bg: '#5A5F66', fg: '#FFFFFF' },
  },
  dark: {
    green: { bg: '#2E9D52', fg: '#04170B' },
    yellow: { bg: '#FFD400', fg: '#241E00' },
    red: { bg: '#E14B4B', fg: '#1A0303' },
    checkered: { bg: '#F2F2F5', fg: '#1C1C1E' },
    finished: { bg: '#5A5F66', fg: '#FFFFFF' },
    warmup: { bg: '#6E747C', fg: '#FFFFFF' },
    stopped: { bg: '#6E747C', fg: '#FFFFFF' },
    unknown: { bg: '#6E747C', fg: '#FFFFFF' },
  },
} as const;

export type FlagPalette = (typeof Flags)['light'];

/**
 * The betting deck is a card table: deliberately always-dark whatever the
 * system scheme, so its palette lives here rather than in `Colors`. Components
 * under src/components/betting/ draw from this instead of useTheme() — the felt
 * doesn't have a light mode.
 */
export const Casino = {
  /** Deep green felt falling to black, for `experimental_backgroundImage`. */
  felt: 'linear-gradient(180deg, #123528 0%, #0A2318 55%, #06120C 100%)',
  cardFace: '#17191E',
  cardEdge: '#2C313A',
  /** Recessed wells inside a card (image panel, wager tray). */
  inset: '#101216',
  text: '#F2F2F5',
  textDim: '#9BA1AA',
  /** Chip gold — the money color on the table. */
  chip: Brand.gold,
  /** Ink that stays legible on a chip-gold fill. */
  chipText: '#241E00',
  /** Right-swipe / confirm. Matches the dark green flag. */
  bet: '#2E9D52',
  /** Left-swipe / skip. Matches the dark red flag. */
  skip: '#E14B4B',
} as const;

/**
 * Barlow Condensed echoes the heavy italic condensed sans of the NASCAR
 * wordmark. Bundled in assets/fonts and registered in `src/app/_layout.tsx`,
 * so the family names are identical on every platform.
 */
const BrandFonts = {
  /** Section headings — pair with uppercase + letter spacing. */
  display: 'BarlowCondensed-Bold',
  /** Big titles, closest to the logo lockup. */
  displayItalic: 'BarlowCondensed-BlackItalic',
};

export const Fonts = Platform.select({
  ios: {
    ...BrandFonts,
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    ...BrandFonts,
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    ...BrandFonts,
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
