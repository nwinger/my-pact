 
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { CheckIcon } from '@/components/ui/icons';
import { colors, shadows } from '@/theme/tokens';

/** Scalloped wax-seal outline. */
function SealShape({ size, fill, stroke }: { size: number; fill: string; stroke: string }) {
  // 12-lobe scalloped blob centered in a 100x100 box
  const lobes = 12;
  const cx = 50;
  const cy = 50;
  const rOuter = 47;
  const rInner = 41;
  let d = '';
  for (let i = 0; i < lobes * 2; i++) {
    const angle = (Math.PI * 2 * i) / (lobes * 2) - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    d += i === 0 ? `M ${x} ${y}` : ` Q ${cx + (r + 3) * Math.cos(angle - 0.13)} ${cy + (r + 3) * Math.sin(angle - 0.13)} ${x} ${y}`;
  }
  d += ' Z';
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d={d} fill={fill} stroke={stroke} strokeWidth={2} />
    </Svg>
  );
}

const PARTICLES = [
  { angle: -90, dist: 46, s: 1.0 },
  { angle: -45, dist: 40, s: 0.7 },
  { angle: 0, dist: 48, s: 0.9 },
  { angle: 48, dist: 38, s: 0.6 },
  { angle: 95, dist: 44, s: 0.8 },
  { angle: 140, dist: 40, s: 0.7 },
  { angle: 185, dist: 46, s: 1.0 },
  { angle: 230, dist: 38, s: 0.6 },
];

function Particle({
  fire,
  angle,
  dist,
  s,
  color,
}: {
  fire: SharedValue<number>;
  angle: number;
  dist: number;
  s: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const t = fire.value;
    const rad = (angle * Math.PI) / 180;
    return {
      opacity: t === 0 ? 0 : 1 - t,
      transform: [
        { translateX: Math.cos(rad) * dist * t },
        { translateY: Math.sin(rad) * dist * t },
        { scale: s * (1 - t * 0.4) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: color,
          pointerEvents: 'none',
        },
        style,
      ]}
    />
  );
}

type Props = {
  done: boolean;
  onSeal: () => void;
  size?: number;
};

/**
 * The check-in control: press to stamp the day with a wax seal.
 * Unsealed: dashed empty circle. The stamp animation is driven by the
 * `done` prop (the recorded check-in), so the visual can never desync
 * from the store — e.g. a goal pact only stamps once progress is logged.
 */
export function SealButton({ done, onSeal, size = 54 }: Props) {
  const stamp = useSharedValue(done ? 1 : 0);
  const fire = useSharedValue(0);
  const wobble = useSharedValue(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      // initial state settles without animating
      mountedRef.current = true;
      stamp.value = done ? 1 : 0;
      return;
    }
    if (done) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      stamp.value = withSpring(1, { damping: 11, stiffness: 240, mass: 0.9 });
      fire.value = 0;
      fire.value = withDelay(
        40,
        withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) })
      );
    } else {
      stamp.value = withTiming(0, { duration: 220 });
    }
  }, [done, stamp, fire]);

  const sealStyle = useAnimatedStyle(() => ({
    opacity: stamp.value,
    transform: [
      { scale: 0.4 + stamp.value * 0.6 },
      { rotate: `${(1 - stamp.value) * -24 + wobble.value}deg` },
    ],
  }));

  const emptyStyle = useAnimatedStyle(() => ({
    opacity: 1 - stamp.value,
    transform: [{ scale: 1 - stamp.value * 0.3 }],
  }));

  const handlePress = () => {
    if (done) {
      // Already sealed — wiggle to acknowledge.
      wobble.value = withSequence(
        withTiming(-6, { duration: 60 }),
        withTiming(6, { duration: 90 }),
        withTiming(0, { duration: 80 })
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return;
    }
    // The stamp animates when `done` flips true via the store.
    onSeal();
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={done ? 'Sealed for today' : 'Seal today’s check-in'}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* dashed empty state */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size - 6,
            height: size - 6,
            borderRadius: (size - 6) / 2,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: colors.ink30,
            alignItems: 'center',
            justifyContent: 'center',
          },
          emptyStyle,
        ]}
      >
        <CheckIcon size={size * 0.4} color={colors.ink30} strokeWidth={2.4} />
      </Animated.View>

      {/* wax seal */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: shadows.seal,
            borderRadius: size / 2,
          },
          sealStyle,
        ]}
      >
        <SealShape size={size} fill={colors.seal} stroke={colors.sealDeep} />
        <View style={{ position: 'absolute' }}>
          <CheckIcon size={size * 0.42} color={colors.white} strokeWidth={3} />
        </View>
      </Animated.View>

      {PARTICLES.map((pt, i) => (
        <Particle key={i} fire={fire} {...pt} color={i % 2 ? colors.butter : colors.seal} />
      ))}
    </Pressable>
  );
}
