import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

/**
 * Local stand-in for the personalized-reminder scheduler: one daily local
 * notification at the user's notificationTime. Web silently no-ops; on
 * device this works in dev builds and iOS Expo Go (remote push via FCM comes
 * with the real backend).
 *
 * On Android in Expo Go, `expo-notifications` *throws while its module is
 * evaluated* (SDK 53+ removed remote push; a `.fx.js` side-effect auto-registers
 * a device-push-token listener at import, and its guard throws on Android rather
 * than warning like iOS). So `notificationsUnsupported` short-circuits before we
 * ever touch the module on that path.
 *
 * `loadNotifications` pulls the module in with a lazy `require()` rather than a
 * top-level `import` or a dynamic `import()`:
 *   - a top-level import runs the throwing evaluation while the root
 *     `_layout.tsx` loads, taking down the whole app;
 *   - a dynamic `import()` splits it into a separate async chunk that Metro's
 *     fast refresh drops from the running bundle ("Requiring unknown module 1830").
 * A synchronous `require()` bundles it normally but defers *evaluation* until the
 * first call — which never happens on the Android-Expo-Go path or at layout-eval.
 */

const REMINDER_ID = 'mypact-daily-reminder';

// Web has no local notifications; Android Expo Go throws merely importing the
// module (see above). Both simply no-op. iOS Expo Go and all dev builds work.
const notificationsUnsupported =
  Platform.OS === 'web' || (Platform.OS === 'android' && isRunningInExpoGo());

let handlerConfigured = false;

function loadNotifications() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy by design; see file header
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');
  if (!handlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    handlerConfigured = true;
  }
  return Notifications;
}

export async function syncDailyReminder(
  enabled: boolean,
  notificationTime: string
): Promise<void> {
  if (notificationsUnsupported) return;
  try {
    const Notifications = loadNotifications();
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
    if (!enabled) return;

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;

    const [hourRaw, minuteRaw] = notificationTime.split(':');
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return;

    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {
        title: 'Your pacts await their seal',
        body: 'A witnessed habit is a kept habit. Check in before midnight.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch {
    // Notifications are best-effort in the demo client.
  }
}
