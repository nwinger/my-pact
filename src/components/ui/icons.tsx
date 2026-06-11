import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

function base({ size = 24, color = colors.ink, strokeWidth = 2 }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export function HomeIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M4 11.2 12 4l8 7.2" />
      <Path d="M6 10v9.5h12V10" />
      <Path d="M9.8 19.5v-5h4.4v5" />
    </Svg>
  );
}

/** A scroll/contract — the pacts shelf. */
export function ScrollIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M7 3.5h11.5v13.8a3.2 3.2 0 0 1-3.2 3.2H6.2" />
      <Path d="M7 3.5a2.5 2.5 0 0 0-2.5 2.5v12a2.5 2.5 0 0 0 5 0v-1h9" />
      <Path d="M10.5 8h5M10.5 11.5h5" />
    </Svg>
  );
}

export function FriendsIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Circle cx="9" cy="8.5" r="3.2" />
      <Path d="M3.5 19.5c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5" />
      <Path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8" />
      <Path d="M17.5 14.8c1.7.7 2.7 2.3 3 4.7" />
    </Svg>
  );
}

export function BellIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.4 1.5 5.4h-15S6 14 6 10Z" />
      <Path d="M10 18.8a2.2 2.2 0 0 0 4 0" />
    </Svg>
  );
}

export function PersonIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Circle cx="12" cy="8" r="3.6" />
      <Path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6" />
    </Svg>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M5 12.5 10 17.5 19 6.5" />
    </Svg>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="m9 5 7 7-7 7" />
    </Svg>
  );
}

export function ChevronLeftIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="m15 5-7 7 7 7" />
    </Svg>
  );
}

/** Streak flame. */
export function FlameIcon(p: IconProps & { fill?: string }) {
  const { fill = 'none', ...rest } = p;
  return (
    <Svg {...base(rest)} fill={fill}>
      <Path d="M12 3.5c.6 2.8-1.6 4.4-2.8 6C7.9 11.2 7 12.8 7 14.6a5 5 0 0 0 10 0c0-2.3-1.2-3.8-2-5.3-.5 1-1.3 1.6-1.6 2.8-1-1.6-1.7-5-1.4-8.6Z" />
    </Svg>
  );
}

/** Two linked rings — a mutual pact. */
export function MutualIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Circle cx="9" cy="12" r="5" />
      <Circle cx="15" cy="12" r="5" />
    </Svg>
  );
}

/** Quill signature — keeper. */
export function QuillIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M19.5 4.5c-6 .5-10.5 3-12.8 9.5L5 19" />
      <Path d="M19.5 4.5C19 10 16 14.5 9.5 15.5" />
    </Svg>
  );
}

export function TargetIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Circle cx="12" cy="12" r="8" />
      <Circle cx="12" cy="12" r="4.5" />
      <Circle cx="12" cy="12" r="1.2" fill={p.color ?? colors.ink} />
    </Svg>
  );
}

export function RepeatIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M4.5 9.5a7.5 7.5 0 0 1 13-2.5l2 2.3" />
      <Path d="M19.5 4.5v4.8h-4.8" />
      <Path d="M19.5 14.5a7.5 7.5 0 0 1-13 2.5l-2-2.3" />
      <Path d="M4.5 19.5v-4.8h4.8" />
    </Svg>
  );
}

export function MailIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M3.5 6.5h17v11h-17z" />
      <Path d="m4 7 8 6.5L20 7" />
    </Svg>
  );
}

export function CalendarIcon(p: IconProps) {
  return (
    <Svg {...base(p)}>
      <Path d="M4.5 6.5h15v13h-15z" />
      <Path d="M4.5 10.5h15M8.5 4v4M15.5 4v4" />
    </Svg>
  );
}
