import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AuthBackButton, AuthInput, SocialButtons } from '@/components/auth-bits';
import { Paper } from '@/components/ui/paper';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Body, BodyBold, BodySemi, Display, Kicker } from '@/components/ui/type';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/store/use-auth';
import { useStore } from '@/store/use-store';
import { colors, radii, shadows } from '@/theme/tokens';

export default function Login() {
  const insets = useSafeAreaInsets();
  const signIn = useAuth((s) => s.signIn);
  const signInSocial = useAuth((s) => s.signInSocial);
  const updateProfile = useStore((s) => s.updateProfile);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
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
      const profile = await signIn(email.trim().toLowerCase(), password);
      // sync the server profile into the local store
      updateProfile({
        username: profile.username,
        email: profile.email,
        timezone: profile.timezone,
        notificationTime: profile.notificationTime,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const social = async (provider: 'google' | 'apple') => {
    try {
      await signInSocial(provider);
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
          gap: 22,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthBackButton />

        <Animated.View entering={FadeInDown.delay(80).duration(450)} style={{ gap: 6 }}>
          <Kicker color={colors.ink50}>Resume your contracts</Kicker>
          <Display style={{ fontSize: 40, lineHeight: 46 }}>Welcome back.</Display>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(450)} style={{ gap: 14 }}>
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
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
            onSubmitEditing={submit}
            error={error ?? undefined}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(260).duration(450)} style={{ gap: 14 }}>
          <PressableScale
            onPress={submit}
            style={{
              backgroundColor: colors.ink,
              borderRadius: radii.pill,
              paddingVertical: 17,
              alignItems: 'center',
              boxShadow: shadows.raised,
            }}
          >
            <BodyBold style={{ color: colors.paper, fontSize: 16 }}>Sign in</BodyBold>
          </PressableScale>

          <SocialButtons onSocial={social} />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(340).duration(450)}
          style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 6 }}
        >
          <Body color={colors.ink50}>New here?</Body>
          <PressableScale onPress={() => router.replace('/register')} haptic={false}>
            <BodySemi color={colors.roseDeep}>Draft your first pact</BodySemi>
          </PressableScale>
        </Animated.View>

        <Body align="center" color={colors.ink30} style={{ fontSize: 12.5 }}>
          Sessions are sealed and stored securely.
        </Body>
      </ScrollView>
    </Paper>
  );
}
