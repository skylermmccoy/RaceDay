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
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

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
