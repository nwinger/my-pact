import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { Paper } from '@/components/ui/paper';
import { CheckIcon, CloseIcon, MutualIcon, RepeatIcon, TargetIcon } from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/pressable-scale';
import {
  Body,
  BodyBold,
  BodySemi,
  Display,
  Kicker,
  Small,
} from '@/components/ui/type';
import { useFriends, useStore } from '@/store/use-store';
import type { PactType } from '@/store/types';
import { fonts, colors, radii, shadows } from '@/theme/tokens';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DURATIONS = [
  { days: 21, label: '21 days' },
  { days: 30, label: '30 days' },
  { days: 60, label: '60 days' },
  { days: 90, label: '90 days' },
];

function FieldLabel({ children }: { children: string }) {
  return <Kicker color={colors.ink50}>{children}</Kicker>;
}

export default function CreatePact() {
  const insets = useSafeAreaInsets();
  const friends = useFriends();
  const createPact = useStore((s) => s.createPact);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<PactType>('frequency');
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [goalTarget, setGoalTarget] = useState('30');
  const [goalUnit, setGoalUnit] = useState('km');
  const [keeperId, setKeeperId] = useState<string | null>(friends[0]?.user.id ?? null);
  const [isMutual, setIsMutual] = useState(false);
  const [duration, setDuration] = useState(30);

  const valid = useMemo(() => {
    if (title.trim().length < 5) return false;
    if (!keeperId) return false;
    if (type === 'frequency' && days.length === 0) return false;
    if (type === 'goal' && (!Number(goalTarget) || !goalUnit.trim())) return false;
    return true;
  }, [title, keeperId, type, days, goalTarget, goalUnit]);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const submit = () => {
    if (!valid || !keeperId) return;
    const pact = createPact({
      title: title.trim(),
      type,
      daysOfWeek: type === 'frequency' ? days : undefined,
      goalTarget: type === 'goal' ? Number(goalTarget) : undefined,
      goalUnit: type === 'goal' ? goalUnit.trim() : undefined,
      keeperUserId: keeperId,
      isMutual,
      durationDays: duration,
    });
    router.dismiss();
    router.push(`/pact/${pact.id}`);
  };

  const inputStyle = {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
  } as const;

  return (
    <Paper>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 22,
          paddingBottom: 60,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Kicker color={colors.ink50}>A new contract</Kicker>
            <Display style={{ fontSize: 32, lineHeight: 38 }}>Draft a pact</Display>
          </View>
          <PressableScale
            onPress={() => router.dismiss()}
            accessibilityLabel="Close"
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
            <CloseIcon size={17} strokeWidth={2.4} />
          </PressableScale>
        </View>

        {/* title */}
        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={{ gap: 8 }}>
          <FieldLabel>I hereby commit to…</FieldLabel>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Morning run before work"
            placeholderTextColor={colors.ink30}
            maxLength={100}
            style={inputStyle}
          />
          {title.length > 0 && title.trim().length < 5 && (
            <Small color={colors.failed}>A pact deserves at least 5 characters.</Small>
          )}
        </Animated.View>

        {/* type */}
        <Animated.View entering={FadeInDown.delay(140).duration(400)} style={{ gap: 8 }}>
          <FieldLabel>The shape of it</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(
              [
                { key: 'frequency', label: 'Recurring', sub: 'check in on set days', Icon: RepeatIcon },
                { key: 'goal', label: 'A goal', sub: 'log progress to a target', Icon: TargetIcon },
              ] as const
            ).map(({ key, label, sub, Icon }) => {
              const on = type === key;
              return (
                <PressableScale
                  key={key}
                  onPress={() => setType(key)}
                  style={{
                    flex: 1,
                    gap: 6,
                    padding: 16,
                    borderRadius: radii.lg,
                    borderWidth: 1.5,
                    borderColor: on ? colors.ink : colors.line,
                    backgroundColor: on ? colors.butterSoft : 'transparent',
                    boxShadow: on ? shadows.card : undefined,
                  }}
                >
                  <Icon size={20} strokeWidth={2.2} color={on ? colors.ink : colors.ink50} />
                  <BodyBold color={on ? colors.ink : colors.ink50}>{label}</BodyBold>
                  <Small color={colors.ink50}>{sub}</Small>
                </PressableScale>
              );
            })}
          </View>
        </Animated.View>

        {/* schedule or goal */}
        <Animated.View layout={LinearTransition.springify().damping(18)} style={{ gap: 8 }}>
          {type === 'frequency' ? (
            <Animated.View entering={FadeInDown.duration(350)} style={{ gap: 10 }}>
              <FieldLabel>On these days</FieldLabel>
              <View style={{ flexDirection: 'row', gap: 7 }}>
                {DAY_LABELS.map((d, i) => {
                  const on = days.includes(i);
                  return (
                    <PressableScale
                      key={i}
                      onPress={() => toggleDay(i)}
                      scaleTo={0.85}
                      style={{
                        flex: 1,
                        aspectRatio: 1,
                        maxWidth: 46,
                        borderRadius: radii.pill,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: on ? colors.ink : 'transparent',
                        borderWidth: 1.4,
                        borderColor: on ? colors.ink : colors.line,
                      }}
                    >
                      <BodySemi color={on ? colors.paper : colors.ink50}>{d}</BodySemi>
                    </PressableScale>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <PressableScale onPress={() => setDays(ALL_DAYS)} haptic={false}>
                  <Small color={colors.roseDeep}>Every day</Small>
                </PressableScale>
                <Small color={colors.ink30}>·</Small>
                <PressableScale onPress={() => setDays(WEEKDAYS)} haptic={false}>
                  <Small color={colors.roseDeep}>Weekdays</Small>
                </PressableScale>
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.duration(350)} style={{ gap: 10 }}>
              <FieldLabel>Reaching for</FieldLabel>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  value={goalTarget}
                  onChangeText={setGoalTarget}
                  keyboardType="numeric"
                  placeholder="30"
                  placeholderTextColor={colors.ink30}
                  style={[inputStyle, { flex: 1 }]}
                />
                <TextInput
                  value={goalUnit}
                  onChangeText={setGoalUnit}
                  placeholder="km, books, hours…"
                  placeholderTextColor={colors.ink30}
                  maxLength={20}
                  style={[inputStyle, { flex: 2 }]}
                />
              </View>
            </Animated.View>
          )}
        </Animated.View>

        {/* duration */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={{ gap: 8 }}>
          <FieldLabel>For the next</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {DURATIONS.map((d) => {
              const on = duration === d.days;
              return (
                <PressableScale
                  key={d.days}
                  onPress={() => setDuration(d.days)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: radii.pill,
                    alignItems: 'center',
                    backgroundColor: on ? colors.ink : 'transparent',
                    borderWidth: 1.4,
                    borderColor: on ? colors.ink : colors.line,
                  }}
                >
                  <BodySemi color={on ? colors.paper : colors.ink50} style={{ fontSize: 13 }}>
                    {d.label}
                  </BodySemi>
                </PressableScale>
              );
            })}
          </View>
        </Animated.View>

        {/* keeper */}
        <Animated.View entering={FadeInDown.delay(260).duration(400)} style={{ gap: 10 }}>
          <FieldLabel>Witnessed by</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {friends.map(({ user }) => {
              const on = keeperId === user.id;
              return (
                <PressableScale
                  key={user.id}
                  onPress={() => setKeeperId(user.id)}
                  style={{
                    alignItems: 'center',
                    gap: 6,
                    padding: 12,
                    borderRadius: radii.lg,
                    borderWidth: 1.5,
                    borderColor: on ? colors.ink : colors.line,
                    backgroundColor: on ? colors.blushSoft : 'transparent',
                    minWidth: 86,
                  }}
                >
                  <Avatar user={user} size={44} />
                  <BodySemi style={{ fontSize: 13 }} color={on ? colors.ink : colors.ink50}>
                    {user.username}
                  </BodySemi>
                  {on && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: colors.ink,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CheckIcon size={10} color={colors.paper} strokeWidth={3} />
                    </View>
                  )}
                </PressableScale>
              );
            })}
          </ScrollView>

          {/* mutual toggle */}
          <PressableScale
            onPress={() => setIsMutual((m) => !m)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 16,
              borderRadius: radii.lg,
              borderWidth: 1.5,
              borderColor: isMutual ? colors.ink : colors.line,
              backgroundColor: isMutual ? colors.periwinkleSoft : 'transparent',
            }}
          >
            <MutualIcon size={20} strokeWidth={2.2} color={isMutual ? colors.ink : colors.ink50} />
            <View style={{ flex: 1 }}>
              <BodyBold color={isMutual ? colors.ink : colors.ink50}>Make it mutual</BodyBold>
              <Small color={colors.ink50}>You both commit, you both check in.</Small>
            </View>
            <View
              style={{
                width: 46,
                height: 28,
                borderRadius: 14,
                backgroundColor: isMutual ? colors.ink : colors.lineSoft,
                padding: 3,
                alignItems: isMutual ? 'flex-end' : 'flex-start',
              }}
            >
              <View
                style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.card }}
              />
            </View>
          </PressableScale>
        </Animated.View>

        {/* submit */}
        <Animated.View entering={FadeInDown.delay(320).duration(400)} style={{ gap: 10 }}>
          <PressableScale
            onPress={submit}
            disabled={!valid}
            style={{
              backgroundColor: valid ? colors.seal : colors.lineSoft,
              borderRadius: radii.pill,
              paddingVertical: 18,
              alignItems: 'center',
              boxShadow: valid ? shadows.seal : undefined,
            }}
          >
            <BodyBold style={{ color: valid ? colors.white : colors.ink30, fontSize: 16 }}>
              Seal the pact
            </BodyBold>
          </PressableScale>
          <Body align="center" color={colors.ink50} style={{ fontSize: 13 }}>
            Your keeper is notified the moment you miss a day.
          </Body>
        </Animated.View>
      </ScrollView>
    </Paper>
  );
}
