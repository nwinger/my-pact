import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import {
  FriendsIcon,
  HomeIcon,
  PersonIcon,
  PlusIcon,
  ScrollIcon,
} from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Small } from '@/components/ui/type';
import { useTabs, type TabName } from '@/store/use-tabs';
import { colors, radii, shadows } from '@/theme/tokens';

const TABS: { name: TabName; label: string; Icon: typeof HomeIcon }[] = [
  { name: 'home', label: 'Home', Icon: HomeIcon },
  { name: 'pacts', label: 'Pacts', Icon: ScrollIcon },
  { name: 'friends', label: 'Friends', Icon: FriendsIcon },
  { name: 'profile', label: 'You', Icon: PersonIcon },
];

/**
 * Floating ink-bordered pill with a raised wax-red FAB in the middle.
 * Tab order: Home, Pacts, [+], Friends, You.
 */
export function FabTabBar() {
  const insets = useSafeAreaInsets();
  const spin = useSharedValue(0);

  const fabIcon = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  const activeName = useTabs((s) => s.tab);
  const go = useTabs((s) => s.setTab);
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  return (
    <View
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: Math.max(insets.bottom, 12),
        pointerEvents: 'box-none',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.ink,
          borderRadius: radii.pill,
          paddingHorizontal: 14,
          paddingVertical: 8,
          boxShadow: shadows.tabBar,
        }}
      >
        {/* dark pill: re-tint buttons for dark bg */}
        {[...left.map((t) => ({ ...t, side: 'l' })), null, ...right.map((t) => ({ ...t, side: 'r' }))].map(
          (t, i) =>
            t === null ? (
              <View key="gap" style={{ width: 64 }} />
            ) : (
              <DarkTab
                key={t.name}
                label={t.label}
                Icon={t.Icon}
                active={activeName === t.name}
                onPress={() => go(t.name)}
              />
            )
        )}
      </View>

      {/* central FAB */}
      <PressableScale
        scaleTo={0.88}
        onPressIn={() => {
          spin.value = withSpring(90, { damping: 14, stiffness: 220 });
        }}
        onPressOut={() => {
          spin.value = withSpring(0, { damping: 14, stiffness: 220 });
        }}
        onPress={() => router.push('/create')}
        accessibilityLabel="Create a new pact"
        style={{
          position: 'absolute',
          alignSelf: 'center',
          top: -24,
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: colors.seal,
          borderWidth: 2,
          borderColor: colors.card,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: shadows.seal,
        }}
      >
        <Animated.View style={fabIcon}>
          <PlusIcon size={26} color={colors.white} strokeWidth={2.6} />
        </Animated.View>
      </PressableScale>
    </View>
  );
}

function DarkTab({
  label,
  Icon,
  active,
  onPress,
}: {
  label: string;
  Icon: typeof HomeIcon;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.9}
      style={{ alignItems: 'center', gap: 2, width: 56, paddingVertical: 3 }}
    >
      <View
        style={{
          width: 38,
          height: 28,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? colors.butter : 'transparent',
        }}
      >
        <Icon
          size={19}
          color={active ? colors.ink : 'rgba(247,241,230,0.85)'}
          strokeWidth={active ? 2.4 : 1.9}
        />
      </View>
      <Small style={{ fontSize: 10, color: active ? colors.paper : 'rgba(247,241,230,0.5)' }}>
        {label}
      </Small>
    </PressableScale>
  );
}
