import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ScreenHeader } from '@/components/screen-header';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { Paper } from '@/components/ui/paper';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Sheet } from '@/components/ui/sheet';
import { Body, BodyBold, BodySemi, Heading, Kicker, Small } from '@/components/ui/type';
import { apiEnabled, updateMe } from '@/lib/api';
import { syncDailyReminder } from '@/lib/reminders';
import { useAuth } from '@/store/use-auth';
import { useMe, useStore } from '@/store/use-store';
import { colors, fonts, radii, shadows } from '@/theme/tokens';

const TIMES = ['06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '12:00', '18:00', '20:00', '21:00'];

const ZONES = [
  'Europe/Oslo',
  'Europe/Stockholm',
  'Europe/Copenhagen',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Australia/Sydney',
];

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Oslo';
  } catch {
    return 'Europe/Oslo';
  }
}

function Section({ title, children, delay = 0 }: { title: string; children: React.ReactNode; delay?: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(420)} style={{ gap: 10 }}>
      <Kicker color={colors.ink50}>{title}</Kicker>
      {children}
    </Animated.View>
  );
}

export default function Settings() {
  const insets = useSafeAreaInsets();
  const me = useMe();
  const updateProfile = useStore((s) => s.updateProfile);
  const remindersEnabled = useStore((s) => s.remindersEnabled);
  const setRemindersEnabled = useStore((s) => s.setRemindersEnabled);
  const resetLocal = useStore((s) => s.resetLocal);
  const signOut = useAuth((s) => s.signOut);

  const [username, setUsername] = useState(me.username);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const zones = [detectTimezone(), ...ZONES.filter((z) => z !== detectTimezone())];

  // In API mode, mirror profile edits to the server — otherwise the launch
  // sync (fetchMe in _layout) reverts them on the next start.
  const syncProfileToServer = (patch: {
    username?: string;
    timezone?: string;
    notificationTime?: string;
  }) => {
    if (!apiEnabled) return;
    const token = useAuth.getState().token;
    if (token) void updateMe(token, patch).catch(() => {});
  };

  const saveUsername = () => {
    const clean = username.trim().toLowerCase();
    if (clean.length >= 3 && clean.length <= 50) {
      setUsernameError(null);
      updateProfile({ username: clean });
      syncProfileToServer({ username: clean });
      setUsername(clean);
    } else {
      setUsernameError('Usernames are 3–50 characters.');
    }
  };

  const pickTime = (time: string) => {
    updateProfile({ notificationTime: time });
    syncProfileToServer({ notificationTime: time });
    void syncDailyReminder(remindersEnabled, time);
  };

  const toggleReminders = () => {
    const next = !remindersEnabled;
    setRemindersEnabled(next);
    void syncDailyReminder(next, me.notificationTime);
  };

  return (
    <Paper>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 22,
          paddingBottom: 60,
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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

        <ScreenHeader kicker="The fine print" title="Settings" />

        <Section title="Username" delay={100}>
          <TextInput
            value={username}
            onChangeText={setUsername}
            onBlur={saveUsername}
            onSubmitEditing={saveUsername}
            autoCapitalize="none"
            maxLength={50}
            style={{
              fontFamily: fonts.bodySemi,
              fontSize: 16,
              color: colors.ink,
              backgroundColor: colors.card,
              borderWidth: 1.5,
              borderColor: colors.ink,
              borderRadius: radii.md,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          />
          {usernameError ? (
            <Small color={colors.failed}>{usernameError}</Small>
          ) : (
            <Small color={colors.ink50}>Lowercase, 3–50 characters.</Small>
          )}
        </Section>

        <Section title="Daily reminder" delay={160}>
          <PressableScale
            onPress={toggleReminders}
            accessibilityRole="switch"
            accessibilityState={{ checked: remindersEnabled }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 16,
              borderRadius: radii.lg,
              borderWidth: 1.5,
              borderColor: remindersEnabled ? colors.ink : colors.line,
              backgroundColor: remindersEnabled ? colors.butterSoft : 'transparent',
            }}
          >
            <View style={{ flex: 1 }}>
              <BodyBold color={remindersEnabled ? colors.ink : colors.ink50}>
                {remindersEnabled ? 'Reminders on' : 'Reminders off'}
              </BodyBold>
              <Small color={colors.ink50}>
                A nudge at {me.notificationTime} in {me.timezone}.
              </Small>
            </View>
            <View
              style={{
                width: 46,
                height: 28,
                borderRadius: 14,
                backgroundColor: remindersEnabled ? colors.ink : colors.lineSoft,
                padding: 3,
                alignItems: remindersEnabled ? 'flex-end' : 'flex-start',
              }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.card }} />
            </View>
          </PressableScale>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TIMES.map((t) => {
              const on = me.notificationTime === t;
              return (
                <PressableScale
                  key={t}
                  onPress={() => pickTime(t)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: radii.pill,
                    backgroundColor: on ? colors.ink : 'transparent',
                    borderWidth: 1.4,
                    borderColor: on ? colors.ink : colors.line,
                  }}
                >
                  <BodySemi color={on ? colors.paper : colors.ink50} style={{ fontSize: 13 }}>
                    {t}
                  </BodySemi>
                </PressableScale>
              );
            })}
          </View>
        </Section>

        <Section title="Timezone" delay={220}>
          <Small color={colors.ink50}>
            Deadlines close at midnight, plus a 30-minute grace period. Note:
            until the server schedulers land, deadlines follow your device clock.
          </Small>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {zones.map((z) => {
              const on = me.timezone === z;
              return (
                <PressableScale
                  key={z}
                  onPress={() => {
                    updateProfile({ timezone: z });
                    syncProfileToServer({ timezone: z });
                  }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: radii.pill,
                    backgroundColor: on ? colors.ink : 'transparent',
                    borderWidth: 1.4,
                    borderColor: on ? colors.ink : colors.line,
                  }}
                >
                  <BodySemi color={on ? colors.paper : colors.ink50} style={{ fontSize: 13 }}>
                    {z.split('/')[1]?.replace('_', ' ') ?? z}
                  </BodySemi>
                </PressableScale>
              );
            })}
          </View>
        </Section>

        <Section title="Danger zone" delay={280}>
          <PressableScale
            onPress={() => setConfirmReset(true)}
            style={{
              borderWidth: 1.5,
              borderColor: colors.ink,
              backgroundColor: colors.card,
              borderRadius: radii.pill,
              paddingVertical: 14,
              alignItems: 'center',
              boxShadow: shadows.card,
            }}
          >
            <BodySemi>{apiEnabled ? 'Clear local data' : 'Reset demo data'}</BodySemi>
          </PressableScale>
          <PressableScale
            onPress={() => {
              void syncDailyReminder(false, me.notificationTime);
              signOut();
            }}
            style={{
              borderWidth: 1.5,
              borderColor: colors.failed,
              borderRadius: radii.pill,
              paddingVertical: 14,
              alignItems: 'center',
            }}
          >
            <BodySemi color={colors.failed}>Sign out</BodySemi>
          </PressableScale>
        </Section>

        <Body color={colors.ink30} align="center" style={{ fontSize: 12.5 }}>
          {apiEnabled
            ? 'My Pact · pacts live on this device until the server learns them'
            : 'My Pact · demo build · data lives on this device'}
        </Body>
      </ScrollView>

      <Sheet open={confirmReset} onClose={() => setConfirmReset(false)}>
        <View style={{ padding: 24, paddingBottom: 44, gap: 14 }}>
          <Heading>Reset everything?</Heading>
          <Body color={colors.ink70}>
            {apiEnabled
              ? 'Pacts, check-ins, friends and notifications on this device are erased. This cannot be undone.'
              : 'Pacts, check-ins, friends and notifications return to the demo seed. This cannot be undone.'}
          </Body>
          <PressableScale
            onPress={() => {
              resetLocal();
              // only domain data is cleared — the signed-in account keeps
              // its profile (the bare state would show '@you' until relaunch)
              if (apiEnabled) {
                updateProfile({
                  username: me.username,
                  email: me.email,
                  timezone: me.timezone,
                  notificationTime: me.notificationTime,
                });
              }
              setConfirmReset(false);
              router.back();
            }}
            style={{
              backgroundColor: colors.failed,
              borderRadius: radii.pill,
              paddingVertical: 15,
              alignItems: 'center',
            }}
          >
            <BodyBold style={{ color: colors.white }}>Yes, start fresh</BodyBold>
          </PressableScale>
          <PressableScale
            onPress={() => setConfirmReset(false)}
            style={{
              borderWidth: 1.5,
              borderColor: colors.ink,
              borderRadius: radii.pill,
              paddingVertical: 15,
              alignItems: 'center',
            }}
          >
            <BodySemi>Keep my record</BodySemi>
          </PressableScale>
        </View>
      </Sheet>
    </Paper>
  );
}
