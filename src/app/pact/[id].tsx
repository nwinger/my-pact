import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { GoalLogSheet } from '@/components/goal-log-sheet';
import { WeekStrip } from '@/components/week-strip';
import { Paper } from '@/components/ui/paper';
import { Avatar } from '@/components/ui/avatar';
import { Sheet } from '@/components/ui/sheet';
import { StatusChip } from '@/components/ui/chip';
import {
  CalendarIcon,
  ChevronLeftIcon,
  CheckIcon,
  CloseIcon,
  FlameIcon,
  MutualIcon,
  QuillIcon,
  TargetIcon,
} from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ProgressRing } from '@/components/ui/progress-ring';
import { SealButton } from '@/components/ui/seal-button';
import {
  Body,
  BodyBold,
  BodySemi,
  Display,
  Heading,
  HeadingItalic,
  Kicker,
  Small,
} from '@/components/ui/type';
import { daysUntil, formatShort, relativeLabel, todayKey } from '@/lib/dates';
import {
  completedCount,
  currentStreak,
  goalProgress,
  hasCheckedInOn,
  isDueToday,
  lastSevenDays,
  progressRatio,
} from '@/lib/streaks';
import { useMe, useStore, useUser } from '@/store/use-store';
import { colors, radii, shadows, ticketTints } from '@/theme/tokens';

export default function PactDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const pact = useStore((s) => s.pacts.find((p) => p.id === id));
  const checkIns = useStore((s) => s.checkIns);
  const checkIn = useStore((s) => s.checkIn);
  const cancelPact = useStore((s) => s.cancelPact);
  const me = useMe();
  const keeper = useUser(pact?.keeperUserId);
  const creator = useUser(pact?.creatorUserId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);

  const history = useMemo(
    () =>
      checkIns
        .filter((c) => c.pactId === pact?.id)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [checkIns, pact?.id]
  );

  // reachable via stale deep links / notifications after a reset or sign-out
  if (!pact) {
    return (
      <Paper>
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 26 }}
        >
          <Heading>Pact not found</Heading>
          <Body color={colors.ink70} align="center">
            This pact is no longer on the books.
          </Body>
          <PressableScale
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={{
              marginTop: 10,
              borderWidth: 1.5,
              borderColor: colors.ink,
              borderRadius: radii.pill,
              paddingHorizontal: 24,
              paddingVertical: 13,
            }}
          >
            <BodySemi>Back to the shelf</BodySemi>
          </PressableScale>
        </View>
      </Paper>
    );
  }

  const iAmCreator = pact.creatorUserId === me.id;

  const tint = ticketTints[pact.tintIndex % ticketTints.length];
  const ratio = progressRatio(pact, checkIns);
  const streak = currentStreak(pact, checkIns);
  const done = hasCheckedInOn(checkIns, pact, todayKey());
  const due = isDueToday(pact);
  const remaining = daysUntil(pact.endDate);

  return (
    <Paper>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 22,
          paddingBottom: 80,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <PressableScale
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              borderWidth: 1.5,
              borderColor: colors.ink,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeftIcon size={20} strokeWidth={2.2} />
          </PressableScale>
          <StatusChip status={pact.status} />
        </View>

        {/* contract sheet */}
        <Animated.View
          entering={FadeInDown.delay(80).duration(500)}
          style={{
            backgroundColor: colors.card,
            borderWidth: 1.5,
            borderColor: colors.ink,
            borderRadius: radii.xl,
            overflow: 'hidden',
            boxShadow: shadows.raised,
          }}
        >
          <View
            style={{
              backgroundColor: tint.base,
              borderBottomWidth: 1.5,
              borderBottomColor: colors.ink,
              padding: 20,
              gap: 10,
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
                  ? `Goal pact · ${pact.goalTarget} ${pact.goalUnit}`
                  : pact.isMutual
                    ? 'Mutual pact'
                    : (pact.daysOfWeek?.length ?? 0) === 7
                      ? 'Daily pact'
                      : 'Weekly pact'}
              </Kicker>
            </View>
            <Display style={{ fontSize: 30, lineHeight: 35 }}>{pact.title}</Display>
            {pact.description ? <Body color={colors.ink70}>{pact.description}</Body> : null}
          </View>

          <View style={{ padding: 20, gap: 18 }}>
            {/* hero numbers */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              <ProgressRing ratio={ratio} size={86} stroke={7} delay={250}>
                <View style={{ alignItems: 'center' }}>
                  <BodyBold style={{ fontSize: 18 }}>{Math.round(ratio * 100)}%</BodyBold>
                  <Small color={colors.ink50} style={{ fontSize: 10 }}>
                    kept
                  </Small>
                </View>
              </ProgressRing>
              <View style={{ flex: 1, gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1, gap: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <FlameIcon size={16} color={colors.seal} fill={colors.seal} strokeWidth={1.4} />
                      <BodyBold style={{ fontSize: 18 }}>{streak}</BodyBold>
                    </View>
                    <Small color={colors.ink50}>streak</Small>
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <BodyBold style={{ fontSize: 18 }}>
                      {pact.type === 'goal'
                        ? `${goalProgress(pact, checkIns)}`
                        : completedCount(pact, checkIns)}
                    </BodyBold>
                    <Small color={colors.ink50}>
                      {pact.type === 'goal' ? `of ${pact.goalTarget} ${pact.goalUnit}` : 'seals'}
                    </Small>
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <BodyBold style={{ fontSize: 18 }}>
                      {remaining >= 0 ? remaining : 0}
                    </BodyBold>
                    <Small color={colors.ink50}>days left</Small>
                  </View>
                </View>
              </View>
            </View>

            {/* last 7 days */}
            <View style={{ gap: 8 }}>
              <Kicker color={colors.ink50}>This week</Kicker>
              <WeekStrip cells={lastSevenDays(pact, checkIns)} />
            </View>

            {/* signature block */}
            <View
              style={{
                borderTopWidth: 1.2,
                borderColor: colors.lineSoft,
                borderStyle: 'dashed',
                paddingTop: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              {(iAmCreator ? keeper : creator) && (
                <Avatar user={(iAmCreator ? keeper : creator)!} size={40} />
              )}
              <View style={{ flex: 1 }}>
                <Small color={colors.ink50}>
                  {iAmCreator ? 'Witnessed & kept by' : 'You witness'}
                </Small>
                <HeadingItalic style={{ fontSize: 18 }}>
                  {iAmCreator ? keeper?.username : creator?.username}
                </HeadingItalic>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <CalendarIcon size={13} color={colors.ink50} strokeWidth={2} />
                  <Small color={colors.ink50}>
                    {formatShort(pact.startDate)} → {formatShort(pact.endDate)}
                  </Small>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* today action — only the creator checks in */}
        {iAmCreator && pact.status === 'active' && due && (
          <Animated.View
            entering={FadeInDown.delay(220).duration(450)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              backgroundColor: done ? colors.mintSoft : colors.ink,
              borderRadius: radii.lg,
              borderWidth: 1.5,
              borderColor: colors.ink,
              padding: 18,
              boxShadow: shadows.card,
            }}
          >
            <View style={{ flex: 1 }}>
              <BodyBold style={{ color: done ? colors.ink : colors.paper, fontSize: 16 }}>
                {done ? 'Sealed for today' : 'Today needs your seal'}
              </BodyBold>
              <Small style={{ color: done ? colors.ink70 : 'rgba(247,241,230,0.6)' }}>
                {done
                  ? `${keeper?.username} has been told. Rest easy.`
                  : 'Closes at midnight + 30 min grace.'}
              </Small>
            </View>
            <SealButton
              done={done}
              onSeal={() => {
                if (pact.type === 'goal') setGoalOpen(true);
                else checkIn(pact.id);
              }}
              size={50}
            />
          </Animated.View>
        )}

        {/* actions */}
        <Animated.View entering={FadeInDown.delay(300).duration(450)} style={{ gap: 10 }}>
          <PressableScale
            onPress={() => setHistoryOpen(true)}
            style={{
              borderWidth: 1.5,
              borderColor: colors.ink,
              backgroundColor: colors.card,
              borderRadius: radii.pill,
              paddingVertical: 14,
              alignItems: 'center',
            }}
          >
            <BodySemi>Check-in history · {history.length}</BodySemi>
          </PressableScale>
          {iAmCreator && pact.status === 'active' && (
            <PressableScale
              onPress={() => setConfirmCancel(true)}
              style={{ alignItems: 'center', paddingVertical: 8 }}
            >
              <BodySemi color={colors.failed}>Break the pact…</BodySemi>
            </PressableScale>
          )}
        </Animated.View>
      </ScrollView>

      {/* history sheet */}
      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)}>
        <ScrollView style={{ paddingHorizontal: 24 }} contentContainerStyle={{ paddingBottom: 40, gap: 4 }}>
          <View style={{ paddingVertical: 10, gap: 2 }}>
            <Kicker color={colors.ink50}>The ledger</Kicker>
            <Heading>Check-in history</Heading>
          </View>
          {history.map((c) => (
            <View
              key={c.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 11,
                borderBottomWidth: 1,
                borderBottomColor: colors.lineSoft,
              }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: c.status === 'completed' ? colors.seal : colors.failedSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {c.status === 'completed' ? (
                  <CheckIcon size={14} color={colors.white} strokeWidth={3} />
                ) : (
                  <CloseIcon size={12} color={colors.failed} strokeWidth={2.6} />
                )}
              </View>
              <BodySemi style={{ flex: 1 }}>{relativeLabel(c.date)}</BodySemi>
              {c.progressValue ? (
                <Small color={colors.ink50}>
                  +{c.progressValue} {pact.goalUnit}
                </Small>
              ) : (
                <Small color={c.status === 'completed' ? colors.active : colors.failed}>
                  {c.status === 'completed' ? 'sealed' : 'missed'}
                </Small>
              )}
            </View>
          ))}
        </ScrollView>
      </Sheet>

      {pact.type === 'goal' && (
        <GoalLogSheet
          pact={pact}
          open={goalOpen}
          onClose={() => setGoalOpen(false)}
          onLog={(v) => checkIn(pact.id, { progressValue: v })}
        />
      )}

      {/* cancel confirm sheet */}
      <Sheet open={confirmCancel} onClose={() => setConfirmCancel(false)}>
        <View style={{ padding: 24, paddingBottom: 44, gap: 14 }}>
          <Heading>Break this pact?</Heading>
          <Body color={colors.ink70}>
            This is irreversible — the contract is voided and {keeper?.username} will be
            told. Your check-in history stays on the record.
          </Body>
          <PressableScale
            onPress={() => {
              cancelPact(pact.id);
              setConfirmCancel(false);
            }}
            style={{
              backgroundColor: colors.failed,
              borderRadius: radii.pill,
              paddingVertical: 15,
              alignItems: 'center',
            }}
          >
            <BodyBold style={{ color: colors.white }}>Yes, break it</BodyBold>
          </PressableScale>
          <PressableScale
            onPress={() => setConfirmCancel(false)}
            style={{
              borderWidth: 1.5,
              borderColor: colors.ink,
              borderRadius: radii.pill,
              paddingVertical: 15,
              alignItems: 'center',
            }}
          >
            <BodySemi>Keep going</BodySemi>
          </PressableScale>
        </View>
      </Sheet>
    </Paper>
  );
}
