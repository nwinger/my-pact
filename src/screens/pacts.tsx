import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { PactCard } from '@/components/pact-card';
import { Paper } from '@/components/ui/paper';
import { ScreenHeader } from '@/components/screen-header';
import { Avatar } from '@/components/ui/avatar';
import { CheckIcon, CloseIcon, MutualIcon } from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Body, BodyBold, BodySemi, Heading, Kicker, Small } from '@/components/ui/type';
import { errorMessage } from '@/lib/api';
import { useIncomingProposals, useMe, useOutgoingProposals, useStore } from '@/store/use-store';
import { useTabs } from '@/store/use-tabs';
import { colors, radii, shadows } from '@/theme/tokens';

type Filter = 'active' | 'keeping' | 'archive';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'My pacts' },
  { key: 'keeping', label: 'Keeping' },
  { key: 'archive', label: 'Archive' },
];

export function PactsScreen() {
  const insets = useSafeAreaInsets();
  const me = useMe();
  const pacts = useStore((s) => s.pacts);
  const refreshPacts = useStore((s) => s.refreshPacts);
  const acceptPact = useStore((s) => s.acceptPact);
  const declinePact = useStore((s) => s.declinePact);
  const cancelPact = useStore((s) => s.cancelPact);
  const meId = useStore((s) => s.meId);
  const activeTab = useTabs((s) => s.tab);
  const [filter, setFilter] = useState<Filter>('active');
  const incoming = useIncomingProposals();
  const outgoing = useOutgoingProposals();
  const [feedback, setFeedback] = useState<string | null>(null);

  // Re-pull the shelf whenever the Pacts tab becomes active — the same
  // passive tab-focus discovery contract the Friends tab uses (ADR-0008);
  // it is also how incoming Proposals arrive until the notifications slice.
  // All four tab scenes stay mounted (display-toggled), so there is no
  // remount to hang a load on; keying off meId re-fires once identity
  // adoption lands (refreshPacts refuses to write rows before it).
  useEffect(() => {
    if (activeTab === 'pacts') void refreshPacts();
  }, [activeTab, meId, refreshPacts]);

  // Proposals live in these sections and NOWHERE else: pending rows are
  // excluded from every filter below — nothing binds until the Partner
  // accepts, so no Archive holds them and no Keeping list counts them.
  const visible = useMemo(() => {
    if (filter === 'active')
      return pacts.filter((p) => p.creatorUserId === me.id && p.status === 'active');
    if (filter === 'keeping')
      return pacts.filter((p) => p.keeperUserId === me.id && p.status === 'active');
    return pacts.filter(
      (p) => p.creatorUserId === me.id && p.status !== 'active' && p.status !== 'pending'
    );
  }, [pacts, filter, me.id]);

  // accept / decline / withdraw hit the server (async). Surface a failure
  // (e.g. accepting after the pair unfriended) as a transient banner — the
  // same contract the Friends screen's actions use.
  const runProposalAction = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (e) {
      setFeedback(errorMessage(e));
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
        gap: 14,
      }}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader kicker="The shelf" title="Your pacts" />

      {feedback && (
        <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOut}>
          <Small color={colors.failed}>{feedback}</Small>
        </Animated.View>
      )}

      {/* incoming proposals — mutual pacts awaiting MY consent */}
      {incoming.length > 0 && (
        <View style={{ gap: 10 }}>
          <Animated.View entering={FadeInDown.delay(80).duration(400)}>
            <Kicker color={colors.ink50}>Proposed to you</Kicker>
          </Animated.View>
          {incoming.map(({ pact, user }, i) => (
            <Animated.View
              key={pact.id}
              entering={FadeInDown.delay(130 + i * 80).springify().damping(15)}
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
              <View style={{ flex: 1, gap: 1 }}>
                <BodyBold numberOfLines={1}>{pact.title}</BodyBold>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MutualIcon size={12} color={colors.ink50} strokeWidth={2.2} />
                  <Small color={colors.ink50}>{user.username} proposes a mutual pact</Small>
                </View>
              </View>
              <PressableScale
                onPress={() => runProposalAction(() => acceptPact(pact.id))}
                accessibilityLabel={`Accept ${pact.title}`}
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
                onPress={() => runProposalAction(() => declinePact(pact.id))}
                accessibilityLabel={`Decline ${pact.title}`}
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

      {/* filter pills */}
      <Animated.View
        entering={FadeInDown.delay(120).duration(450)}
        style={{ flexDirection: 'row', gap: 8 }}
      >
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <PressableScale
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: radii.pill,
                backgroundColor: on ? colors.ink : 'transparent',
                borderWidth: 1.4,
                borderColor: on ? colors.ink : colors.line,
              }}
            >
              <BodySemi color={on ? colors.paper : colors.ink70} style={{ fontSize: 13.5 }}>
                {f.label}
              </BodySemi>
            </PressableScale>
          );
        })}
      </Animated.View>

      <View style={{ gap: 16, marginTop: 4 }}>
        {visible.map((p, i) => (
          <Animated.View
            key={p.id}
            entering={FadeInDown.delay(200 + i * 100).springify().damping(15)}
          >
            <PactCard pact={p} index={i} />
          </Animated.View>
        ))}
        {visible.length === 0 && (
          <Animated.View
            entering={FadeInDown.delay(250).duration(450)}
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
            <Heading color={colors.ink50}>Empty shelf</Heading>
            <Body color={colors.ink50} align="center">
              {filter === 'keeping'
                ? 'No friend has named you keeper yet.'
                : 'No pacts here. Press + to draft one.'}
            </Body>
          </Animated.View>
        )}
      </View>

      {/* outgoing proposals — awaiting the Partner: nothing binding, no seal
          due; withdrawing leaves no record for either side */}
      {outgoing.length > 0 && (
        <View style={{ gap: 8, paddingTop: 6 }}>
          <Kicker color={colors.ink50}>Proposals awaiting a partner</Kicker>
          {outgoing.map(({ pact, user }) => (
            <View
              key={pact.id}
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
              <View style={{ flex: 1, gap: 1 }}>
                <BodySemi numberOfLines={1}>{pact.title}</BodySemi>
                <Small color={colors.ink50}>
                  nothing binds until {user.username} accepts
                </Small>
              </View>
              <PressableScale
                onPress={() => runProposalAction(() => cancelPact(pact.id))}
                accessibilityLabel={`Withdraw ${pact.title}`}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: radii.pill,
                  borderWidth: 1.2,
                  borderColor: colors.line,
                }}
              >
                <Small color={colors.ink50}>Withdraw</Small>
              </PressableScale>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
    </Paper>
  );
}
