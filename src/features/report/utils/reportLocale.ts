import type { Achievement } from '../../../logic/achievements';
import type { CareerRecordBadgeKey } from '../../../logic/career/clearScore';
import { resolveCareerRecordBadgeLabel } from '../../../logic/career/clearScore';
import type { Rank, TimelineEvent, Trait, TraitJourneyEntry } from '../../../logic/models';
import { formatBashoLabel as formatBaseBashoLabel } from '../../../logic/bashoLabels';
import {
  formatHighestRankDisplayName as formatBaseHighestRankDisplayName,
  formatRankDisplayName as formatBaseRankDisplayName,
  formatRankMovementDisplay,
} from '../../../logic/ranking';
import {
  TRAIT_CATEGORY_LABELS,
  formatTraitAcquisitionLabel as formatBaseTraitAcquisitionLabel,
} from '../../../logic/traits';
import type { LocaleCode } from '../../../shared/lib/locale';

const JAPANESE_TEXT_PATTERN = /[ぁ-んァ-ン一-龥]/;

const DIVISION_EN_LABELS: Record<string, string> = {
  Makuuchi: 'Makuuchi',
  Juryo: 'Juryo',
  Makushita: 'Makushita',
  Sandanme: 'Sandanme',
  Jonidan: 'Jonidan',
  Jonokuchi: 'Jonokuchi',
  Maezumo: 'Maezumo',
};

const SPECIAL_PRIZE_EN_LABELS: Record<string, string> = {
  YUSHO: 'Yusho',
  SHUKUN: 'Shukun-sho',
  KANTO: 'Kanto-sho',
  GINO: 'Gino-sho',
  殊勲賞: 'Shukun-sho',
  敢闘賞: 'Kanto-sho',
  技能賞: 'Gino-sho',
};

const TIMELINE_EVENT_EN_LABELS: Record<TimelineEvent['type'], string> = {
  ENTRY: 'Entry',
  PROMOTION: 'Promotion',
  DEMOTION: 'Drop',
  YUSHO: 'Yusho',
  INJURY: 'Absence',
  RETIREMENT: 'Retirement',
  TRAIT_AWAKENING: 'Trait Learned',
  OTHER: 'Career Event',
};

const TIMELINE_EVENT_JA_LABELS: Record<TimelineEvent['type'], string> = {
  ENTRY: '入門',
  PROMOTION: '昇進',
  DEMOTION: '陥落',
  YUSHO: '優勝',
  INJURY: '休場',
  RETIREMENT: '引退',
  TRAIT_AWAKENING: '特性開花',
  OTHER: '出来事',
};

const PERSONALITY_EN_LABELS: Record<string, string> = {
  CALM: 'Calm',
  AGGRESSIVE: 'Combative',
  SERIOUS: 'Serious',
  WILD: 'Unrestrained',
  CHEERFUL: 'Cheerful',
  SHY: 'Reserved',
};

const TRAIT_CATEGORY_EN_LABELS: Record<string, string> = {
  BODY: 'Body',
  MENTAL: 'Mental',
  TECHNIQUE: 'Technique',
};

const TRAIT_EN_LABELS: Record<Trait, { name: string; description: string }> = {
  KEIKO_NO_MUSHI: {
    name: 'Training Devotee',
    description: 'Improves growth while healthy.',
  },
  TETSUJIN: {
    name: 'Ironman',
    description: 'Reduces injury risk and slows age-related decline.',
  },
  SOUJUKU: {
    name: 'Early Bloomer',
    description: 'Grows quickly early, then declines sooner.',
  },
  TAIKI_BANSEI: {
    name: 'Late Bloomer',
    description: 'Peaks later after a slow early career.',
  },
  BUJI_KORE_MEIBA: {
    name: 'Durable Veteran',
    description: 'Avoids major absence-level injuries.',
  },
  GLASS_KNEE: {
    name: 'Fragile Knee',
    description: 'Raises knee injury risk.',
  },
  BAKUDAN_MOCHI: {
    name: 'Chronic Trouble',
    description: 'One injury area tends to become chronic.',
  },
  SABORI_GUSE: {
    name: 'Uneven Training',
    description: 'Slows normal growth but leaves room for awakenings.',
  },
  OOBUTAI_NO_ONI: {
    name: 'Big-Stage Nerve',
    description: 'Performs better in title-deciding moments.',
  },
  KYOUSHINZOU: {
    name: 'Strong Heart',
    description: 'Gains an edge in top-division or kachi-koshi bouts.',
  },
  KINBOSHI_HUNTER: {
    name: 'Kinboshi Hunter',
    description: 'Improves against yokozuna and ozeki opponents.',
  },
  RENSHOU_KAIDOU: {
    name: 'Win Streak',
    description: 'Builds momentum after consecutive wins.',
  },
  KIBUNYA: {
    name: 'Mood Swing',
    description: 'Basho form tends to swing sharply.',
  },
  NOMI_NO_SHINZOU: {
    name: 'Nervous Heart',
    description: 'Struggles against top ranks and key bouts.',
  },
  SLOW_STARTER: {
    name: 'Slow Starter',
    description: 'Starts basho slowly, then improves later.',
  },
  KYOJIN_GOROSHI: {
    name: 'Giant Slayer',
    description: 'Performs better against stronger opponents.',
  },
  KOHEI_KILLER: {
    name: 'Lower-Rank Killer',
    description: 'Reduces slips against lower-ranked opponents.',
  },
  DOHYOUGIWA_MAJUTSU: {
    name: 'Edge Sorcerer',
    description: 'Can reverse some losing positions at the edge.',
  },
  YOTSU_NO_ONI: {
    name: 'Yotsu Specialist',
    description: 'Improves grappling-style winning techniques.',
  },
  TSUPPARI_TOKKA: {
    name: 'Thrusting Specialist',
    description: 'Improves push-and-thrust winning techniques.',
  },
  ARAWAZASHI: {
    name: 'Unusual Technician',
    description: 'Makes rare kimarite more likely in wins.',
  },
  LONG_REACH: {
    name: 'Long Reach',
    description: 'Improves bouts where height is an advantage.',
  },
  HEAVY_PRESSURE: {
    name: 'Heavy Pressure',
    description: 'Improves bouts where weight is an advantage.',
  },
  RECOVERY_MONSTER: {
    name: 'Recovery Monster',
    description: 'Improves injury recovery.',
  },
  WEAK_LOWER_BACK: {
    name: 'Weak Lower Back',
    description: 'Hurts performance when trailing.',
  },
  OPENING_DASH: {
    name: 'Fast Opening',
    description: 'Improves early-basho bouts.',
  },
  SENSHURAKU_KISHITSU: {
    name: 'Senshuraku Nerve',
    description: 'Improves final-day bouts.',
  },
  TRAILING_FIRE: {
    name: 'Trailing Fire',
    description: 'Improves performance after falling behind.',
  },
  PROTECT_LEAD: {
    name: 'Lead Protector',
    description: 'Improves performance with a comfortable lead.',
  },
  BELT_COUNTER: {
    name: 'Belt Counter',
    description: 'Improves yotsu bouts against heavier opponents.',
  },
  THRUST_RUSH: {
    name: 'Thrust Rush',
    description: 'Improves early and mid-basho pushing attacks.',
  },
  READ_THE_BOUT: {
    name: 'Bout Reader',
    description: 'Improves after a previous-day loss.',
  },
  CLUTCH_REVERSAL: {
    name: 'Clutch Reversal',
    description: 'Can reverse some losing outcomes.',
  },
};

const ACHIEVEMENT_EN_LABELS: Record<string, { name: string; description: string }> = {
  YUSHO_1: { name: 'One Makuuchi Yusho', description: 'Won one top-division championship.' },
  YUSHO_10: { name: 'Ten Makuuchi Yusho', description: 'Won ten top-division championships.' },
  YUSHO_20: { name: 'Twenty Makuuchi Yusho', description: 'Won twenty or more top-division championships.' },
  ZENSHO_1: { name: 'One Perfect Yusho', description: 'Won one perfect top-division championship.' },
  ZENSHO_5: { name: 'Five Perfect Yusho', description: 'Won five perfect top-division championships.' },
  WINS_100: { name: '100 Career Wins', description: 'Reached 100 career wins.' },
  WINS_300: { name: '300 Career Wins', description: 'Reached 300 career wins.' },
  WINS_500: { name: '500 Career Wins', description: 'Reached 500 career wins.' },
  WINS_1000: { name: '1000 Career Wins', description: 'Reached 1000 career wins.' },
  AGE_35: { name: 'Active at 35', description: 'Stayed active through age 35 or later.' },
  AGE_40: { name: 'Active at 40', description: 'Stayed active through age 40 or later.' },
  IRONMAN_30: { name: '30 Basho Without Absence', description: 'Recorded at least 30 basho without absences.' },
  IRONMAN: { name: '60 Basho Without Absence', description: 'Recorded at least 60 basho without absences.' },
  STREAK_8: { name: 'Eight Makuuchi Kachi-Koshi', description: 'Had eight straight winning records in Makuuchi.' },
  STREAK_15: { name: 'Fifteen Makuuchi Kachi-Koshi', description: 'Had fifteen straight winning records in Makuuchi.' },
  STREAK_30: { name: 'Thirty Makuuchi Kachi-Koshi', description: 'Had thirty straight winning records in Makuuchi.' },
  RAPID_PROMOTION_18: { name: 'Makuuchi Within 18 Basho', description: 'Reached Makuuchi within 18 basho from entry.' },
  RAPID_PROMOTION: { name: 'Makuuchi Within 12 Basho', description: 'Reached Makuuchi within 12 basho from entry.' },
  SANSHO_3: { name: 'Three Sansho', description: 'Won three or more special prizes.' },
  SANSHO_10: { name: 'Ten Sansho', description: 'Won ten or more special prizes.' },
  SANSHO_ALL: { name: 'Complete Sansho Record', description: 'Won each special prize at least five times.' },
  GRAND_SLAM: { name: 'Division Yusho Set', description: 'Won yusho in Makushita, Juryo, and Makuuchi.' },
  KINBOSHI_1: { name: 'First Kinboshi', description: 'Earned at least one kinboshi.' },
  KINBOSHI_5: { name: 'Five Kinboshi', description: 'Earned at least five kinboshi.' },
  KIMARITE_20: { name: 'Twenty Winning Kimarite', description: 'Won with at least twenty different kimarite.' },
  FIRST_STEP: { name: 'First Win', description: 'Recorded a first win on the professional dohyo.' },
};

const CAREER_RECORD_BADGE_EN_LABELS: Record<CareerRecordBadgeKey, string> = {
  YOKOZUNA_REACHED: 'Reached Yokozuna',
  OZEKI_REACHED: 'Reached Ozeki',
  MAKUUCHI_REACHED: 'Reached Makuuchi',
  SEKITORI_REACHED: 'Reached Sekitori',
  MAKUUCHI_YUSHO: 'Makuuchi Yusho',
  JURYO_YUSHO: 'Juryo Yusho',
  SANSHO: 'Sansho',
  KINBOSHI: 'Kinboshi',
  DOUBLE_DIGIT_WINS: 'Double-Digit Wins',
  HIGH_WIN_RATE: 'High Win Rate',
  LONG_CAREER: 'Long Career',
  KACHIKOSHI_STREAK: 'Kachi-Koshi Streak',
};

export const hasJapaneseText = (value: string | null | undefined): boolean =>
  Boolean(value && JAPANESE_TEXT_PATTERN.test(value));

export const textForLocale = (
  locale: LocaleCode,
  value: string | null | undefined,
  englishFallback: string,
): string => {
  if (locale !== 'en') return value ?? englishFallback;
  if (!value || hasJapaneseText(value)) return englishFallback;
  return value;
};

export const formatReportBashoLabel = (
  year: number,
  month: number,
  locale: LocaleCode,
): string => formatBaseBashoLabel(year, month, locale);

export const formatReportRankLabel = (rank: Rank, locale: LocaleCode): string =>
  formatBaseRankDisplayName(rank, locale);

export const formatReportHighestRankLabel = (rank: Rank, locale: LocaleCode): string =>
  formatBaseHighestRankDisplayName(rank, locale);

export const formatReportRankMovement = (
  currentRank: Rank,
  nextRank: Rank | undefined,
  deltaValue: number,
  locale: LocaleCode,
): string => formatRankMovementDisplay(currentRank, nextRank, deltaValue, locale);

export const formatReportRecordText = (
  wins: number,
  losses: number,
  absent: number,
  locale: LocaleCode,
): string =>
  locale === 'en'
    ? `${wins}-${losses}${absent > 0 ? `, ${absent} absences` : ''}`
    : `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ''}`;

export const formatReportBashoCount = (count: number, locale: LocaleCode): string =>
  locale === 'en' ? `${count} basho` : `${count}場所`;

export const formatReportBoutCount = (count: number, locale: LocaleCode): string =>
  locale === 'en' ? `${count} bouts` : `${count}番`;

export const formatReportAge = (age: number, locale: LocaleCode): string =>
  locale === 'en' ? `${age} yrs` : `${age}歳`;

export const formatReportCount = (
  count: number,
  unit: 'times' | 'records' | 'slots',
  locale: LocaleCode,
): string => {
  if (locale !== 'en') {
    if (unit === 'times') return `${count}回`;
    if (unit === 'records') return `${count}件`;
    return `${count}枠`;
  }
  if (unit === 'times') return String(count);
  if (unit === 'records') return `${count} records`;
  return `${count} slots`;
};

export const formatReportDivisionLabel = (division: string, locale: LocaleCode): string => {
  if (locale === 'en') return DIVISION_EN_LABELS[division] ?? division;
  if (division === 'Makuuchi') return '幕内';
  if (division === 'Juryo') return '十両';
  if (division === 'Makushita') return '幕下';
  if (division === 'Sandanme') return '三段目';
  if (division === 'Jonidan') return '序二段';
  if (division === 'Jonokuchi') return '序ノ口';
  return '前相撲';
};

export const formatReportSpecialPrizeLabel = (prize: string, locale: LocaleCode): string =>
  locale === 'en' ? SPECIAL_PRIZE_EN_LABELS[prize] ?? prize : prize;

export const formatReportSpecialPrizeList = (prizes: readonly string[] | undefined, locale: LocaleCode): string =>
  prizes?.length
    ? prizes.map((prize) => formatReportSpecialPrizeLabel(prize, locale)).join(' / ')
    : locale === 'en' ? 'No prizes' : '表彰なし';

export const formatReportAxisRankLabel = (value: number, locale: LocaleCode): string => {
  const abs = Math.abs(value);
  if (abs === 0) return locale === 'en' ? 'Yokozuna' : '横綱';
  if (abs === 10) return locale === 'en' ? 'Ozeki' : '大関';
  if (abs === 40) return locale === 'en' ? 'Makuuchi' : '幕内';
  if (abs === 60) return locale === 'en' ? 'Juryo' : '十両';
  if (abs === 80) return locale === 'en' ? 'Makushita' : '幕下';
  if (abs === 150) return locale === 'en' ? 'Sandanme' : '三段目';
  if (abs === 260) return locale === 'en' ? 'Jonidan' : '序二段';
  if (abs === 470) return locale === 'en' ? 'Jonokuchi' : '序ノ口';
  return '';
};

export const formatReportTimelineEventLabel = (
  type: TimelineEvent['type'],
  locale: LocaleCode,
): string => locale === 'en' ? TIMELINE_EVENT_EN_LABELS[type] : TIMELINE_EVENT_JA_LABELS[type];

export const formatPersonalityLabel = (personality: string, locale: LocaleCode): string =>
  locale === 'en' ? PERSONALITY_EN_LABELS[personality] ?? personality : personality;

export const formatTraitCategoryLabel = (category: string | undefined, locale: LocaleCode): string =>
  locale === 'en'
    ? TRAIT_CATEGORY_EN_LABELS[category ?? ''] ?? 'Trait'
    : TRAIT_CATEGORY_LABELS[category ?? ''] ?? '特性';

export const formatTraitAcquisitionLabel = (entry: TraitJourneyEntry, locale: LocaleCode): string => {
  if (locale !== 'en') return formatBaseTraitAcquisitionLabel(entry);
  if (entry.legacy) return 'Legacy career';
  if (entry.learnedYear && entry.learnedMonth) {
    return formatReportBashoLabel(entry.learnedYear, entry.learnedMonth, locale);
  }
  return 'Timing unknown';
};

export const formatTraitName = (trait: Trait, fallback: string | undefined, locale: LocaleCode): string =>
  locale === 'en' ? TRAIT_EN_LABELS[trait]?.name ?? trait : fallback ?? trait;

export const formatTraitDescription = (
  trait: Trait,
  fallback: string | undefined,
  locale: LocaleCode,
): string =>
  locale === 'en' ? TRAIT_EN_LABELS[trait]?.description ?? 'Trait effect recorded.' : fallback ?? '効果説明なし';

export const formatCareerRecordBadgeLabel = (
  key: CareerRecordBadgeKey,
  locale: LocaleCode,
): string => locale === 'en' ? CAREER_RECORD_BADGE_EN_LABELS[key] : resolveCareerRecordBadgeLabel(key);

export const formatCareerRecordBadgeDetail = (
  key: CareerRecordBadgeKey,
  detail: string,
  locale: LocaleCode,
): string => {
  if (locale !== 'en') return detail;
  if (key === 'YOKOZUNA_REACHED' || key === 'OZEKI_REACHED' || key === 'MAKUUCHI_REACHED' || key === 'SEKITORI_REACHED') {
    return 'Highest-rank milestone recorded.';
  }
  if (key === 'MAKUUCHI_YUSHO' || key === 'JURYO_YUSHO') return 'Championship milestone recorded.';
  if (key === 'SANSHO' || key === 'KINBOSHI') return 'Special achievement recorded.';
  if (key === 'DOUBLE_DIGIT_WINS') return 'A double-digit basho was recorded.';
  if (key === 'HIGH_WIN_RATE') return 'Career win rate was high enough for a record bonus.';
  if (key === 'LONG_CAREER') return 'Long career length was recorded.';
  return 'A sustained winning-record streak was recorded.';
};

export const localizeAchievement = (achievement: Achievement, locale: LocaleCode): Achievement => {
  if (locale !== 'en') return achievement;
  const labels = ACHIEVEMENT_EN_LABELS[achievement.id];
  if (!labels) return achievement;
  return {
    ...achievement,
    name: labels.name,
    description: labels.description,
  };
};

export const buildEnglishAchievementSummary = (status: { history: { maxRank: Rank; yushoCount: { makuuchi: number }; totalWins: number; totalLosses: number; totalAbsent: number } }): string => {
  const maxRank = formatReportHighestRankLabel(status.history.maxRank, 'en');
  const record = formatReportRecordText(status.history.totalWins, status.history.totalLosses, status.history.totalAbsent, 'en');
  if (status.history.yushoCount.makuuchi > 0) {
    return `A saved career led by ${status.history.yushoCount.makuuchi} Makuuchi yusho, with a peak rank of ${maxRank} and a final record of ${record}.`;
  }
  return `A saved career that reached ${maxRank}, finishing with a final record of ${record}.`;
};
