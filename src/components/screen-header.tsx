import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Display, Kicker } from '@/components/ui/type';
import { colors } from '@/theme/tokens';

type Props = {
  kicker?: string;
  title: string;
  right?: React.ReactNode;
};

/** Editorial screen masthead: small caps kicker over a big serif title. */
export function ScreenHeader({ kicker, title, right }: Props) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingTop: 10,
        paddingBottom: 18,
      }}
    >
      <View style={{ gap: 6, flex: 1 }}>
        {kicker ? (
          <Animated.View entering={FadeInDown.duration(400)}>
            <Kicker color={colors.ink50}>{kicker}</Kicker>
          </Animated.View>
        ) : null}
        <Animated.View entering={FadeInDown.delay(60).duration(450)}>
          <Display style={{ fontSize: 34, lineHeight: 38 }}>{title}</Display>
        </Animated.View>
      </View>
      {right}
    </View>
  );
}
