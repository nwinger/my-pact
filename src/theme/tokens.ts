/**
 * My Pact design tokens — "ink on paper" contract aesthetic.
 * Warm cream paper, near-black ink, pastel ticket tints, rose accent.
 */

export const colors = {
  // Surfaces
  paper: '#F7F1E6',
  paperDeep: '#EFE6D3',
  card: '#FDFAF3',

  // Ink
  ink: '#221C14',
  ink70: 'rgba(34,28,20,0.70)',
  ink50: 'rgba(34,28,20,0.62)',
  ink30: 'rgba(34,28,20,0.30)',
  line: 'rgba(34,28,20,0.16)',
  lineSoft: 'rgba(34,28,20,0.09)',

  // Accent (secondary brand)
  rose: '#D96D84',
  roseDeep: '#B84860',
  roseSoft: '#F6DBE1',

  // Ticket tints (pact card palette)
  butter: '#F3D27E',
  butterSoft: '#F9E7B8',
  blush: '#F0BFC9',
  blushSoft: '#F8E0E5',
  mint: '#BFDCC0',
  mintSoft: '#DFEEDF',
  periwinkle: '#BFC9ED',
  periwinkleSoft: '#E0E5F7',
  clay: '#E5A878',
  claySoft: '#F4DCC8',

  // Semantic status
  active: '#48714F',
  activeSoft: '#DCE9DC',
  completed: '#56619F',
  completedSoft: '#DEE2F2',
  failed: '#B6483A',
  failedSoft: '#F2D9D4',
  overdue: '#A8742B',
  overdueSoft: '#F1E3C8',

  // Misc
  white: '#FFFFFF',
  seal: '#C0392B',
  sealDeep: '#922B21',
} as const;

export type TicketTint = {
  base: string;
  soft: string;
};

/** Rotating tints assigned to pacts so the shelf feels like stacked tickets. */
export const ticketTints: TicketTint[] = [
  { base: colors.butter, soft: colors.butterSoft },
  { base: colors.periwinkle, soft: colors.periwinkleSoft },
  { base: colors.blush, soft: colors.blushSoft },
  { base: colors.mint, soft: colors.mintSoft },
  { base: colors.clay, soft: colors.claySoft },
];

export const fonts = {
  // Fraunces — editorial serif for display
  displayBlack: 'Fraunces_900Black',
  displayBlackItalic: 'Fraunces_900Black_Italic',
  displayBold: 'Fraunces_700Bold',
  displaySemi: 'Fraunces_600SemiBold',
  displaySemiItalic: 'Fraunces_600SemiBold_Italic',
  // Quicksand — rounded sans for body
  body: 'Quicksand_500Medium',
  bodySemi: 'Quicksand_600SemiBold',
  bodyBold: 'Quicksand_700Bold',
} as const;

export const radii = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 26,
  xl: 34,
  pill: 999,
} as const;

export const spacing = (n: number) => n * 4;

export const shadows = {
  card: '0px 10px 30px rgba(63,48,29,0.10), 0px 2px 6px rgba(63,48,29,0.06)',
  raised: '0px 18px 44px rgba(63,48,29,0.16), 0px 4px 10px rgba(63,48,29,0.08)',
  tabBar: '0px 12px 36px rgba(34,28,20,0.22)',
  seal: '0px 8px 18px rgba(146,43,33,0.35)',
} as const;
