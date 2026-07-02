import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { PactCard } from '@/components/pact-card';
import { Paper } from '@/components/ui/paper';
import { ScreenHeader } from '@/components/screen-header';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Body, BodySemi, Heading } from '@/components/ui/type';
import { useMe, useStore } from '@/store/use-store';
import { colors, radii } from '@/theme/tokens';

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
  const [filter, setFilter] = useState<Filter>('active');

  const visible = useMemo(() => {
    if (filter === 'active')
      return pacts.filter((p) => p.creatorUserId === me.id && p.status === 'active');
    if (filter === 'keeping')
      return pacts.filter((p) => p.keeperUserId === me.id && p.status === 'active');
    return pacts.filter((p) => p.creatorUserId === me.id && p.status !== 'active');
  }, [pacts, filter, me.id]);

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
    </ScrollView>
    </Paper>
  );
}
