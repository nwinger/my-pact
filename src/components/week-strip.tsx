import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CheckIcon, CloseIcon } from '@/components/ui/icons';
import { Small } from '@/components/ui/type';
import { DAY_LETTERS, dayOfWeek } from '@/lib/dates';
import type { DayCell } from '@/lib/streaks';
import { colors } from '@/theme/tokens';

/** Last-seven-days row: sealed, missed, rest and open-today cells. */
export function WeekStrip({ cells }: { cells: DayCell[] }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {cells.map((cell, i) => {
        const letter = DAY_LETTERS[dayOfWeek(cell.key)];
        return (
          <Animated.View
            key={cell.key}
            entering={FadeInDown.delay(200 + i * 50).springify().damping(14)}
            style={{ alignItems: 'center', gap: 6 }}
          >
            <Small color={colors.ink30}>{letter}</Small>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor:
                  cell.state === 'done'
                    ? colors.seal
                    : cell.state === 'missed'
                      ? colors.failedSoft
                      : 'transparent',
                borderWidth: cell.state === 'today-open' ? 2 : cell.state === 'rest' ? 1.2 : 0,
                borderStyle: cell.state === 'today-open' ? 'dashed' : 'solid',
                borderColor: cell.state === 'today-open' ? colors.ink : colors.lineSoft,
              }}
            >
              {cell.state === 'done' && (
                <CheckIcon size={16} color={colors.white} strokeWidth={3} />
              )}
              {cell.state === 'missed' && (
                <CloseIcon size={13} color={colors.failed} strokeWidth={2.6} />
              )}
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}
