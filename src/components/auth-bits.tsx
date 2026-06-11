import { router } from 'expo-router';
import { View, TextInput, type TextInputProps } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ChevronLeftIcon } from '@/components/ui/icons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { BodySemi, Small } from '@/components/ui/type';
import { colors, fonts, radii } from '@/theme/tokens';

export function AuthBackButton() {
  return (
    <PressableScale
      onPress={() => router.back()}
      accessibilityLabel="Go back"
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 1.5,
        borderColor: colors.ink,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ChevronLeftIcon size={20} strokeWidth={2.2} />
    </PressableScale>
  );
}

export function AuthInput(props: TextInputProps & { label: string; error?: string }) {
  const { label, error, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Small color={colors.ink50} style={{ letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 11 }}>
        {label}
      </Small>
      <TextInput
        placeholderTextColor={colors.ink30}
        {...rest}
        style={{
          fontFamily: fonts.bodySemi,
          fontSize: 16,
          color: colors.ink,
          backgroundColor: colors.card,
          borderWidth: 1.5,
          borderColor: error ? colors.failed : colors.ink,
          borderRadius: radii.md,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      />
      {error ? <Small color={colors.failed}>{error}</Small> : null}
    </View>
  );
}

function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M21.6 12.2c0-.7-.06-1.4-.18-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z"
        fill="#4285F4"
      />
      <Path
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <Path
        d="M6.4 14a6 6 0 0 1 0-3.8V7.6H3.1a10 10 0 0 0 0 9l3.3-2.6Z"
        fill="#FBBC05"
      />
      <Path
        d="M12 6.1c1.5 0 2.8.5 3.8 1.5L18.7 5A10 10 0 0 0 3.1 7.6L6.4 10c.8-2.3 3-4 5.6-4Z"
        fill="#EA4335"
      />
    </Svg>
  );
}

function AppleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill={colors.ink}>
      <Path d="M16.6 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.6 1.3-2.7 0 0-2.5-1-2.5-3.7ZM14.3 5.6c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.2 1.9-1 3 1.1.1 2.1-.6 2.7-1.4Z" />
    </Svg>
  );
}

export function SocialButtons({ onSocial }: { onSocial: (provider: 'google' | 'apple') => void }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
        <Small color={colors.ink50}>or continue with</Small>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(
          [
            { key: 'google', label: 'Google', Mark: GoogleMark },
            { key: 'apple', label: 'Apple', Mark: AppleMark },
          ] as const
        ).map(({ key, label, Mark }) => (
          <PressableScale
            key={key}
            onPress={() => onSocial(key)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderWidth: 1.5,
              borderColor: colors.ink,
              backgroundColor: colors.card,
              borderRadius: radii.pill,
              paddingVertical: 14,
            }}
          >
            <Mark />
            <BodySemi>{label}</BodySemi>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}
