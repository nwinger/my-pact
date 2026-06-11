import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

import { colors } from '@/theme/tokens';

/**
 * Warm paper backdrop: cream base, two soft tinted glows,
 * and a faint dot grain so surfaces feel printed, not flat.
 */
export function Paper({ children }: { children: React.ReactNode }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.paper }]}>
      <LinearGradient
        colors={['rgba(243,210,126,0.22)', 'rgba(243,210,126,0)']}
        style={{
          position: 'absolute',
          top: -120,
          right: -140,
          width: 420,
          height: 420,
          borderRadius: 210,
        }}
      />
      <LinearGradient
        colors={['rgba(191,201,237,0.25)', 'rgba(191,201,237,0)']}
        style={{
          position: 'absolute',
          bottom: -80,
          left: -160,
          width: 460,
          height: 460,
          borderRadius: 230,
        }}
      />
      <Svg style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <Defs>
          <Pattern id="grain" width="22" height="22" patternUnits="userSpaceOnUse">
            <Circle cx="2" cy="2" r="0.9" fill="rgba(34,28,20,0.045)" />
            <Circle cx="13" cy="14" r="0.7" fill="rgba(34,28,20,0.035)" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#grain)" />
      </Svg>
      {children}
    </View>
  );
}
