import { router } from 'expo-router';
import { View } from 'react-native';

import { FlameIcon, MutualIcon, QuillIcon, TargetIcon } from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Body, BodyBold, Heading, HeadingItalic, Kicker, Small } from '@/components/ui/type';
import { StatusChip } from '@/components/ui/chip';
import { formatShort } from '@/lib/dates';
import { currentStreak, goalProgress, progressRatio } from '@/lib/streaks';
import { useMe, useStore, useUser } from '@/store/use-store';
import type { Pact } from '@/store/types';
import { colors, radii, shadows, ticketTints } from '@/theme/tokens';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * A pact rendered as a little signed contract / ticket:
 * tinted header band, serif title, perforation row of day-letters,
 * keeper "signature" in italic, progress ring.
 *
 * The KEEPER sees the contract sheet only — title, cadence, dates, status,
 * creator. Check-ins live on the creator's device until they sync, so any
 * progress ring, streak or tally here would be fabricated from absent data
 * (a flawless friend rendered as "0% kept").
 */
export function PactCard({ pact, index = 0 }: { pact: Pact; index?: number }) {
  const checkIns = useStore((s) => s.checkIns);
  const me = useMe();
  const keeper = useUser(pact.keeperUserId);
  const creator = useUser(pact.creatorUserId);
  const iAmKeeper = pact.keeperUserId === me.id && pact.creatorUserId !== me.id;
  const tint = ticketTints[pact.tintIndex % ticketTints.length];
  const ratio = iAmKeeper ? 0 : progressRatio(pact, checkIns);
  const streak = iAmKeeper ? 0 : currentStreak(pact, checkIns);

  return (
    <PressableScale
      scaleTo={0.975}
      onPress={() => router.push(`/pact/${pact.id}`)}
      style={{
        backgroundColor: colors.card,
        borderRadius: radii.lg,
        borderWidth: 1.5,
        borderColor: colors.ink,
        boxShadow: shadows.card,
        overflow: 'hidden',
      }}
    >
      {/* tinted header band */}
      <View
        style={{
          backgroundColor: tint.base,
          paddingHorizontal: 18,
          paddingTop: 14,
          paddingBottom: 12,
          borderBottomWidth: 1.5,
          borderBottomColor: colors.ink,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {pact.type === 'goal' ? (
            <TargetIcon size={15} strokeWidth={2.2} />
          ) : pact.isMutual ? (
            <MutualIcon size={15} strokeWidth={2.2} />
          ) : (
            <QuillIcon size={15} strokeWidth={2.2} />
          )}
          <Kicker>
            {pact.type === 'goal'
              ? `Goal · ${pact.goalTarget} ${pact.goalUnit}`
              : pact.isMutual
                ? 'Mutual pact'
                : (pact.daysOfWeek?.length ?? 0) === 7
                  ? 'Every day'
                  : 'Weekly pact'}
          </Kicker>
        </View>
        {!iAmKeeper && streak > 1 && pact.status === 'active' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <FlameIcon size={15} color={colors.seal} fill={colors.seal} strokeWidth={1.5} />
            <BodyBold style={{ fontSize: 13 }}>{streak}</BodyBold>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 18, paddingVertical: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Heading>{pact.title}</Heading>
            {pact.description ? (
              <Body color={colors.ink50} numberOfLines={1}>
                {pact.description}
              </Body>
            ) : null}
          </View>
          {!iAmKeeper && (
            <ProgressRing
              ratio={ratio}
              size={54}
              stroke={5}
              color={colors.ink}
              delay={150 + index * 90}
            >
              <Small>{Math.round(ratio * 100)}%</Small>
            </ProgressRing>
          )}
        </View>

        {/* perforation: day letters (cadence — part of the terms) or goal tally */}
        {pact.type === 'frequency' ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {DAY_LABELS.map((d, i) => {
              const on = pact.daysOfWeek?.includes(i);
              return (
                <View
                  key={i}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? colors.ink : 'transparent',
                    borderWidth: on ? 0 : 1.2,
                    borderColor: colors.line,
                  }}
                >
                  <Small color={on ? tint.base : colors.ink30}>{d}</Small>
                </View>
              );
            })}
          </View>
        ) : iAmKeeper ? (
          // terms only: the target, without a tally fabricated from absent seals
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            <Small color={colors.ink50}>Reaching for</Small>
            <HeadingItalic style={{ fontSize: 18 }}>
              {pact.goalTarget} {pact.goalUnit}
            </HeadingItalic>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            <HeadingItalic style={{ fontSize: 24 }}>
              {goalProgress(pact, checkIns)}
            </HeadingItalic>
            <Body color={colors.ink50}>
              of {pact.goalTarget} {pact.goalUnit}
            </Body>
          </View>
        )}

        {/* signature row */}
        <View
          style={{
            borderTopWidth: 1.2,
            borderTopColor: colors.lineSoft,
            borderStyle: 'dashed',
            paddingTop: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            <Small color={colors.ink50}>{iAmKeeper ? 'You witness' : 'Witnessed by'}</Small>
            <HeadingItalic style={{ fontSize: 16, lineHeight: 20 }}>
              {(iAmKeeper ? creator?.username : keeper?.username) ?? 'a friend'}
            </HeadingItalic>
          </View>
          {pact.status !== 'active' ? (
            <StatusChip status={pact.status} />
          ) : iAmKeeper ? (
            <Small color={colors.ink50}>
              {formatShort(pact.startDate)} → {formatShort(pact.endDate)}
            </Small>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}
