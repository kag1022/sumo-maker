const LOWER_RANK_BANDS: Record<string, Array<[number, number | null, string]>> = {
  Makushita: [
    [1, 5, '1-5'],
    [6, 15, '6-15'],
    [16, 30, '16-30'],
    [31, 45, '31-45'],
    [46, null, '46+'],
  ],
  Sandanme: [
    [1, 10, '1-10'],
    [11, 30, '11-30'],
    [31, 60, '31-60'],
    [61, 90, '61-90'],
    [91, null, '91+'],
  ],
  Jonidan: [
    [1, 20, '1-20'],
    [21, 50, '21-50'],
    [51, 100, '51-100'],
    [101, 150, '101-150'],
    [151, null, '151+'],
  ],
  Jonokuchi: [
    [1, 10, '1-10'],
    [11, 20, '11-20'],
    [21, 30, '21-30'],
    [31, null, '31+'],
  ],
  Juryo: [
    [1, 3, '1-3'],
    [4, 7, '4-7'],
    [8, 11, '8-11'],
    [12, 14, '12-14'],
  ],
};

export const resolveRuntimeRecordBucket = (
  wins: number,
  losses: number,
  absent: number,
): string => {
  const totalBouts = wins + losses;
  if (absent === 0 && (totalBouts === 7 || totalBouts === 15)) {
    return `${wins}-${losses}`;
  }
  return `${wins}-${losses}-${absent}`;
};

export const resolveRuntimeRankBand = (
  division: string,
  rankName: string,
  rankNumber?: number,
): string => {
  if (division === 'Makuuchi') {
    if (rankName === '横綱' || rankName === '大関') return 'Y/O';
    if (rankName === '関脇' || rankName === '小結') return 'S/K';
    const number = rankNumber ?? 17;
    if (number <= 5) return '1-5';
    if (number <= 10) return '6-10';
    return '11+';
  }

  const tuples = LOWER_RANK_BANDS[division];
  if (!tuples?.length) return 'unknown';
  const number = rankNumber ?? tuples[0][0];
  for (const [lower, upper, label] of tuples) {
    if (number >= lower && (upper === null || number <= upper)) {
      return label;
    }
  }
  return tuples[tuples.length - 1][2];
};
