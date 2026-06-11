import { View } from 'react-native';

import { BodyBold, Small } from '@/components/ui/type';
import { colors, ticketTints } from '@/theme/tokens';
import type { User } from '@/store/types';

type Props = {
  user: User;
  size?: number;
};

/** Pastel initial badge with the ink outline of a stamp. */
export function Avatar({ user, size = 44 }: Props) {
  const tint = ticketTints[user.tintIndex % ticketTints.length];
  const Letter = size >= 40 ? BodyBold : Small;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tint.base,
        borderWidth: 1.5,
        borderColor: colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Letter style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>
        {user.username.charAt(0).toUpperCase()}
      </Letter>
    </View>
  );
}
