import type { BodyType, KimariteRepertoire, RikishiStatus, StyleArchetype, Trait } from '../models';
import type { KimariteStyle } from './catalog';
import type { BoutEngagement } from './engagement';

type StatKey = keyof RikishiStatus['stats'];

/**
 * 決まり手選択・取組相互作用（engagement）向けに共有するプレイヤ視点の型。
 * selection.ts / engagement.ts / battle.ts から共通で参照するためここに切り出す。
 */
export interface KimariteCompetitorProfile {
  style: KimariteStyle;
  bodyType: BodyType;
  heightCm: number;
  weightKg: number;
  stats: Partial<Record<StatKey, number>>;
  traits: Trait[];
  preferredMove?: string;
  historyCounts?: Record<string, number>;
  designedPrimaryStyle?: KimariteStyle;
  designedSecondaryStyle?: KimariteStyle;
  designedSecretStyle?: KimariteStyle;
  strongStyles?: StyleArchetype[];
  weakStyles?: StyleArchetype[];
  kataSettled?: boolean;
  repertoire?: KimariteRepertoire;
}

export interface KimariteBoutContext {
  isHighPressure?: boolean;
  isLastDay?: boolean;
  isUnderdog?: boolean;
  isEdgeCandidate?: boolean;
  weightDiff?: number;
  heightDiff?: number;
  /** 2*winProb - 1: +1 = dominant favorite, -1 = heavy underdog. */
  dominance?: number;
  /** 千秋楽 優勝決定 or 直接タイトル争いの結び */
  isTitleDecider?: boolean;
  /** 平幕が横綱/大関を倒す取組 */
  isKinboshiChance?: boolean;
  /** 敗者が大きく格下（番付差） */
  loserRankGap?: number;
  /** 敗者がスタミナ切れ・体勢崩壊しやすい */
  loserExhausted?: boolean;
  /** battle.ts で事前に sample 済みの取組形態。未指定なら selection.ts で sample する。 */
  engagement?: BoutEngagement;
}
