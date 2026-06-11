import {
  Fraunces_600SemiBold,
  Fraunces_600SemiBold_Italic,
  Fraunces_700Bold,
  Fraunces_900Black,
  Fraunces_900Black_Italic,
} from '@expo-google-fonts/fraunces';
import {
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from '@expo-google-fonts/quicksand';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Paper } from '@/components/ui/paper';
import { syncDailyReminder } from '@/lib/reminders';
import { useHydrated } from '@/lib/use-hydrated';
import { useAuth } from '@/store/use-auth';
import { useStore } from '@/store/use-store';

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
    Fraunces_700Bold,
    Fraunces_900Black,
    Fraunces_900Black_Italic,
    Quicksand_500Medium,
    Quicksand_600SemiBold,
    Quicksand_700Bold,
  });
  const hydrated = useHydrated();
  const signedIn = useAuth((s) => s.signedIn);
  const runReconcile = useStore((s) => s.runReconcile);

  const ready = fontsLoaded && hydrated;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Once signed in with data on board: run the local "scheduler" pass
  // (missed days, breaches, completions) and sync the daily reminder.
  useEffect(() => {
    if (!ready || !signedIn) return;
    runReconcile();
    const { users, meId, remindersEnabled } = useStore.getState();
    const me = users.find((u) => u.id === meId);
    if (me) void syncDailyReminder(remindersEnabled, me.notificationTime);
  }, [ready, signedIn, runReconcile]);

  // Day rollover while the app stays alive: re-run the scheduler pass on
  // foreground. runReconcile self-dedupes per (day, grace-window) stamp.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && useAuth.getState().signedIn) {
        useStore.getState().runReconcile();
      }
    });
    return () => sub.remove();
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Paper>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        >
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="index" />
            <Stack.Screen
              name="create"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="pact/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="inbox" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
            <Stack.Screen name="login" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="register" options={{ animation: 'slide_from_right' }} />
          </Stack.Protected>
        </Stack>
      </Paper>
    </GestureHandlerRootView>
  );
}
