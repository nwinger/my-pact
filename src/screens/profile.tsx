import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ScreenHeader } from '@/components/screen-header';
import { Paper } from '@/components/ui/paper';
import { Avatar } from '@/components/ui/avatar';
import { FlameIcon } from '@/components/ui/icons';
import { Body, BodyBold, Display, Kicker, Small } from '@/components/ui/type';
import { completedCount, currentStreak } from '@/lib/streaks';
import { useFriends, useMe, useStore } from '@/store/use-store';
import { colors, radii, shadows } from '@/theme/tokens';

function StatTile({
  label,
  value,
  tint,
  index,
  flame,
}: {
  label: string;
  value: string | number;
  tint: string;
  index: number;
  flame?: boolean;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(220 + index * 70).springify().damping(15)}
      style={{
        flexBasis: '47%',
        flexGrow: 1,
        backgroundColor: tint,
        borderWidth: 1.5,
        borderColor: colors.ink,
        borderRadius: radii.lg,
        padding: 18,
        gap: 4,
        boxShadow: shadows.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Display style={{ fontSize: 30, lineHeight: 36 }}>{value}</Display>
        {flame && (
          <FlameIcon size={20} color={colors.seal} fill={colors.seal} strokeWidth={1.4} />
        )}
      </View>
      <Small color={colors.ink70}>{label}</Small>
    </Animated.View>
  );
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const me = useMe();
  const friends = useFriends();
  const pacts = useStore((s) => s.pacts);
  const checkIns = useStore((s) => s.checkIns);

  const stats = useMemo(() => {
    const mine = pacts.filter((p) => p.creatorUserId === me.id);
    const keeping = pacts.filter((p) => p.keeperUserId === me.id);
    const totalCheckIns = checkIns.filter(
      (c) => c.userId === me.id && c.status === 'completed'
    ).length;
    const failed = checkIns.filter((c) => c.userId === me.id && c.status === 'failed').length;
    const successRate =
      totalCheckIns + failed === 0
        ? 100
        : Math.round((totalCheckIns / (totalCheckIns + failed)) * 100);
    const best = Math.max(
      0,
      ...mine.filter((p) => p.status === 'active').map((p) => currentStreak(p, checkIns))
    );
    const sealed = mine.reduce((acc, p) => acc + completedCount(p, checkIns), 0);
    void sealed;
    return {
      pactsMade: mine.length,
      keeping: keeping.length,
      totalCheckIns,
      successRate,
      best,
    };
  }, [pacts, checkIns, me.id]);

  return (
    <Paper>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 22,
        paddingBottom: 140,
        gap: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader kicker="The signatory" title="Profile" />

      {/* identity card */}
      <Animated.View
        entering={FadeInDown.delay(120).duration(500)}
        style={{
          backgroundColor: colors.ink,
          borderRadius: radii.lg,
          padding: 20,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          boxShadow: shadows.raised,
        }}
      >
        <Avatar user={me} size={58} />
        <View style={{ flex: 1, gap: 2 }}>
          <BodyBold style={{ color: colors.paper, fontSize: 18 }}>@{me.username}</BodyBold>
          <Small style={{ color: 'rgba(247,241,230,0.6)' }}>{me.email}</Small>
          <Small style={{ color: 'rgba(247,241,230,0.6)' }}>
            {me.timezone} · reminders {me.notificationTime}
          </Small>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(180).duration(400)}>
        <Kicker color={colors.ink50}>The record</Kicker>
      </Animated.View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <StatTile index={0} label="Current streak" value={stats.best} tint={colors.butterSoft} flame />
        <StatTile index={1} label="Success rate" value={`${stats.successRate}%`} tint={colors.mintSoft} />
        <StatTile index={2} label="Seals pressed" value={stats.totalCheckIns} tint={colors.blushSoft} />
        <StatTile index={3} label="Pacts made" value={stats.pactsMade} tint={colors.periwinkleSoft} />
        <StatTile index={4} label="Keeping watch" value={stats.keeping} tint={colors.claySoft} />
        <StatTile index={5} label="Witnesses" value={friends.length} tint={colors.card} />
      </View>

      <Animated.View
        entering={FadeInDown.delay(650).duration(500)}
        style={{
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: colors.line,
          borderRadius: radii.lg,
          padding: 18,
          gap: 4,
        }}
      >
        <BodyBold>Fine print</BodyBold>
        <Body color={colors.ink50} style={{ fontSize: 13.5, lineHeight: 19 }}>
          Check-ins close at midnight in your timezone, plus a 30-minute grace
          period. Your keeper hears about everything — that’s the point.
        </Body>
      </Animated.View>
    </ScrollView>
    </Paper>
  );
}
