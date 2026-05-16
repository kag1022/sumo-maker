type BashoLabelLocale = 'ja' | 'en';

const EN_MONTH_LABELS: Record<number, string> = {
  1: 'Jan',
  3: 'Mar',
  5: 'May',
  7: 'Jul',
  9: 'Sep',
  11: 'Nov',
};

export const formatBashoLabel = (
  year: number,
  month: number,
  locale: BashoLabelLocale = 'ja',
): string => {
  if (locale === 'en') {
    return `${EN_MONTH_LABELS[month] ?? `Month ${month}`} ${year}`;
  }
  return `${year}年${month}月`;
};
