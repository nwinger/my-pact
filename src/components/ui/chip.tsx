import { View, type ViewStyle } from 'react-native';

import { Small } from '@/components/ui/type';
import { colors, radii } from '@/theme/tokens';
import type { PactStatus } from '@/store/types';

type Props = {
  label: string;
  bg?: string;
  fg?: string;
  outlined?: boolean;
  style?: ViewStyle;
};

export function Chip({ label, bg = colors.paperDeep, fg = colors.ink, outlined, style }: Props) {
  return (
    <View
      style={[
        {
          backgroundColor: outlined ? 'transparent' : bg,
          borderRadius: radii.pill,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderWidth: outlined ? 1.2 : 0,
          borderColor: fg,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <Small color={fg}>{label}</Small>
    </View>
  );
}

const statusMap: Record<PactStatus, { label: string; bg: string; fg: string }> = {
  active: { label: 'Active', bg: colors.activeSoft, fg: colors.active },
  completed: { label: 'Completed', bg: colors.completedSoft, fg: colors.completed },
  incomplete: { label: 'Incomplete', bg: colors.failedSoft, fg: colors.failed },
  cancelled: { label: 'Cancelled', bg: colors.paperDeep, fg: colors.ink50 },
};

export function StatusChip({ status }: { status: PactStatus }) {
  const s = statusMap[status];
  return <Chip label={s.label} bg={s.bg} fg={s.fg} />;
}
