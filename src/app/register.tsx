import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AuthBackButton, AuthInput, SocialButtons } from '@/components/auth-bits';
import { Paper } from '@/components/ui/paper';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Body, BodyBold, BodySemi, Display, Kicker, Small } from '@/components/ui/type';
import { apiEnabled, errorMessage } from '@/lib/api';
import { useAuth } from '@/store/use-auth';
import { useStore } from '@/store/use-store';
import { colors, radii, shadows } from '@/theme/tokens';

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Oslo';
  } catch {
    return 'Europe/Oslo';
  }
}

export default function Register() {
  const insets = useSafeAreaInsets();
  const signUp = useAuth((s) => s.signUp);
  const signInSocial = useAuth((s) => s.signInSocial);
  const updateProfile = useStore((s) => s.updateProfile);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (username.trim().length < 3) {
      setError('Usernames are 3–50 characters.');
      return;
    }
    if (!email.includes('@')) {
      setError('That email doesn’t look right.');
      return;
    }
    if (password.length < 6) {
      setError('Passwords are at least 6 characters.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const profile = await signUp({
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        password,
        timezone: detectTimezone(),
      });
      // registration is server-side in API mode; sync the resulting profile
      // (offline demo mode keeps writing the local values directly)
      updateProfile(
        profile
          ? {
              username: profile.username,
              email: profile.email,
              timezone: profile.timezone,
              notificationTime: profile.notificationTime,
            }
          : {
              username: username.trim().toLowerCase(),
              email: email.trim().toLowerCase(),
              timezone: detectTimezone(),
            }
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const social = async (provider: 'google' | 'apple') => {
    try {
      await signInSocial(provider);
      if (!apiEnabled) updateProfile({ email: 'you@mypact.app', timezone: detectTimezone() });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Paper>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 26,
          paddingBottom: 40,
          gap: 20,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthBackButton />

        <Animated.View entering={FadeInDown.delay(80).duration(450)} style={{ gap: 6 }}>
          <Kicker color={colors.ink50}>Put your name to it</Kicker>
          <Display style={{ fontSize: 40, lineHeight: 46 }}>Sign yourself up.</Display>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(450)} style={{ gap: 14 }}>
          <AuthInput
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="how friends will know you"
            autoCapitalize="none"
            maxLength={50}
          />
          <AuthInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@mypact.app"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <AuthInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="at least 6 characters"
            secureTextEntry
            autoComplete="new-password"
            onSubmitEditing={submit}
            error={error ?? undefined}
          />
          <Small color={colors.ink50}>
            Your timezone ({detectTimezone()}) is detected automatically — deadlines and
            reminders follow it.
          </Small>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(260).duration(450)} style={{ gap: 14 }}>
          <PressableScale
            onPress={submit}
            style={{
              backgroundColor: colors.seal,
              borderRadius: radii.pill,
              paddingVertical: 17,
              alignItems: 'center',
              boxShadow: shadows.seal,
            }}
          >
            <BodyBold style={{ color: colors.white, fontSize: 16 }}>
              Sign the register
            </BodyBold>
          </PressableScale>

          <SocialButtons onSocial={social} />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(340).duration(450)}
          style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 6 }}
        >
          <Body color={colors.ink50}>Already signed?</Body>
          <PressableScale onPress={() => router.replace('/login')} haptic={false}>
            <BodySemi color={colors.roseDeep}>Sign in instead</BodySemi>
          </PressableScale>
        </Animated.View>

        <Body align="center" color={colors.ink30} style={{ fontSize: 12.5 }}>
          {apiEnabled
            ? 'Your account is inscribed on the server.'
            : 'Demo build — accounts live on this device only.'}
        </Body>
      </ScrollView>
    </Paper>
  );
}
