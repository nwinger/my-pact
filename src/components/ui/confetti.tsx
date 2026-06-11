import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme/tokens';

const PIECE_COLORS = [colors.butter, colors.blush, colors.periwinkle, colors.mint, colors.seal];

// precomputed so renders are deterministic (no Math.random at render time)
const PIECES = Array.from({ length: 16 }, (_, i) => ({
  angle: (i / 16) * Math.PI * 2 + (i % 3) * 0.21,
  dist: 70 + (i % 5) * 26,
  size: 6 + (i % 4) * 2,
  spin: (i % 2 === 0 ? 1 : -1) * (180 + (i % 5) * 90),
  delay: (i % 4) * 40,
  color: PIECE_COLORS[i % PIECE_COLORS.length],
}));

function Piece({
  angle,
  dist,
  size,
  spin,
  delay,
  color,
}: (typeof PIECES)[number]) {
  const t = useSharedValue(0);

  useEffect(() => {
     
    t.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [t, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.7 ? 1 : 1 - (t.value - 0.7) / 0.3,
    transform: [
      { translateX: Math.cos(angle) * dist * t.value },
      { translateY: Math.sin(angle) * dist * t.value + 30 * t.value * t.value },
      { rotate: `${spin * t.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size * 1.6,
          borderRadius: 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** One-shot confetti burst, centered in its parent. Mount it to fire. */
export function ConfettiBurst() {
  return (
    <View
      style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }]}
    >
      {PIECES.map((p, i) => (
        <Piece key={i} {...p} />
      ))}
    </View>
  );
}
