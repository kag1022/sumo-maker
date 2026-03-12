import {
  AmateurBackground,
  BodyConstitution,
  DebtCardId,
  InjuryResistanceType,
  MentalTraitType,
  OyakataBlueprint,
  StyleArchetype,
} from '../../logic/models';
import {
  AMATEUR_BACKGROUND_CONFIG,
  BODY_CONSTITUTION_LABELS,
  DEBT_CARD_LABELS,
  MENTAL_TRAIT_LABELS,
  STYLE_LABELS,
} from '../../logic/phaseA';

export type ScoutSectionId = 'oyakata' | 'body' | 'style' | 'risk';

export interface HomeActionCard {
  id: 'start' | 'resume' | 'archive';
  title: string;
  body: string;
  value?: string;
}

export interface HomeProgressSummary {
  walletPoints: number | null;
  walletCap: number | null;
  archiveCount: number;
  collectionCount: number;
  unshelvedCount: number;
}

export interface ReportTimelineItem {
  key: string;
  dateLabel: string;
  title: string;
  summary: string;
  tone: 'accent' | 'danger' | 'neutral';
}

export interface ReportMetricBlock {
  label: string;
  value: string;
  note?: string;
}

export type ArchiveViewMode = 'ledger' | 'lineage';

export const SCOUT_SECTION_LABELS: Record<ScoutSectionId, string> = {
  oyakata: '親方',
  body: '体格',
  style: '型',
  risk: 'リスク',
};

export const BODY_CONSTITUTION_SHORT_LABELS: Record<BodyConstitution, string> = {
  BALANCED_FRAME: '均整型',
  HEAVY_BULK: '重量型',
  LONG_REACH: '長身型',
  SPRING_LEGS: '足腰型',
};

export const BODY_CONSTITUTION_COPY: Record<BodyConstitution, string> = {
  BALANCED_FRAME: '癖が少なく、土台を広く作る。',
  HEAVY_BULK: '圧力で押し込む大型の設計。',
  LONG_REACH: '間合いと差し手の長さで勝負する。',
  SPRING_LEGS: '下半身で粘り、終盤まで崩れにくい。',
};

export const BACKGROUND_SHORT_LABELS: Record<AmateurBackground, string> = {
  MIDDLE_SCHOOL: '中卒たたき上げ',
  HIGH_SCHOOL: '高校出',
  STUDENT_ELITE: '学生エリート',
  COLLEGE_YOKOZUNA: '学生横綱',
};

export const BACKGROUND_COPY: Record<AmateurBackground, string> = {
  MIDDLE_SCHOOL: '若く入り、長い育成期間で伸ばす。',
  HIGH_SCHOOL: '標準的で扱いやすい入門線。',
  STUDENT_ELITE: '序盤を縮め、関取到達を狙いやすい。',
  COLLEGE_YOKOZUNA: '即戦力だが設計コストは重い。',
};

export const MENTAL_TRAIT_SHORT_LABELS: Record<MentalTraitType, string> = {
  CALM_ENGINE: '平常心',
  BIG_STAGE: '大舞台型',
  VOLATILE_FIRE: '激情型',
  STONEWALL: '不動心',
};

export const MENTAL_TRAIT_COPY: Record<MentalTraitType, string> = {
  CALM_ENGINE: '長い年数でも崩れにくい。',
  BIG_STAGE: '大一番で伸びる余地がある。',
  VOLATILE_FIRE: '波は大きいが爆発力が出る。',
  STONEWALL: '失速や雑音に引っ張られにくい。',
};

export const INJURY_RESISTANCE_LABELS: Record<InjuryResistanceType, string> = {
  FRAGILE: '脆い',
  STANDARD: '標準',
  IRON_BODY: '頑丈',
};

export const INJURY_RESISTANCE_COPY: Record<InjuryResistanceType, string> = {
  FRAGILE: '怪我の揺れがキャリアに出やすい。',
  STANDARD: '怪我リスクは標準的。',
  IRON_BODY: '長い土俵人生を支えやすい。',
};

export const DEBT_CARD_COPY: Record<DebtCardId, string> = {
  OLD_KNEE: '膝の古傷を抱えて始まる。',
  PRESSURE_LINEAGE: '失速した時に気力が削れやすい。',
  LATE_START: '入門が遅れ、序盤能力が下がる。',
};

export const STYLE_SHORT_LABELS: Record<StyleArchetype, string> = {
  ...STYLE_LABELS,
  NAGE_TECH: '投げ技',
  POWER_PRESSURE: '圧力相撲',
};

export const STYLE_COPY: Record<StyleArchetype, string> = {
  YOTSU: '組み止めて前に出る。',
  TSUKI_OSHI: '離れて押し切る。',
  MOROZASHI: '差して崩し、寄る。',
  DOHYOUGIWA: '際の残しと逆転で拾う。',
  NAGE_TECH: '投げと崩しで流れを変える。',
  POWER_PRESSURE: '重みと圧で土俵を狭める。',
};

export const OYAKATA_COPY = (oyakata: OyakataBlueprint): string =>
  `${oyakata.advantage} / 弱み: ${oyakata.drawback}`;

export const getBodyConstitutionLabel = (value: BodyConstitution): string =>
  BODY_CONSTITUTION_SHORT_LABELS[value] ?? BODY_CONSTITUTION_LABELS[value];

export const getBackgroundLabel = (value: AmateurBackground): string =>
  BACKGROUND_SHORT_LABELS[value] ?? AMATEUR_BACKGROUND_CONFIG[value].label;

export const getMentalTraitLabel = (value: MentalTraitType): string =>
  MENTAL_TRAIT_SHORT_LABELS[value] ?? MENTAL_TRAIT_LABELS[value];

export const getDebtCardLabel = (value: DebtCardId): string => DEBT_CARD_LABELS[value];

export const getStyleLabelJa = (value: StyleArchetype): string => STYLE_SHORT_LABELS[value];
