export const LIMITS = {
  MAEGASHIRA_MAX: 17,
  JURYO_MAX: 14,
  MAKUSHITA_MAX: 60,
  SANDANME_MAX: 90,
  JONIDAN_MAX: 100,
  JONOKUCHI_MAX: 30,
} as const;

export type LowerDivisionKey = 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi';

export type LowerDivisionSpec = {
  division: LowerDivisionKey;
  name: string;
  max: number;
};

export const LOWER_DIVISION_ORDER: LowerDivisionSpec[] = [
  { division: 'Makushita', name: '幕下', max: LIMITS.MAKUSHITA_MAX },
  { division: 'Sandanme', name: '三段目', max: LIMITS.SANDANME_MAX },
  { division: 'Jonidan', name: '序二段', max: LIMITS.JONIDAN_MAX },
  { division: 'Jonokuchi', name: '序ノ口', max: LIMITS.JONOKUCHI_MAX },
];

export const LOWER_DIVISION_OFFSET: Record<LowerDivisionKey, number> = {
  Makushita: 0,
  Sandanme: LIMITS.MAKUSHITA_MAX * 2,
  Jonidan: (LIMITS.MAKUSHITA_MAX + LIMITS.SANDANME_MAX) * 2,
  Jonokuchi: (LIMITS.MAKUSHITA_MAX + LIMITS.SANDANME_MAX + LIMITS.JONIDAN_MAX) * 2,
};

export const LOWER_DIVISION_TOTAL =
  (LIMITS.MAKUSHITA_MAX + LIMITS.SANDANME_MAX + LIMITS.JONIDAN_MAX + LIMITS.JONOKUCHI_MAX) * 2;

export const LOWER_DIVISION_MAX: Record<LowerDivisionKey, number> = {
  Makushita: LIMITS.MAKUSHITA_MAX,
  Sandanme: LIMITS.SANDANME_MAX,
  Jonidan: LIMITS.JONIDAN_MAX,
  Jonokuchi: LIMITS.JONOKUCHI_MAX,
};
