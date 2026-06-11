import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ScreenHeader } from '@/components/screen-header';
import { Paper } from '@/components/ui/paper';
import {
  BellIcon,
  CheckIcon,
  ChevronLeftIcon,
  FlameIcon,
  FriendsIcon,
} from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Body, BodyBold, BodySemi, Small } from '@/components/ui/type';
import { useStore, useUnreadCount } from '@/store/use-store';
import { useTabs } from '@/store/use-tabs';
import type { AppNotification, NotificationType } from '@/store/types';
import { colors, radii, shadows } from '@/theme/tokens';

const typeStyle: Record<
  NotificationType,
  { tint: string; Icon: typeof BellIcon }
> = {
  daily_reminder: { tint: colors.butterSoft, Icon: BellIcon },
  friend_request: { tint: colors.periwinkleSoft, Icon: FriendsIcon },
  friend_accepted: { tint: colors.mintSoft, Icon: FriendsIcon },
  pact_breach: { tint: colors.failedSoft, Icon: FlameIcon },
  pact_completed: { tint: colors.blushSoft, Icon: CheckIcon },
};

function Row({ n, index }: { n: AppNotification; index: number }) {
  const markRead = useStore((s) => s.markRead);
  const setTab = useTabs((s) => s.setTab);
  const { tint, Icon } = typeStyle[n.type];
  const unread = !n.readAt;

  return (
    <Animated.View entering={FadeInDown.delay(160 + index * 80).springify().damping(15)}>
      <PressableScale
        scaleTo={0.98}
        onPress={() => {
          markRead(n.id);
          if (n.pactId) {
            router.push(`/pact/${n.pactId}`);
          } else if (n.friendId) {
            setTab('friends');
            router.back();
          }
        }}
        style={{
          flexDirection: 'row',
          gap: 14,
          alignItems: 'center',
          backgroundColor: unread ? colors.card : 'transparent',
          borderWidth: 1.5,
          borderColor: unread ? colors.ink : colors.lineSoft,
          borderRadius: radii.lg,
          padding: 16,
          boxShadow: unread ? shadows.card : undefined,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: tint,
            borderWidth: 1.4,
            borderColor: unread ? colors.ink : colors.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={18} strokeWidth={2} color={colors.ink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {unread && (
              <View
                style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.seal }}
              />
            )}
            <BodyBold style={{ opacity: unread ? 1 : 0.55, flex: 1 }} numberOfLines={1}>
              {n.title}
            </BodyBold>
          </View>
          <Body color={colors.ink50} style={{ fontSize: 13.5, lineHeight: 18 }} numberOfLines={2}>
            {n.body}
          </Body>
          <Small color={colors.ink50}>{n.sentAt}</Small>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

export default function Inbox() {
  const insets = useSafeAreaInsets();
  const notifications = useStore((s) => s.notifications);
  const markAllRead = useStore((s) => s.markAllRead);
  const unread = useUnreadCount();

  return (
    <Paper>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: insets.top + 10,
        paddingHorizontal: 22,
        paddingBottom: 60,
        gap: 12,
      }}
      showsVerticalScrollIndicator={false}
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

      <ScreenHeader
        kicker={unread > 0 ? `${unread} unread` : 'All read'}
        title="Inbox"
        right={
          unread > 0 ? (
            <PressableScale
              onPress={markAllRead}
              style={{
                borderWidth: 1.4,
                borderColor: colors.ink,
                borderRadius: radii.pill,
                paddingHorizontal: 14,
                paddingVertical: 9,
              }}
            >
              <BodySemi style={{ fontSize: 13 }}>Mark all read</BodySemi>
            </PressableScale>
          ) : undefined
        }
      />

      {notifications.map((n, i) => (
        <Row key={n.id} n={n} index={i} />
      ))}
    </ScrollView>
    </Paper>
  );
}
