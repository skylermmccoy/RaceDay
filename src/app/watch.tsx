import { useVideoPlayer, VideoView } from 'expo-video';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandHero } from '@/components/brand-hero';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

// iOS needs the `hls` hint to detect tracks on an .m3u8 manifest.
const Channels = [
  {
    label: 'CW Sports',
    source: {
      uri: '',
      contentType: 'hls',
    },
  },
  {
    label: 'Fox Sports',
    source: {
      uri: 'https://amg02855-foxsports-amg02855c1-xumo-us-1755.playouts.now.amagi.tv/Fox-Sports-AmazonNews/playlist720-p.m3u8',
      contentType: 'hls',
    },
  },
  {
    label: 'usa sports',
    source: {
      uri: 'https://goated-manifest.b-cdn.net/out/v2/502208493620e08655861e2c85f425f4/tracks-v1a0/stream.m3u8',
      contentType: 'hls',
    },
  }
] as const;

export default function WatchScreen() {
  // Both streams run at once now, stacked. The second starts muted so the two
  // audio tracks don't talk over each other — unmute it from its own controls.
  const racePlayer = useVideoPlayer(Channels[0].source, (p) => {
    p.loop = true;
    p.volume = 1;
    p.play();
  });

  const foxPlayer = useVideoPlayer(Channels[1].source, (p) => {
    p.loop = true;
  });

  const usaPlayer = useVideoPlayer(Channels[2].source, (p) => {
    p.loop = true;
  });

  const players = [racePlayer, foxPlayer, usaPlayer];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <BrandHero />
        <ScrollView>
        <ThemedView style={styles.sectionHeader}>
          <ThemedText type="subtitle">Watch</ThemedText>
        </ThemedView>

        <ThemedView style={styles.content}>
          {Channels.map((channel, i) => (
            <ThemedView key={channel.label} style={styles.channel}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {channel.label}
              </ThemedText>

              <VideoView
                style={styles.video}
                player={players[i]}
                contentFit="contain"
                nativeControls
                allowsPictureInPicture
                fullscreenOptions={{ enable: true }}
              />
            </ThemedView>
          ))}
        </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
  },
  sectionHeader: {
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
    alignSelf: 'stretch',
    gap: Spacing.three,
    // No scroll view here, so the floating tab bar's room is reserved directly.
    paddingBottom: BottomTabInset + Spacing.three,
  },
  channel: {
    alignSelf: 'stretch',
    gap: Spacing.one,
  },
  video: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Spacing.three,
    backgroundColor: '#000000',
  },
});
