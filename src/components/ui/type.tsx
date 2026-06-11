import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

type Props = TextProps & {
  color?: string;
  align?: TextStyle['textAlign'];
};

function make(base: TextStyle) {
  return function Typo({ color, align, style, ...rest }: Props) {
    return (
      <Text
        {...rest}
        style={[base, { color: color ?? colors.ink, textAlign: align }, style]}
      />
    );
  };
}

/** Oversized editorial serif — hero moments only. */
export const Display = make({
  fontFamily: fonts.displayBlack,
  fontSize: 40,
  lineHeight: 44,
  letterSpacing: -0.5,
});

export const DisplayItalic = make({
  fontFamily: fonts.displayBlackItalic,
  fontSize: 40,
  lineHeight: 44,
  letterSpacing: -0.5,
});

export const Title = make({
  fontFamily: fonts.displayBold,
  fontSize: 26,
  lineHeight: 31,
  letterSpacing: -0.3,
});

export const Heading = make({
  fontFamily: fonts.displaySemi,
  fontSize: 20,
  lineHeight: 25,
});

export const HeadingItalic = make({
  fontFamily: fonts.displaySemiItalic,
  fontSize: 20,
  lineHeight: 25,
});

export const Body = make({
  fontFamily: fonts.body,
  fontSize: 15,
  lineHeight: 21,
});

export const BodySemi = make({
  fontFamily: fonts.bodySemi,
  fontSize: 15,
  lineHeight: 21,
});

export const BodyBold = make({
  fontFamily: fonts.bodyBold,
  fontSize: 15,
  lineHeight: 21,
});

export const Small = make({
  fontFamily: fonts.bodySemi,
  fontSize: 12.5,
  lineHeight: 17,
});

/** All-caps kicker label, wide tracking — the "legal print" of the contract. */
export const Kicker = make({
  fontFamily: fonts.bodyBold,
  fontSize: 11,
  lineHeight: 14,
  letterSpacing: 1.8,
  textTransform: 'uppercase',
});
