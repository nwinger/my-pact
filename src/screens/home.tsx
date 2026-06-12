import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Paper } from '@/components/ui/paper';
import { Avatar } from '@/components/ui/avatar';
import { BellIcon, FlameIcon, QuillIcon } from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SealButton } from '@/components/ui/seal-button';
import {
  Body,
  BodyBold,
  BodySemi,
  Display,
  DisplayItalic,
  Heading,
  HeadingItalic,
  Kicker,
  Small,
} from '@/components/ui/type';
import { gracePeriodKey, greetingForNow, todayKey } from '@/lib/dates';
import { currentStreak, hasAnyCheckInOn, hasCheckedInOn, isDueToday, isRequiredOn } from '@/lib/streaks';
import { ConfettiBurst } from '@/components/ui/confetti';
import { GoalLogSheet } from '@/components/goal-log-sheet';
import { useMe, useStore, useUnreadCount, useUser } from '@/store/use-store';
import { useTabs } from '@/store/use-tabs';
import type { Pact } from '@/store/types';
import { colors, radii, shadows, ticketTints } from '@/theme/tokens';

function TodayRow({
  pact,
  index,
  date,
  graceLabel,
}: {
  pact: Pact;
  index: number;
  /** defaults to today; the grace window passes yesterday */
  date?: string;
  graceLabel?: string;
}) {
  const checkIns = useStore((s) => s.checkIns);
  const checkIn = useStore((s) => s.checkIn);
  const keeper = useUser(pact.keeperUserId);
  const tint = ticketTints[pact.tintIndex % ticketTints.length];
  const targetDate = date ?? todayKey();
  const done = hasCheckedInOn(checkIns, pact, targetDate);
  const streak = currentStreak(pact, checkIns);
  const [sheetOpen, setSheetOpen] = useState(false);

  const seal = () => {
    // re-validate at press time: the grace window may have closed
    if (targetDate !== todayKey() && targetDate !== gracePeriodKey()) return;
    if (pact.type === 'goal') {
      setSheetOpen(true);
      return;
    }
    checkIn(pact.id, { date: targetDate });
  };

  return (
    <Animated.View entering={FadeInDown.delay(350 + index * 110).springify().damping(15)}>
      <PressableScale
        scaleTo={0.98}
        onPress={() => router.push(`/pact/${pact.id}`)}
        // contains the SealButton — must not render as a nested <button> on web
        accessibilityRole={undefined}
        accessibilityLabel={`Open ${pact.title}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          backgroundColor: colors.card,
          borderWidth: 1.5,
          borderColor: colors.ink,
          borderRadius: radii.lg,
          padding: 16,
          boxShadow: shadows.card,
        }}
      >
        <View
          style={{
            width: 10,
            alignSelf: 'stretch',
            borderRadius: 5,
            backgroundColor: tint.base,
            borderWidth: 1,
            borderColor: colors.ink,
          }}
        />
        <View style={{ flex: 1, gap: 3 }}>
          <Heading style={{ fontSize: 18, lineHeight: 22 }}>{pact.title}</Heading>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <QuillIcon size={13} color={graceLabel ? colors.overdue : colors.ink50} strokeWidth={2} />
            <Small color={graceLabel ? colors.overdue : colors.ink50}>
              {graceLabel ?? `${keeper?.username} is watching`}
            </Small>
            {streak > 1 && (
              <>
                <Small color={colors.ink30}>·</Small>
                <FlameIcon size={13} color={colors.seal} fill={colors.seal} strokeWidth={1.4} />
                <Small color={colors.ink70}>{streak}</Small>
              </>
            )}
          </View>
        </View>
        <SealButton done={done} onSeal={seal} />
      </PressableScale>
      {pact.type === 'goal' && (
        <GoalLogSheet
          pact={pact}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onLog={(v) => checkIn(pact.id, { progressValue: v, date: targetDate })}
        />
      )}
    </Animated.View>
  );
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const me = useMe();
  const pacts = useStore((s) => s.pacts);
  const checkIns = useStore((s) => s.checkIns);
  const unread = useUnreadCount();
  const setTab = useTabs((s) => s.setTab);

  const due = useMemo(
    () => pacts.filter((p) => p.creatorUserId === me.id && isDueToday(p)),
    [pacts, me.id]
  );
  const doneCount = due.filter((p) => hasCheckedInOn(checkIns, p, todayKey())).length;
  const allDone = due.length > 0 && doneCount === due.length;

  // 00:00–00:30: yesterday's unsealed required days are still open (grace period)
  const graceKey = gracePeriodKey();
  const grace = useMemo(() => {
    if (!graceKey) return [];
    return pacts.filter(
      (p) =>
        p.creatorUserId === me.id &&
        p.status === 'active' &&
        p.type === 'frequency' &&
        graceKey >= p.startDate &&
        graceKey <= p.endDate &&
        isRequiredOn(p, graceKey) &&
        !hasAnyCheckInOn(checkIns, p, graceKey)
    );
  }, [pacts, checkIns, me.id, graceKey]);

  // confetti the moment the last seal of the day lands
  const [celebrate, setCelebrate] = useState(false);
  const prevAllDone = useRef(allDone);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 1700);
      prevAllDone.current = allDone;
      return () => clearTimeout(t);
    }
    prevAllDone.current = allDone;
  }, [allDone]);

  const bestStreak = useMemo(
    () =>
      Math.max(
        0,
        ...pacts
          .filter((p) => p.creatorUserId === me.id && p.status === 'active')
          .map((p) => currentStreak(p, checkIns))
      ),
    [pacts, checkIns, me.id]
  );

  return (
    <Paper>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: insets.top + 18,
        paddingHorizontal: 22,
        paddingBottom: 140,
        gap: 18,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* masthead */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Animated.View entering={FadeInDown.duration(450)}>
          <Kicker color={colors.ink50}>{greetingForNow()},</Kicker>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Display style={{ fontSize: 36, lineHeight: 42 }}>{me.username}</Display>
            <DisplayItalic style={{ fontSize: 36, lineHeight: 42, color: colors.roseDeep }}>
              .
            </DisplayItalic>
          </View>
        </Animated.View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <PressableScale
            onPress={() => router.push('/inbox')}
            accessibilityLabel="Open inbox"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              borderWidth: 1.5,
              borderColor: colors.ink,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BellIcon size={20} strokeWidth={2} />
            {unread > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: colors.seal,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                }}
              >
                <Small style={{ color: colors.white, fontSize: 10.5 }}>{unread}</Small>
              </View>
            )}
          </PressableScale>
          <PressableScale onPress={() => setTab('profile')} accessibilityLabel="Profile">
            <Avatar user={me} size={44} />
          </PressableScale>
        </View>
      </View>

      {/* streak banner */}
      <Animated.View entering={FadeInDown.delay(140).duration(500)}>
        <View
          style={{
            backgroundColor: colors.ink,
            borderRadius: radii.lg,
            padding: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: shadows.raised,
            overflow: 'hidden',
          }}
        >
          <View style={{ gap: 4, flex: 1 }}>
            <Kicker style={{ color: 'rgba(247,241,230,0.55)' }}>Today’s ledger</Kicker>
            <HeadingItalic style={{ color: colors.paper, fontSize: 22 }}>
              {allDone
                ? 'Every seal pressed. Beautiful.'
                : pacts.every((p) => p.creatorUserId !== me.id)
                  ? 'No pacts yet. Make your first.'
                  : due.length === 0
                    ? 'A rest day. Breathe.'
                    : `${doneCount} of ${due.length} seals pressed`}
            </HeadingItalic>
          </View>
          <View
            style={{
              alignItems: 'center',
              gap: 2,
              backgroundColor: 'rgba(247,241,230,0.08)',
              borderRadius: radii.md,
              paddingVertical: 10,
              paddingHorizontal: 16,
            }}
          >
            <FlameIcon size={22} color={colors.butter} fill={colors.butter} strokeWidth={1.4} />
            <BodyBold style={{ color: colors.paper, fontSize: 20 }}>{bestStreak}</BodyBold>
            <Small style={{ color: 'rgba(247,241,230,0.55)', fontSize: 10.5 }}>day streak</Small>
          </View>
        </View>
        {celebrate && <ConfettiBurst />}
      </Animated.View>

      {/* grace period: yesterday is still open for 30 minutes */}
      {grace.length > 0 && (
        <View style={{ gap: 12 }}>
          <Animated.View entering={FadeInDown.delay(200).duration(450)}>
            <Heading color={colors.overdue}>Last call — grace period</Heading>
          </Animated.View>
          {grace.map((p, i) => (
            <TodayRow
              key={`grace-${p.id}`}
              pact={p}
              index={i}
              date={graceKey!}
              graceLabel="Yesterday · closes in minutes"
            />
          ))}
        </View>
      )}

      {/* due today */}
      <View style={{ gap: 12 }}>
        <Animated.View
          entering={FadeInDown.delay(260).duration(450)}
          style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
        >
          <Heading>Due today</Heading>
          <PressableScale onPress={() => setTab('pacts')} haptic={false}>
            <BodySemi color={colors.roseDeep}>All pacts →</BodySemi>
          </PressableScale>
        </Animated.View>

        {due.map((p, i) => (
          <TodayRow key={p.id} pact={p} index={i} />
        ))}

        {due.length === 0 && (
          <Animated.View
            entering={FadeInDown.delay(350).duration(500)}
            style={{
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: colors.line,
              borderRadius: radii.lg,
              padding: 28,
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Heading color={colors.ink50}>Nothing due</Heading>
            <Body color={colors.ink50} align="center">
              No pacts require a seal today. Start a new one with the + below.
            </Body>
          </Animated.View>
        )}
      </View>
    </ScrollView>
    </Paper>
  );
}
