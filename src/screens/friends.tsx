import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { ScreenHeader } from '@/components/screen-header';
import { Paper } from '@/components/ui/paper';
import { Avatar } from '@/components/ui/avatar';
import { CheckIcon, CloseIcon, MailIcon } from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Body, BodyBold, BodySemi, Heading, Kicker, Small } from '@/components/ui/type';
import { fonts, colors, radii, shadows } from '@/theme/tokens';
import { useFriends, usePendingRequests, useStore } from '@/store/use-store';

export function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const friends = useFriends();
  const pending = usePendingRequests();
  const acceptFriend = useStore((s) => s.acceptFriend);
  const declineFriend = useStore((s) => s.declineFriend);
  const removeFriend = useStore((s) => s.removeFriend);
  const sendFriendRequest = useStore((s) => s.sendFriendRequest);
  const pacts = useStore((s) => s.pacts);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const send = () => {
    if (!email.includes('@')) return;
    sendFriendRequest(email.trim());
    setEmail('');
    setSent(true);
    setTimeout(() => setSent(false), 2400);
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
        {sent && (
          <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOut}>
            <Small color={colors.active}>Request sent — try mia@mypact.app and friends.</Small>
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
                onPress={() => acceptFriend(friendship.id)}
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
                onPress={() => declineFriend(friendship.id)}
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
                onPress={() => removeFriend(friendship.id)}
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
              A pact needs two names. Invite someone above.
            </Body>
          </View>
        )}
      </View>
    </ScrollView>
    </Paper>
  );
}
