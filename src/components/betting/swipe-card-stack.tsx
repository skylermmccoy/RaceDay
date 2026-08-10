import { useCallback, useEffect, useImperativeHandle, type ReactNode, type Ref } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Casino, Fonts, Spacing } from '@/constants/theme';

export type SwipeDirection = 'left' | 'right';

export interface SwipeCardStackHandle {
  /** Animate the top card off exactly as a drag would — the footer buttons use this. */
  swipe: (dir: SwipeDirection) => void;
}

const FLING_MS = 220;
const COMMIT_VELOCITY = 900;

/**
 * The Tinder mechanic, and nothing else: drag the top card, rotate with the
 * drag, stamp BET/SKIP over it as intent becomes clear, and let the next card
 * grow in underneath. What a card *is* stays the parent's business — only the
 * top two are ever mounted.
 *
 * A right-swipe can be refused (`canSwipeRight` false): the card rubber-bands
 * home and `onBlockedRight` fires so the parent can explain what's missing.
 *
 * Shared values go through get()/set() rather than .value — the React Compiler
 * is enabled for this app and treats direct .value writes as mutating a
 * memoized value.
 */
export function SwipeCardStack({
  ref,
  topKey,
  top,
  next,
  canSwipeRight,
  onSwiped,
  onBlockedRight,
}: {
  ref?: Ref<SwipeCardStackHandle>;
  /** Identity of the top card; changing it recenters the stack for the new card. */
  topKey: string;
  top: ReactNode;
  next?: ReactNode;
  canSwipeRight: boolean;
  onSwiped: (dir: SwipeDirection) => void;
  onBlockedRight?: () => void;
}) {
  const { width } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // The committed card flew out under the previous key — its replacement
  // starts centered, without animating back across the screen.
  useEffect(() => {
    translateX.set(0);
    translateY.set(0);
  }, [topKey, translateX, translateY]);

  const flingOut = useCallback(
    (dir: SwipeDirection) => {
      if (dir === 'right' && !canSwipeRight) {
        onBlockedRight?.();
        return;
      }

      translateX.set(
        withTiming((dir === 'right' ? 1 : -1) * width * 1.4, { duration: FLING_MS }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(onSwiped, dir);
        })
      );
    },
    [canSwipeRight, onBlockedRight, onSwiped, translateX, width]
  );

  useImperativeHandle(ref, () => ({ swipe: flingOut }), [flingOut]);

  const pan = Gesture.Pan()
    // Demand horizontal intent before capturing, so the slot and chip buttons
    // on the card stay tappable.
    .activeOffsetX([-16, 16])
    .onUpdate((event) => {
      translateX.set(event.translationX);
      // Dampened so the card tilts with the thumb without leaving the table.
      translateY.set(event.translationY * 0.35);
    })
    .onEnd((event) => {
      const settled = translateX.get();
      const dir: SwipeDirection = settled >= 0 ? 'right' : 'left';
      const past = Math.abs(settled) > width * 0.32 || Math.abs(event.velocityX) > COMMIT_VELOCITY;

      if (past && (dir === 'left' || canSwipeRight)) {
        translateX.set(
          withTiming(
            (dir === 'right' ? 1 : -1) * width * 1.4,
            { duration: FLING_MS },
            (finished) => {
              if (finished) scheduleOnRN(onSwiped, dir);
            }
          )
        );
        return;
      }

      if (past && dir === 'right' && onBlockedRight) scheduleOnRN(onBlockedRight);
      translateX.set(withSpring(0));
      translateY.set(withSpring(0));
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.get() },
      { translateY: translateY.get() },
      { rotateZ: `${interpolate(translateX.get(), [-width, width], [-12, 12])}deg` },
    ],
  }));

  const betStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.get(),
      [width * 0.06, width * 0.28],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const skipStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.get(),
      [-width * 0.28, -width * 0.06],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  // The card beneath grows into place as the top one leaves.
  const nextStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      Math.abs(translateX.get()),
      [0, width * 0.4],
      [0, 1],
      Extrapolation.CLAMP
    );

    return {
      opacity: 0.85 + progress * 0.15,
      transform: [{ scale: 0.94 + progress * 0.06 }, { translateY: (1 - progress) * Spacing.three }],
    };
  });

  return (
    <View style={styles.stack}>
      {next ? <Animated.View style={[styles.card, nextStyle]}>{next}</Animated.View> : null}

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, topStyle]}>
          {top}

          <Animated.View
            style={[styles.stamp, styles.betStamp, betStampStyle]}
            pointerEvents="none">
            <Text style={[styles.stampText, { color: Casino.bet }]}>Bet</Text>
          </Animated.View>

          <Animated.View
            style={[styles.stamp, styles.skipStamp, skipStampStyle]}
            pointerEvents="none">
            <Text style={[styles.stampText, { color: Casino.skip }]}>Skip</Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    flex: 1,
    alignSelf: 'stretch',
  },
  card: {
    ...StyleSheet.absoluteFill,
  },
  stamp: {
    position: 'absolute',
    top: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderWidth: 3,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  betStamp: {
    left: Spacing.four,
    borderColor: Casino.bet,
    transform: [{ rotateZ: '-12deg' }],
  },
  skipStamp: {
    right: Spacing.four,
    borderColor: Casino.skip,
    transform: [{ rotateZ: '12deg' }],
  },
  stampText: {
    fontFamily: Fonts.displayItalic,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
