import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    'BarlowCondensed-Bold': require('@/assets/fonts/BarlowCondensed-Bold.ttf'),
    'BarlowCondensed-BlackItalic': require('@/assets/fonts/BarlowCondensed-BlackItalic.ttf'),
  });

  // Splash is still up (preventAutoHideAsync above), so holding here avoids a
  // flash of system-font text before the brand faces register.
  if (!fontsLoaded) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
