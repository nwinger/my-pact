import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, radii } from '@/theme/tokens';

type Props = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

/** Minimal bottom sheet: slide-up card on a dimmed paper scrim. */
export function Sheet({ open, onClose, children }: Props) {
  const [mounted, setMounted] = useState(open);
  const t = useSharedValue(0);
  const { height } = useWindowDimensions();

  // Render-phase mount so the sheet exists before the open animation runs.
  if (open && !mounted) setMounted(true);

  useEffect(() => {
     
    if (open) {
      t.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    } else {
      t.value = withTiming(
        0,
        { duration: 240, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        }
      );
    }
     
  }, [open, t]);

  const scrim = useAnimatedStyle(() => ({ opacity: t.value }));
  const card = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - t.value) * height * 0.5 }],
  }));

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(34,28,20,0.45)' }, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: height * 0.75,
            backgroundColor: colors.card,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            borderWidth: 1.5,
            borderBottomWidth: 0,
            borderColor: colors.ink,
            paddingTop: 10,
          },
          card,
        ]}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 44,
            height: 5,
            borderRadius: 3,
            backgroundColor: colors.line,
            marginBottom: 8,
          }}
        />
        {children}
      </Animated.View>
    </Modal>
  );
}
