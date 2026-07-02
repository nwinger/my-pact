import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { ScreenHeader } from '@/components/screen-header';
import { Paper } from '@/components/ui/paper';
import { Sheet } from '@/components/ui/sheet';
import { Avatar } from '@/components/ui/avatar';
import { CheckIcon, CloseIcon, MailIcon } from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Body, BodyBold, BodySemi, Heading, Kicker, Small } from '@/components/ui/type';
import { errorMessage } from '@/lib/api';
import { fonts, colors, radii, shadows } from '@/theme/tokens';
import {
  useFriends,
  useOutgoingRequests,
  usePendingRequests,
  useStore,
  type FriendRequestResult,
} from '@/store/use-store';
import { useTabs } from '@/store/use-tabs';

const SEND_FEEDBACK: Record<FriendRequestResult, { msg: string; ok: boolean }> = {
  sent: { msg: 'Request sent — they’ll see it next time they open My Pact.', ok: true },
  not_found: { msg: 'No one with that email has an account yet.', ok: false },
  duplicate: { msg: 'You already have a request or friendship with them.', ok: false },
  self: { msg: 'You can’t witness yourself — that’s the whole point.', ok: false },
};

export function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const friends = useFriends();
  const pending = usePendingRequests();
  const outgoing = useOutgoingRequests();
  const acceptFriend = useStore((s) => s.acceptFriend);
  const declineFriend = useStore((s) => s.declineFriend);
  const removeFriend = useStore((s) => s.removeFriend);
  const sendFriendRequest = useStore((s) => s.sendFriendRequest);
  const refreshFriends = useStore((s) => s.refreshFriends);
  const pacts = useStore((s) => s.pacts);
  const blockFriend = useStore((s) => s.blockFriend);
  const [email, setEmail] = useState('');
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [declineTarget, setDeclineTarget] = useState<{ id: string; name: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const activeTab = useTabs((s) => s.tab);

  // Re-pull the social graph whenever the Friends tab becomes active. All
  // four tab scenes stay mounted (display-toggled), so there is no remount to
  // hang a load on — keying off the active tab is what lets a request sent
  // from another device appear when you switch back to this tab.
  useEffect(() => {
    if (activeTab === 'friends') void refreshFriends();
  }, [activeTab, refreshFriends]);

  // Manual pull-to-refresh. refreshFriends() never throws, so no catch needed.
  const onRefreshGraph = async () => {
    setRefreshing(true);
    await refreshFriends();
    setRefreshing(false);
  };

  const send = async () => {
    if (!email.includes('@')) return;
    try {
      const result = await sendFriendRequest(email.trim());
      setFeedback(SEND_FEEDBACK[result]);
      if (result === 'sent') setEmail('');
    } catch (e) {
      // Server unreachable or errored — surface a clear message.
      setFeedback({ msg: errorMessage(e), ok: false });
    }
    setTimeout(() => setFeedback(null), 3200);
  };

  // accept / decline / block / remove now hit the server (async). Surface any
  // failure with the same transient banner the send path uses.
  const runFriendAction = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (e) {
      setFeedback({ msg: errorMessage(e), ok: false });
      setTimeout(() => setFeedback(null), 3200);
    }
  };

  return (
    <Paper>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 22,
        paddingBottom: 140,
        gap: 18,
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefreshGraph}
          tintColor={colors.ink50}
        />
      }
    >
      <ScreenHeader kicker="Witnesses" title="Friends" />

      {/* add by email */}
      <Animated.View entering={FadeInDown.delay(120).duration(450)} style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.card,
            borderWidth: 1.5,
            borderColor: colors.ink,
            borderRadius: radii.pill,
            paddingLeft: 18,
            paddingRight: 6,
            paddingVertical: 6,
            boxShadow: shadows.card,
          }}
        >
          <MailIcon size={18} color={colors.ink50} strokeWidth={2} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Invite by email…"
            placeholderTextColor={colors.ink30}
            autoCapitalize="none"
            keyboardType="email-address"
            onSubmitEditing={send}
            style={{
              flex: 1,
              fontFamily: fonts.bodySemi,
              fontSize: 15,
              color: colors.ink,
              paddingVertical: 8,
            }}
          />
          <PressableScale
            onPress={send}
            style={{
              backgroundColor: colors.ink,
              borderRadius: radii.pill,
              paddingHorizontal: 18,
              paddingVertical: 10,
            }}
          >
            <BodySemi color={colors.paper} style={{ fontSize: 13.5 }}>
              Send
            </BodySemi>
          </PressableScale>
        </View>
        {feedback && (
          <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOut}>
            <Small color={feedback.ok ? colors.active : colors.failed}>{feedback.msg}</Small>
          </Animated.View>
        )}
      </Animated.View>

      {/* pending requests */}
      {pending.length > 0 && (
        <View style={{ gap: 10 }}>
          <Animated.View entering={FadeInDown.delay(180).duration(400)}>
            <Kicker color={colors.ink50}>Knocking</Kicker>
          </Animated.View>
          {pending.map(({ friendship, user }, i) => (
            <Animated.View
              key={friendship.id}
              entering={FadeInDown.delay(230 + i * 80).springify().damping(15)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: colors.butterSoft,
                borderWidth: 1.5,
                borderColor: colors.ink,
                borderRadius: radii.lg,
                padding: 14,
                boxShadow: shadows.card,
              }}
            >
              <Avatar user={user} size={42} />
              <View style={{ flex: 1 }}>
                <BodyBold>{user.username}</BodyBold>
                <Small color={colors.ink50}>wants to witness your habits</Small>
              </View>
              <PressableScale
                onPress={() => runFriendAction(() => acceptFriend(friendship.id))}
                accessibilityLabel={`Accept ${user.username}`}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckIcon size={18} color={colors.paper} strokeWidth={2.6} />
              </PressableScale>
              <PressableScale
                onPress={() => setDeclineTarget({ id: friendship.id, name: user.username })}
                accessibilityLabel={`Decline ${user.username}`}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: colors.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CloseIcon size={16} strokeWidth={2.4} />
              </PressableScale>
            </Animated.View>
          ))}
        </View>
      )}

      {/* friends list */}
      <View style={{ gap: 10 }}>
        <Animated.View entering={FadeInDown.delay(260).duration(400)}>
          <Kicker color={colors.ink50}>
            Inner circle · {friends.length}
          </Kicker>
        </Animated.View>
        {friends.map(({ friendship, user }, i) => {
          const shared = pacts.filter(
            (p) =>
              (p.creatorUserId === user.id || p.keeperUserId === user.id) &&
              p.status === 'active'
          ).length;
          return (
            <Animated.View
              key={friendship.id}
              entering={FadeInDown.delay(320 + i * 80).springify().damping(15)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: colors.card,
                borderWidth: 1.5,
                borderColor: colors.ink,
                borderRadius: radii.lg,
                padding: 14,
                boxShadow: shadows.card,
              }}
            >
              <Avatar user={user} size={42} />
              <View style={{ flex: 1 }}>
                <BodyBold>{user.username}</BodyBold>
                <Small color={colors.ink50}>
                  {shared > 0 ? `${shared} shared pact${shared > 1 ? 's' : ''}` : user.email}
                </Small>
              </View>
              <PressableScale
                onPress={() => router.push(`/create?keeper=${user.id}`)}
                accessibilityLabel={`Make a pact with ${user.username}`}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: radii.pill,
                  backgroundColor: colors.seal,
                }}
              >
                <Small style={{ color: colors.white }}>Pact</Small>
              </PressableScale>
              <PressableScale
                onPress={() => runFriendAction(() => removeFriend(friendship.id))}
                accessibilityLabel={`Remove ${user.username}`}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: radii.pill,
                  borderWidth: 1.2,
                  borderColor: colors.line,
                }}
              >
                <Small color={colors.ink50}>Remove</Small>
              </PressableScale>
            </Animated.View>
          );
        })}
        {outgoing.length > 0 && (
          <View style={{ gap: 8, paddingTop: 6 }}>
            <Kicker color={colors.ink50}>Awaiting reply</Kicker>
            {outgoing.map(({ friendship, user }) => (
              <View
                key={friendship.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderWidth: 1.4,
                  borderStyle: 'dashed',
                  borderColor: colors.line,
                  borderRadius: radii.lg,
                  padding: 12,
                }}
              >
                <Avatar user={user} size={36} />
                <View style={{ flex: 1 }}>
                  <BodySemi>{user.username}</BodySemi>
                  <Small color={colors.ink50}>hasn’t answered yet</Small>
                </View>
                <Small color={colors.overdue}>pending</Small>
              </View>
            ))}
          </View>
        )}

        {friends.length === 0 && (
          <View
            style={{
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: colors.line,
              borderRadius: radii.lg,
              padding: 30,
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Heading color={colors.ink50}>No witnesses yet</Heading>
            <Body color={colors.ink50} align="center">
              A pact needs two names. Invite someone by email above to get started.
            </Body>
          </View>
        )}
      </View>
    </ScrollView>

      <Sheet open={declineTarget !== null} onClose={() => setDeclineTarget(null)}>
        <View style={{ padding: 24, paddingBottom: 44, gap: 14 }}>
          <Heading>Turn {declineTarget?.name} away?</Heading>
          <Body color={colors.ink70}>
            Declining lets them ask again later. Blocking is final — they can never
            request you again.
          </Body>
          <PressableScale
            onPress={() => {
              const id = declineTarget?.id;
              setDeclineTarget(null);
              if (id) void runFriendAction(() => declineFriend(id));
            }}
            style={{
              borderWidth: 1.5,
              borderColor: colors.ink,
              borderRadius: radii.pill,
              paddingVertical: 15,
              alignItems: 'center',
            }}
          >
            <BodySemi>Decline</BodySemi>
          </PressableScale>
          <PressableScale
            onPress={() => {
              const id = declineTarget?.id;
              setDeclineTarget(null);
              if (id) void runFriendAction(() => blockFriend(id));
            }}
            style={{
              backgroundColor: colors.failed,
              borderRadius: radii.pill,
              paddingVertical: 15,
              alignItems: 'center',
            }}
          >
            <BodyBold style={{ color: colors.white }}>Decline & block</BodyBold>
          </PressableScale>
          <PressableScale
            onPress={() => setDeclineTarget(null)}
            style={{ alignItems: 'center', paddingVertical: 6 }}
          >
            <Small color={colors.ink50}>Never mind</Small>
          </PressableScale>
        </View>
      </Sheet>
    </Paper>
  );
}
