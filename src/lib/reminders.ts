import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Local stand-in for the personalized-reminder scheduler: one daily local
 * notification at the user's notificationTime. Web silently no-ops; on
 * device this works in Expo Go and dev builds (remote push via FCM comes
 * with the real backend).
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const REMINDER_ID = 'mypact-daily-reminder';

export async function syncDailyReminder(
  enabled: boolean,
  notificationTime: string
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
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
