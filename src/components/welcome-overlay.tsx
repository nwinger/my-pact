import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Paper } from '@/components/ui/paper';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Body, BodyBold, Display, DisplayItalic, Kicker } from '@/components/ui/type';
import { colors, radii, shadows } from '@/theme/tokens';

/** Hand-drawn underline flourish. */
function Flourish() {
  return (
    <Svg width={190} height={16} viewBox="0 0 190 16">
      <Path
        d="M4 10 C 40 4, 80 12, 110 8 S 170 6, 186 9"
        stroke={colors.seal}
        strokeWidth={3.5}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * One-time entry screen: the "cover page" of the contract.
 * Slides up like a sheet of paper being lifted when you enter.
 */
export function WelcomeOverlay() {
  const [gone, setGone] = useState(false);
  const lift = useSharedValue(0);
  const nudge = useSharedValue(0);
  const insets = useSafeAreaInsets();

  // gentle idle float on the seal mark
  useEffect(() => {
     
    nudge.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
  }, [nudge]);

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value * -1000 }],
    opacity: 1 - lift.value * 0.3,
  }));

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: nudge.value }],
  }));

  const enter = () => {
    lift.value = withDelay(
      60,
      withTiming(1, { duration: 620, easing: Easing.in(Easing.cubic) }, (f) => {
        if (f) runOnJS(setGone)(true);
      })
    );
  };

  if (gone) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>
      <Paper>
        <View
          style={{
            flex: 1,
            paddingHorizontal: 28,
            paddingTop: insets.top + 60,
            paddingBottom: Math.max(insets.bottom, 20) + 24,
            justifyContent: 'space-between',
          }}
        >
          <View style={{ gap: 18 }}>
            <Animated.View entering={FadeInDown.delay(150).duration(500)}>
              <Animated.View style={floatStyle}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.seal,
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: shadows.seal,
                  transform: [{ rotate: '-8deg' }],
                }}
              >
                <BodyBold style={{ color: colors.white, fontSize: 22 }}>mp</BodyBold>
              </View>
              </Animated.View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(280).duration(550)}>
              <Kicker color={colors.ink50}>An accountability contract</Kicker>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(380).duration(600)} style={{ gap: 2 }}>
              <Display style={{ fontSize: 52, lineHeight: 56 }}>Habits stick</Display>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Display style={{ fontSize: 52, lineHeight: 58 }}>when </Display>
                <DisplayItalic style={{ fontSize: 52, lineHeight: 58, color: colors.roseDeep }}>
                  witnessed.
                </DisplayItalic>
              </View>
              <Flourish />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(520).duration(600)}>
              <Body color={colors.ink70} style={{ fontSize: 17, lineHeight: 25, maxWidth: 320 }}>
                Make a pact with a friend. Check in daily. They hold the other
                end of the rope — and they’ll know if you let go.
              </Body>
            </Animated.View>
          </View>

          <Animated.View entering={FadeInDown.delay(700).duration(600)} style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {['Daily seals', 'Streaks', 'Keepers', 'Mutual pacts'].map((t) => (
                <View
                  key={t}
                  style={{
                    borderWidth: 1.3,
                    borderColor: colors.line,
                    borderRadius: radii.pill,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                  }}
                >
                  <Body style={{ fontSize: 13 }} color={colors.ink70}>
                    {t}
                  </Body>
                </View>
              ))}
            </View>

            <PressableScale
              onPress={enter}
              style={{
                backgroundColor: colors.ink,
                borderRadius: radii.pill,
                paddingVertical: 18,
                alignItems: 'center',
                boxShadow: shadows.raised,
              }}
            >
              <BodyBold style={{ color: colors.paper, fontSize: 16 }}>
                Sign me up — I’m in
              </BodyBold>
            </PressableScale>
            <Body align="center" color={colors.ink50} style={{ fontSize: 13 }}>
              Mock sign-in · Google & Apple arrive with the real backend
            </Body>
          </Animated.View>
        </View>
      </Paper>
    </Animated.View>
  );
}
