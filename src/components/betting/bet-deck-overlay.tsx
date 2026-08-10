import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { type DraftBet, type DriverBet } from '@/backend/betting';
import type { DriverStanding, RecentForm } from '@/backend/drivers';
import type { UpcomingRace } from '@/backend/live-race';
import { BetReceipt } from '@/components/betting/bet-receipt';
import { DriverBetCard } from '@/components/betting/driver-bet-card';
import {
  SwipeCardStack,
  type SwipeCardStackHandle,
} from '@/components/betting/swipe-card-stack';
import { Casino, Fonts, MaxContentWidth, Spacing } from '@/constants/theme';

const NoDraft: DraftBet = { slot: null, stake: 0 };

function spentIn(committed: ReadonlyMap<string, DraftBet>): number {
  let total = 0;
  for (const bet of committed.values()) total += bet.stake;
  return total;
}

interface SessionProps {
  race: UpcomingRace;
  standings: DriverStanding[];
  form: RecentForm | null;
  /** Current balance plus any escrow being replaced by this session. */
  availableBalance: number;
  initialBets: DriverBet[] | null;
  /** Returns whether the sheet was accepted — false leaves the receipt up. */
  onPlace: (bets: DriverBet[]) => boolean;
  onClose: () => void;
}

/**
 * One run through the deck. Mounted fresh each time the overlay opens — that
 * is what resets the index, the committed bets, and the per-card draft, so no
 * state ever needs manual re-zeroing.
 */
function DeckSession({
  race,
  standings,
  form,
  availableBalance,
  initialBets,
  onPlace,
  onClose,
}: SessionProps) {
  const stack = useRef<SwipeCardStackHandle>(null);

  const seedFor = useCallback(
    (driver: DriverStanding | undefined, spent: number): DraftBet => {
      const existing = driver ? initialBets?.find((bet) => bet.driverId === driver.id) : null;
      if (!existing) return NoDraft;

      return {
        slot: existing.slot,
        stake: Math.min(existing.stake, Math.max(0, availableBalance - spent)),
      };
    },
    [initialBets, availableBalance]
  );

  const [index, setIndex] = useState(0);
  const [committed, setCommitted] = useState<ReadonlyMap<string, DraftBet>>(() => new Map());
  const [current, setCurrent] = useState<DraftBet>(() => seedFor(standings[0], 0));
  const [hint, setHint] = useState<string | null>(null);
  // Where the deal was abandoned when the slip was opened early, so it can be
  // picked back up. Null once the field has been dealt all the way through.
  const [resumeIndex, setResumeIndex] = useState<number | null>(null);

  // The blocked-swipe hint explains itself, then gets out of the way.
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), 2200);
    return () => clearTimeout(timer);
  }, [hint]);

  // Warm the next few headshots so cards don't pop in blank mid-deck.
  useEffect(() => {
    const urls = standings
      .slice(index + 1, index + 4)
      .map((s) => s.headshotUrl)
      .filter((url): url is string => url !== null);
    if (urls.length) Image.prefetch(urls);
  }, [index, standings]);

  const driver = standings[index] ?? null;
  const nextDriver = standings[index + 1] ?? null;
  const spent = spentIn(committed);
  const limit = Math.max(0, availableBalance - spent);
  const canBet = current.slot !== null && current.stake > 0;
  const atReceipt = standings.length > 0 && index >= standings.length;

  const handleSwiped = useCallback(
    (dir: 'left' | 'right') => {
      let nextCommitted = committed;

      if (dir === 'right' && driver && current.slot && current.stake > 0) {
        const grown = new Map(committed);
        grown.set(driver.id, current);
        nextCommitted = grown;
        setCommitted(grown);
      }

      const nextIndex = index + 1;
      setIndex(nextIndex);
      setCurrent(seedFor(standings[nextIndex], spentIn(nextCommitted)));
    },
    [committed, current, driver, index, seedFor, standings]
  );

  const bets: DriverBet[] = standings
    .filter((s) => committed.has(s.id))
    .map((s) => {
      const draft = committed.get(s.id)!;
      return {
        driverId: s.id,
        name: s.name,
        carNumber: s.carNumber,
        carNumberImageUrl: s.carNumberImageUrl,
        slot: draft.slot!,
        stake: draft.stake,
      };
    });

  const startOver = useCallback(() => {
    setIndex(0);
    setCommitted(new Map());
    setCurrent(seedFor(standings[0], 0));
    setHint(null);
    setResumeIndex(null);
  }, [seedFor, standings]);

  /** Jump to the slip without dealing the rest of the field. */
  const skipToReceipt = useCallback(() => {
    setResumeIndex(index);
    setIndex(standings.length);
  }, [index, standings.length]);

  /** ...and go back to the card the deal was left on, bets intact. */
  const keepDealing = useCallback(() => {
    if (resumeIndex === null) return;
    setIndex(resumeIndex);
    setCurrent(seedFor(standings[resumeIndex], spentIn(committed)));
    setResumeIndex(null);
  }, [committed, resumeIndex, seedFor, standings]);

  const cardFor = (target: DriverStanding, isTop: boolean) => (
    <DriverBetCard
      standing={target}
      form={form?.byDriver[target.id]?.slice(0, 2) ?? []}
      draft={isTop ? current : seedFor(target, spent)}
      limit={limit}
      onDraft={isTop ? setCurrent : () => {}}
    />
  );

  return (
    <View style={styles.frame}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close the sheet"
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.raceName} numberOfLines={1}>
            {race.name}
          </Text>
          <Text style={styles.progress}>
            {atReceipt
              ? resumeIndex === null
                ? 'Sheet complete'
                : 'Bet slip'
              : `Card ${Math.min(index + 1, standings.length)} of ${standings.length}`}
          </Text>
        </View>

        <View style={styles.bank}>
          <Text style={styles.bankLabel}>Bank</Text>
          <Text style={styles.bankValue}>{limit}</Text>
          <Text style={styles.bankLabel}>Staked {spent}</Text>
        </View>
      </View>

      {standings.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.raceName}>No drivers to deal</Text>
          <Text style={styles.progress}>Standings haven’t loaded yet.</Text>
        </View>
      ) : atReceipt ? (
        <ScrollView style={styles.receiptScroll} contentContainerStyle={styles.receiptContent}>
          {/* Opened the slip early — offer the deal back, since "Start over"
              below would throw away everything already committed. */}
          {resumeIndex !== null && resumeIndex < standings.length ? (
            <View style={styles.reviewRow}>
              <Pressable
                onPress={keepDealing}
                accessibilityRole="button"
                accessibilityLabel="Go back to dealing"
                hitSlop={{ top: Spacing.two, bottom: Spacing.two, left: Spacing.three, right: Spacing.three }}
                style={({ pressed }) => [styles.review, pressed && styles.pressed]}>
                <Text style={styles.reviewText}>
                  Keep dealing · {standings.length - resumeIndex} left
                </Text>
              </Pressable>
            </View>
          ) : null}

          <BetReceipt
            bets={bets}
            balanceAfter={limit}
            note={hint ?? undefined}
            onPlace={() => {
              if (onPlace(bets)) onClose();
              else setHint('Could not place the sheet — the race may have locked.');
            }}
            onStartOver={startOver}
          />
        </ScrollView>
      ) : (
        <>
          <View style={styles.deck}>
            {driver ? (
              <SwipeCardStack
                ref={stack}
                topKey={driver.id}
                canSwipeRight={canBet}
                onSwiped={handleSwiped}
                onBlockedRight={() => setHint('Pick a finish and a wager first')}
                top={cardFor(driver, true)}
                next={nextDriver ? cardFor(nextDriver, false) : undefined}
              />
            ) : null}
          </View>

          <Text style={styles.hint}>{hint ?? ' '}</Text>

          {/* Bail out of the deal without swiping the rest of the field —
              everyone still undealt simply goes unbet. */}
          <View style={styles.reviewRow}>
            <Pressable
              onPress={skipToReceipt}
              accessibilityRole="button"
              accessibilityLabel="Skip to the bet slip"
              hitSlop={{ top: Spacing.two, bottom: Spacing.two, left: Spacing.three, right: Spacing.three }}
              style={({ pressed }) => [styles.review, pressed && styles.pressed]}>
              <Text style={styles.reviewText}>
                {bets.length > 0 ? `Receipt · ${bets.length}` : 'Receipt'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={() => stack.current?.swipe('left')}
              accessibilityRole="button"
              accessibilityLabel="Skip this driver"
              style={({ pressed }) => [styles.action, styles.skip, pressed && styles.pressed]}>
              <Text style={[styles.actionText, { color: Casino.skip }]}>Skip</Text>
            </Pressable>

            <Pressable
              onPress={() => stack.current?.swipe('right')}
              accessibilityRole="button"
              accessibilityLabel="Place this bet"
              accessibilityState={{ disabled: !canBet }}
              style={({ pressed }) => [
                styles.action,
                styles.bet,
                !canBet && styles.betDisabled,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.actionText, { color: '#FFFFFF' }]}>Bet</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

/**
 * The sheet session: a full-screen card deck over green felt, one card per
 * driver in points order. Swipe right to commit the card's bet, left to pass.
 * Nothing is real until the receipt at the end is confirmed — closing the
 * overlay mid-deck costs nothing.
 *
 * Editing an existing sheet runs the same deck; the old sheet's bets pre-fill
 * each card, and `onPlace` replaces the sheet wholesale.
 */
export function BetDeckOverlay({
  visible,
  onClose,
  ...session
}: SessionProps & { visible: boolean }) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}>
      {/* Android needs its own gesture root inside a Modal, and safe-area
          insets don't reach into a Modal without a fresh provider. */}
      <GestureHandlerRootView style={styles.felt}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.safeArea}>
            {visible ? <DeckSession {...session} onClose={onClose} /> : null}
          </SafeAreaView>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  felt: {
    flex: 1,
    experimental_backgroundImage: Casino.felt,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
  },
  frame: {
    flex: 1,
    // width + the parent's alignItems does the centering. `marginHorizontal:
    // auto` would collapse this to its widest child instead of the screen.
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.one,
    // Tight, so the deck keeps as much of the screen's height as possible.
    gap: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    // The card runs to the frame's edge; the header's text should not.
    paddingHorizontal: Spacing.one,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Casino.cardEdge,
  },
  closeText: {
    fontSize: 18,
    color: Casino.textDim,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  raceName: {
    fontFamily: Fonts.display,
    fontSize: 16,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Casino.text,
  },
  progress: {
    fontFamily: Fonts.display,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Casino.textDim,
  },
  bank: {
    alignItems: 'flex-end',
  },
  bankLabel: {
    fontFamily: Fonts.display,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Casino.textDim,
  },
  bankValue: {
    fontFamily: Fonts.display,
    fontSize: 24,
    lineHeight: 26,
    color: Casino.chip,
  },
  deck: {
    flex: 1,
    // Insets the card inside the frame: a playing card, not a full-bleed panel.
    paddingHorizontal: Spacing.four,
  },
  hint: {
    fontFamily: Fonts.display,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
    color: Casino.chip,
  },
  reviewRow: {
    alignItems: 'center',
  },
  review: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.six,
    borderWidth: 1.5,
    borderColor: Casino.chip,
  },
  reviewText: {
    fontFamily: Fonts.display,
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Casino.chip,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  action: {
    minWidth: 120,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.six,
  },
  skip: {
    borderWidth: 2,
    borderColor: Casino.skip,
  },
  bet: {
    backgroundColor: Casino.bet,
  },
  betDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
  },
  actionText: {
    fontFamily: Fonts.display,
    fontSize: 20,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  receiptScroll: {
    flex: 1,
  },
  receiptContent: {
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
});
