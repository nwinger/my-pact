import { useMemo } from 'react';
import { View } from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import { Sheet } from '@/components/ui/sheet';
import { BodyBold, Heading, Kicker } from '@/components/ui/type';
import type { Pact } from '@/store/types';
import { colors, radii } from '@/theme/tokens';

type Props = {
  pact: Pact | null;
  open: boolean;
  onClose: () => void;
  onLog: (value: number) => void;
};

/** Bottom sheet for logging progress on a goal pact. */
export function GoalLogSheet({ pact, open, onClose, onLog }: Props) {
  const options = useMemo(() => {
    if (!pact?.goalTarget) return [1];
    if (pact.goalUnit === 'books') return [1];
    return [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
  }, [pact]);

  return (
    <Sheet open={open} onClose={onClose}>
      <View style={{ padding: 24, gap: 16, paddingBottom: 40 }}>
        <Kicker color={colors.ink50}>Log progress</Kicker>
        <Heading>{pact?.title}</Heading>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {options.map((v) => (
            <PressableScale
              key={v}
              onPress={() => {
                onLog(v);
                onClose();
              }}
              style={{
                borderWidth: 1.5,
                borderColor: colors.ink,
                borderRadius: radii.pill,
                paddingHorizontal: 18,
                paddingVertical: 12,
                backgroundColor: colors.butterSoft,
              }}
            >
              <BodyBold>
                +{v} {pact?.goalUnit}
              </BodyBold>
            </PressableScale>
          ))}
        </View>
      </View>
    </Sheet>
  );
}
