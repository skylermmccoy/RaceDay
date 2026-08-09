import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="live">
        <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
        {/* SF Symbol rather than a bundled PNG — there is no live icon in
            assets/images/tabIcons yet. Swap in a template image here if one is
            added, to match the other two tabs exactly. */}
        <NativeTabs.Trigger.Icon sf="flag.checkered" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="fantasy">
        <NativeTabs.Trigger.Label>Fantasy</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="trophy" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="watch">
        <NativeTabs.Trigger.Label>Watch</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/watch.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
