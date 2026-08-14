import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DraftBet } from '@/backend/betting';
import type { DriverStanding, RecentFinish } from '@/backend/drivers';
import { BetSlotGrid } from '@/components/betting/bet-slot-grid';
import { WagerPicker } from '@/components/betting/wager-picker';
import { Casino, Fonts, Spacing } from '@/constants/theme';

// Car badges are 78x70 at source; the deck shows them at full size — twice the
// standings row — because here the car is the star.
const BadgeWidth = 78;
const BadgeHeight = 70;

function FormRow({ finish }: { finish: RecentFinish }) {
  const color = finish.isDnf
    ? Casino.skip
    : finish.position <= 10
      ? Casino.chip
      : Casino.text;

  return (
    <View style={styles.formRow}>
      <Text style={styles.formRace} numberOfLines={1}>
        {finish.raceName}
      </Text>
      <Text style={[styles.formResult, { color }]}>
        {finish.isDnf ? `DNF · P${finish.position}` : `P${finish.position}`}
      </Text>
    </View>
  );
}

/**
 * One driver, one decision. Left: the driver, as large as the card allows,
 * with the car number at full size. Right: the roulette grid and the chip
 * tray. Bottom: the last two races, because a hot streak is what sells a bet.
 *
 * Headshots live behind Cloudflare and many records only carry placeholders,
 * so the left panel must look deliberate with no photo at all: the number
 * becomes the portrait.
 */
export function DriverBetCard({
  standing,
  form,
  draft,
  limit,
  onDraft,
}: {
  standing: DriverStanding;
  /** Last two race finishes, newest first; empty when unknown. */
  form: RecentFinish[];
  draft: DraftBet;
  /** Most this card's stake may reach (balance minus other cards' bets). */
  limit: number;
  onDraft: (draft: DraftBet) => void;
}) {
  // Keyed by URL, not a boolean: the two card slots are recycled across the whole
  // deck, so a boolean would pin every later driver in this slot to the number
  // fallback after one failed fetch.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPhoto = standing.headshotUrl !== null && failedUrl !== standing.headshotUrl;

  return (
    <View style={styles.card}>
      <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit>
        {standing.name}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        P{standing.position} in points · {standing.points} pts
        {standing.isRookie ? ' · Rookie' : ''}
      </Text>

      <View style={styles.body}>
        <View style={styles.portrait}>
          {showPhoto ? (
            <Image
              source={standing.headshotUrl}
              recyclingKey={standing.id}
              style={styles.photo}
              contentFit="cover"
              contentPosition="top center"
              cachePolicy="memory-disk"
              transition={0}
              onError={() => setFailedUrl(standing.headshotUrl)}
              accessibilityLabel={standing.name}
            />
          ) : (
            <View style={styles.photoFallback}>
              <Text style={styles.fallbackNumber} adjustsFontSizeToFit numberOfLines={1}>
                #{standing.carNumber || '—'}
              </Text>
              <Text style={styles.fallbackTeam} numberOfLines={2}>
                {standing.team || standing.manufacturer || ''}
              </Text>
            </View>
          )}

          {standing.carNumberImageUrl ? (
            <Image
              source={standing.carNumberImageUrl}
              recyclingKey={standing.id}
              style={styles.badge}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={0}
              accessibilityLabel={`Car number ${standing.carNumber}`}
            />
          ) : null}
        </View>

        <View style={styles.table}>
          <BetSlotGrid
            value={draft.slot}
            onChange={(slot) => onDraft({ ...draft, slot })}
          />
          <WagerPicker
            draft={draft}
            limit={limit}
            onStake={(stake) => onDraft({ ...draft, stake })}
          />
        </View>
      </View>

      <View style={styles.formStrip}>
        <Text style={styles.formEyebrow}>Last races</Text>
        {form.length > 0 ? (
          form.map((finish) => <FormRow key={finish.raceId} finish={finish} />)
        ) : (
          <Text style={styles.formRace}>No recent results</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: Casino.cardEdge,
    backgroundColor: Casino.cardFace,
  },
  name: {
    fontFamily: Fonts.displayItalic,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Casino.text,
  },
  meta: {
    fontFamily: Fonts.display,
    fontSize: 15,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Casino.textDim,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  portrait: {
    flexBasis: '42%',
    borderRadius: Spacing.two,
    backgroundColor: Casino.inset,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  photo: {
    ...StyleSheet.absoluteFill,
  },
  photoFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    padding: Spacing.two,
  },
  fallbackNumber: {
    fontFamily: Fonts.displayItalic,
    fontSize: 64,
    color: Casino.chip,
  },
  fallbackTeam: {
    fontFamily: Fonts.display,
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Casino.textDim,
    textAlign: 'center',
  },
  badge: {
    width: BadgeWidth,
    height: BadgeHeight,
    margin: Spacing.two,
  },
  table: {
    flex: 1,
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  formStrip: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Casino.cardEdge,
  },
  formEyebrow: {
    fontFamily: Fonts.display,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: Casino.textDim,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  formRace: {
    flex: 1,
    fontSize: 13,
    color: Casino.textDim,
  },
  formResult: {
    fontFamily: Fonts.display,
    fontSize: 16,
  },
});
