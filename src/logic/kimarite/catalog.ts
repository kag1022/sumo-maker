import { RikishiStatus } from '../models';

export type KimariteOutcome = 'WIN' | 'LOSS';
export type KimariteClass = 'PUSH' | 'GRAPPLE' | 'THROW' | 'TECH' | 'REVERSAL' | 'FOUL';
export type KimariteStyle = 'PUSH' | 'GRAPPLE' | 'TECHNIQUE' | 'BALANCE';
export type KimariteTag = 'rare' | 'slapdown' | 'belt' | 'edge' | 'mistake';

export type StatKey = keyof RikishiStatus['stats'];

export interface KimariteDef {
  name: string;
  outcome: KimariteOutcome;
  class: KimariteClass;
  baseWeight: number;
  styleAffinity: Record<KimariteStyle, number>;
  statAffinity: Partial<Record<StatKey, number>>;
  sizeAffinity: {
    heightDiff: number;
    weightDiff: number;
  };
  tags: KimariteTag[];
  constraints?: {
    reversalOnly?: boolean;
  };
}

const BASE_STYLE_AFFINITY: Record<KimariteStyle, number> = {
  PUSH: 1,
  GRAPPLE: 1,
  TECHNIQUE: 1,
  BALANCE: 1,
};

const S = BASE_STYLE_AFFINITY;

const createDef = (def: Omit<KimariteDef, 'styleAffinity'> & { styleAffinity?: Partial<Record<KimariteStyle, number>> }): KimariteDef => ({
  ...def,
  styleAffinity: {
    ...S,
    ...(def.styleAffinity || {}),
  },
});

export const KIMARITE_ALIAS_MAP: Record<string, string> = {
  'すくい投げ': '掬い投げ',
};

export const normalizeKimariteName = (name: string): string => KIMARITE_ALIAS_MAP[name] || name;

export const KIMARITE_CATALOG: KimariteDef[] = [
  createDef({ name: '押し出し', outcome: 'WIN', class: 'PUSH', baseWeight: 11, styleAffinity: { PUSH: 1.35 }, statAffinity: { tsuki: 0.4, oshi: 0.9, deashi: 0.45, power: 0.2 }, sizeAffinity: { heightDiff: 0.003, weightDiff: 0.01 }, tags: [] }),
  createDef({ name: '押し倒し', outcome: 'WIN', class: 'PUSH', baseWeight: 8, styleAffinity: { PUSH: 1.3 }, statAffinity: { tsuki: 0.35, oshi: 0.8, power: 0.25 }, sizeAffinity: { heightDiff: 0.002, weightDiff: 0.009 }, tags: [] }),
  createDef({ name: '突き出し', outcome: 'WIN', class: 'PUSH', baseWeight: 9, styleAffinity: { PUSH: 1.35 }, statAffinity: { tsuki: 0.9, deashi: 0.45, power: 0.2 }, sizeAffinity: { heightDiff: 0.003, weightDiff: 0.006 }, tags: [] }),
  createDef({ name: '突き倒し', outcome: 'WIN', class: 'PUSH', baseWeight: 7, styleAffinity: { PUSH: 1.25 }, statAffinity: { tsuki: 0.7, oshi: 0.35, deashi: 0.2 }, sizeAffinity: { heightDiff: 0.002, weightDiff: 0.005 }, tags: [] }),
  createDef({ name: '浴びせ倒し', outcome: 'WIN', class: 'GRAPPLE', baseWeight: 2.6, styleAffinity: { GRAPPLE: 1.2, PUSH: 1.05 }, statAffinity: { oshi: 0.35, kumi: 0.4, power: 0.4 }, sizeAffinity: { heightDiff: 0.002, weightDiff: 0.008 }, tags: [] }),

  createDef({ name: '寄り切り', outcome: 'WIN', class: 'GRAPPLE', baseWeight: 12, styleAffinity: { GRAPPLE: 1.35 }, statAffinity: { kumi: 0.8, koshi: 0.8, power: 0.35, deashi: 0.25 }, sizeAffinity: { heightDiff: 0.002, weightDiff: 0.012 }, tags: ['belt'] }),
  createDef({ name: '寄り倒し', outcome: 'WIN', class: 'GRAPPLE', baseWeight: 7.5, styleAffinity: { GRAPPLE: 1.25 }, statAffinity: { kumi: 0.65, koshi: 0.65, power: 0.3 }, sizeAffinity: { heightDiff: 0.001, weightDiff: 0.01 }, tags: ['belt'] }),
  createDef({ name: '吊り出し', outcome: 'WIN', class: 'GRAPPLE', baseWeight: 2.8, styleAffinity: { GRAPPLE: 1.2 }, statAffinity: { power: 0.85, kumi: 0.45, koshi: 0.35 }, sizeAffinity: { heightDiff: 0, weightDiff: 0.013 }, tags: ['belt', 'rare'] }),
  createDef({ name: '送り出し', outcome: 'WIN', class: 'GRAPPLE', baseWeight: 4.5, styleAffinity: { GRAPPLE: 1.1, BALANCE: 1.1 }, statAffinity: { deashi: 0.6, kumi: 0.35, waza: 0.3 }, sizeAffinity: { heightDiff: 0, weightDiff: 0.003 }, tags: [] }),
  createDef({ name: '送り倒し', outcome: 'WIN', class: 'GRAPPLE', baseWeight: 2.1, styleAffinity: { GRAPPLE: 1.1, BALANCE: 1.1 }, statAffinity: { deashi: 0.55, kumi: 0.3, power: 0.2 }, sizeAffinity: { heightDiff: 0, weightDiff: 0.002 }, tags: [] }),
  createDef({ name: '極め出し', outcome: 'WIN', class: 'GRAPPLE', baseWeight: 1.4, styleAffinity: { GRAPPLE: 1.2, TECHNIQUE: 1.1 }, statAffinity: { kumi: 0.5, waza: 0.35, power: 0.3 }, sizeAffinity: { heightDiff: 0.001, weightDiff: 0.005 }, tags: ['belt', 'rare'] }),
  createDef({ name: '極め倒し', outcome: 'WIN', class: 'GRAPPLE', baseWeight: 1.1, styleAffinity: { GRAPPLE: 1.15, TECHNIQUE: 1.15 }, statAffinity: { kumi: 0.45, waza: 0.45, power: 0.25 }, sizeAffinity: { heightDiff: 0.001, weightDiff: 0.004 }, tags: ['belt', 'rare'] }),

  createDef({ name: '上手投げ', outcome: 'WIN', class: 'THROW', baseWeight: 6.8, styleAffinity: { GRAPPLE: 1.2, TECHNIQUE: 1.1 }, statAffinity: { nage: 0.9, kumi: 0.45, power: 0.2 }, sizeAffinity: { heightDiff: 0.001, weightDiff: 0.004 }, tags: ['belt'] }),
  createDef({ name: '下手投げ', outcome: 'WIN', class: 'THROW', baseWeight: 5.6, styleAffinity: { GRAPPLE: 1.15, TECHNIQUE: 1.1 }, statAffinity: { nage: 0.85, kumi: 0.4, waza: 0.25 }, sizeAffinity: { heightDiff: 0.001, weightDiff: 0.002 }, tags: ['belt'] }),
  createDef({ name: '小手投げ', outcome: 'WIN', class: 'THROW', baseWeight: 4.2, styleAffinity: { TECHNIQUE: 1.15, GRAPPLE: 1.1 }, statAffinity: { nage: 0.7, waza: 0.4, tsuki: 0.2 }, sizeAffinity: { heightDiff: 0.001, weightDiff: 0 }, tags: ['rare'] }),
  createDef({ name: '掬い投げ', outcome: 'WIN', class: 'THROW', baseWeight: 3.8, styleAffinity: { TECHNIQUE: 1.15, GRAPPLE: 1.1 }, statAffinity: { nage: 0.65, waza: 0.5, kumi: 0.25 }, sizeAffinity: { heightDiff: 0, weightDiff: 0.002 }, tags: [] }),
  createDef({ name: '上手出し投げ', outcome: 'WIN', class: 'THROW', baseWeight: 2.2, styleAffinity: { TECHNIQUE: 1.2, GRAPPLE: 1.05 }, statAffinity: { nage: 0.7, waza: 0.55 }, sizeAffinity: { heightDiff: 0, weightDiff: 0 }, tags: ['rare'] }),
  createDef({ name: '下手出し投げ', outcome: 'WIN', class: 'THROW', baseWeight: 2.1, styleAffinity: { TECHNIQUE: 1.2, GRAPPLE: 1.05 }, statAffinity: { nage: 0.68, waza: 0.52 }, sizeAffinity: { heightDiff: 0, weightDiff: 0 }, tags: ['rare'] }),
  createDef({ name: '送り投げ', outcome: 'WIN', class: 'THROW', baseWeight: 1.6, styleAffinity: { TECHNIQUE: 1.15, GRAPPLE: 1.1 }, statAffinity: { nage: 0.5, waza: 0.45, deashi: 0.25 }, sizeAffinity: { heightDiff: 0, weightDiff: 0.001 }, tags: ['rare'] }),
  createDef({ name: '首投げ', outcome: 'WIN', class: 'THROW', baseWeight: 1.8, styleAffinity: { TECHNIQUE: 1.2 }, statAffinity: { nage: 0.55, waza: 0.5, power: 0.2 }, sizeAffinity: { heightDiff: 0, weightDiff: 0.001 }, tags: ['rare'] }),

  createDef({ name: '叩き込み', outcome: 'WIN', class: 'TECH', baseWeight: 4.8, styleAffinity: { TECHNIQUE: 1.35, PUSH: 1.05 }, statAffinity: { waza: 0.75, deashi: 0.4, tsuki: 0.25 }, sizeAffinity: { heightDiff: 0.002, weightDiff: -0.003 }, tags: ['slapdown'] }),
  createDef({ name: '引き落とし', outcome: 'WIN', class: 'TECH', baseWeight: 4.2, styleAffinity: { TECHNIQUE: 1.35 }, statAffinity: { waza: 0.7, deashi: 0.3, tsuki: 0.2 }, sizeAffinity: { heightDiff: 0.002, weightDiff: -0.004 }, tags: ['slapdown'] }),
  createDef({ name: '突き落とし', outcome: 'WIN', class: 'TECH', baseWeight: 5, styleAffinity: { TECHNIQUE: 1.3, PUSH: 1.15 }, statAffinity: { tsuki: 0.45, waza: 0.55, deashi: 0.3 }, sizeAffinity: { heightDiff: 0.002, weightDiff: -0.002 }, tags: ['slapdown'] }),
  createDef({ name: '肩透かし', outcome: 'WIN', class: 'TECH', baseWeight: 2.3, styleAffinity: { TECHNIQUE: 1.35 }, statAffinity: { waza: 0.75, deashi: 0.25 }, sizeAffinity: { heightDiff: 0.001, weightDiff: -0.002 }, tags: ['rare', 'slapdown'] }),
  createDef({ name: '蹴手繰り', outcome: 'WIN', class: 'TECH', baseWeight: 1.6, styleAffinity: { TECHNIQUE: 1.3 }, statAffinity: { waza: 0.75, deashi: 0.35 }, sizeAffinity: { heightDiff: 0, weightDiff: -0.003 }, tags: ['rare'] }),
  createDef({ name: 'とったり', outcome: 'WIN', class: 'TECH', baseWeight: 1.4, styleAffinity: { TECHNIQUE: 1.25 }, statAffinity: { waza: 0.8, nage: 0.35 }, sizeAffinity: { heightDiff: 0, weightDiff: -0.002 }, tags: ['rare'] }),
  createDef({ name: '引っ掛け', outcome: 'WIN', class: 'TECH', baseWeight: 1.5, styleAffinity: { TECHNIQUE: 1.2 }, statAffinity: { waza: 0.75, nage: 0.25, deashi: 0.15 }, sizeAffinity: { heightDiff: 0, weightDiff: -0.001 }, tags: ['rare'] }),
  createDef({ name: '素首落とし', outcome: 'WIN', class: 'TECH', baseWeight: 1.2, styleAffinity: { TECHNIQUE: 1.25 }, statAffinity: { waza: 0.7, tsuki: 0.2, deashi: 0.2 }, sizeAffinity: { heightDiff: 0.001, weightDiff: -0.002 }, tags: ['rare', 'slapdown'] }),
  createDef({ name: '渡し込み', outcome: 'WIN', class: 'TECH', baseWeight: 1.1, styleAffinity: { TECHNIQUE: 1.2, GRAPPLE: 1.1 }, statAffinity: { waza: 0.7, kumi: 0.3, deashi: 0.15 }, sizeAffinity: { heightDiff: 0, weightDiff: -0.001 }, tags: ['belt', 'rare'] }),
  createDef({ name: '小股掬い', outcome: 'WIN', class: 'TECH', baseWeight: 0.8, styleAffinity: { TECHNIQUE: 1.25 }, statAffinity: { waza: 0.82, nage: 0.28, deashi: 0.12 }, sizeAffinity: { heightDiff: 0, weightDiff: -0.002 }, tags: ['rare'] }),

  createDef({ name: 'うっちゃり', outcome: 'WIN', class: 'REVERSAL', baseWeight: 0.9, styleAffinity: { GRAPPLE: 1.15, TECHNIQUE: 1.2 }, statAffinity: { koshi: 0.55, waza: 0.55, power: 0.25 }, sizeAffinity: { heightDiff: 0, weightDiff: -0.002 }, tags: ['edge', 'rare'], constraints: { reversalOnly: true } }),
  createDef({ name: '網打ち', outcome: 'WIN', class: 'REVERSAL', baseWeight: 0.7, styleAffinity: { TECHNIQUE: 1.25 }, statAffinity: { waza: 0.8, nage: 0.35 }, sizeAffinity: { heightDiff: 0.001, weightDiff: -0.001 }, tags: ['edge', 'rare'], constraints: { reversalOnly: true } }),
  createDef({ name: '一本背負い', outcome: 'WIN', class: 'REVERSAL', baseWeight: 0.5, styleAffinity: { TECHNIQUE: 1.3 }, statAffinity: { waza: 0.85, nage: 0.35 }, sizeAffinity: { heightDiff: 0, weightDiff: -0.003 }, tags: ['edge', 'rare'], constraints: { reversalOnly: true } }),
  createDef({ name: '河津掛け', outcome: 'WIN', class: 'REVERSAL', baseWeight: 0.35, styleAffinity: { TECHNIQUE: 1.25 }, statAffinity: { waza: 0.8, deashi: 0.3 }, sizeAffinity: { heightDiff: 0, weightDiff: -0.004 }, tags: ['edge', 'rare'], constraints: { reversalOnly: true } }),
  createDef({ name: '勇み足', outcome: 'WIN', class: 'FOUL', baseWeight: 0.2, styleAffinity: { BALANCE: 1.1 }, statAffinity: { waza: 0.2 }, sizeAffinity: { heightDiff: 0, weightDiff: 0 }, tags: ['mistake', 'rare'], constraints: { reversalOnly: true } }),

  createDef({ name: '押し出し', outcome: 'LOSS', class: 'PUSH', baseWeight: 10.5, styleAffinity: { PUSH: 1.3 }, statAffinity: { tsuki: 0.35, oshi: 0.75 }, sizeAffinity: { heightDiff: -0.002, weightDiff: -0.008 }, tags: [] }),
  createDef({ name: '寄り切り', outcome: 'LOSS', class: 'GRAPPLE', baseWeight: 11, styleAffinity: { GRAPPLE: 1.35 }, statAffinity: { kumi: 0.7, koshi: 0.7 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.01 }, tags: ['belt'] }),
  createDef({ name: '押し倒し', outcome: 'LOSS', class: 'PUSH', baseWeight: 7.8, styleAffinity: { PUSH: 1.2 }, statAffinity: { oshi: 0.6, power: 0.2 }, sizeAffinity: { heightDiff: -0.002, weightDiff: -0.007 }, tags: [] }),
  createDef({ name: '寄り倒し', outcome: 'LOSS', class: 'GRAPPLE', baseWeight: 7.4, styleAffinity: { GRAPPLE: 1.2 }, statAffinity: { kumi: 0.6, koshi: 0.6 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.009 }, tags: ['belt'] }),
  createDef({ name: '突き出し', outcome: 'LOSS', class: 'PUSH', baseWeight: 8.6, styleAffinity: { PUSH: 1.25 }, statAffinity: { tsuki: 0.7, deashi: 0.3 }, sizeAffinity: { heightDiff: -0.002, weightDiff: -0.004 }, tags: [] }),
  createDef({ name: '突き倒し', outcome: 'LOSS', class: 'PUSH', baseWeight: 6.4, styleAffinity: { PUSH: 1.15 }, statAffinity: { tsuki: 0.55, oshi: 0.3 }, sizeAffinity: { heightDiff: -0.002, weightDiff: -0.004 }, tags: [] }),
  createDef({ name: '浴びせ倒し', outcome: 'LOSS', class: 'GRAPPLE', baseWeight: 2.3, styleAffinity: { GRAPPLE: 1.15, PUSH: 1.05 }, statAffinity: { kumi: 0.35, power: 0.3 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.006 }, tags: [] }),
  createDef({ name: '上手投げ', outcome: 'LOSS', class: 'THROW', baseWeight: 5.5, styleAffinity: { GRAPPLE: 1.1, TECHNIQUE: 1.1 }, statAffinity: { nage: 0.7, kumi: 0.3 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.002 }, tags: ['belt'] }),
  createDef({ name: '下手投げ', outcome: 'LOSS', class: 'THROW', baseWeight: 4.8, styleAffinity: { GRAPPLE: 1.1, TECHNIQUE: 1.1 }, statAffinity: { nage: 0.65, waza: 0.2 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.001 }, tags: ['belt'] }),
  createDef({ name: '突き落とし', outcome: 'LOSS', class: 'TECH', baseWeight: 4.7, styleAffinity: { TECHNIQUE: 1.15, PUSH: 1.05 }, statAffinity: { tsuki: 0.3, waza: 0.45 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.002 }, tags: ['slapdown'] }),
  createDef({ name: '引き落とし', outcome: 'LOSS', class: 'TECH', baseWeight: 3.8, styleAffinity: { TECHNIQUE: 1.2 }, statAffinity: { waza: 0.55 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.002 }, tags: ['slapdown'] }),
  createDef({ name: '叩き込み', outcome: 'LOSS', class: 'TECH', baseWeight: 4.2, styleAffinity: { TECHNIQUE: 1.2 }, statAffinity: { waza: 0.55 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.002 }, tags: ['slapdown'] }),
  createDef({ name: '吊り出し', outcome: 'LOSS', class: 'GRAPPLE', baseWeight: 2.5, styleAffinity: { GRAPPLE: 1.1 }, statAffinity: { power: 0.6, kumi: 0.3 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.008 }, tags: ['belt', 'rare'] }),
  createDef({ name: '送り出し', outcome: 'LOSS', class: 'GRAPPLE', baseWeight: 4.1, styleAffinity: { GRAPPLE: 1.05, BALANCE: 1.05 }, statAffinity: { deashi: 0.5, waza: 0.2 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.002 }, tags: [] }),
  createDef({ name: '送り倒し', outcome: 'LOSS', class: 'GRAPPLE', baseWeight: 2, styleAffinity: { GRAPPLE: 1.05, BALANCE: 1.05 }, statAffinity: { deashi: 0.45, power: 0.15 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.001 }, tags: [] }),
  createDef({ name: '極め出し', outcome: 'LOSS', class: 'GRAPPLE', baseWeight: 1.3, styleAffinity: { GRAPPLE: 1.15, TECHNIQUE: 1.1 }, statAffinity: { kumi: 0.4, waza: 0.25 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.003 }, tags: ['belt', 'rare'] }),
  createDef({ name: '極め倒し', outcome: 'LOSS', class: 'GRAPPLE', baseWeight: 1, styleAffinity: { GRAPPLE: 1.1, TECHNIQUE: 1.15 }, statAffinity: { kumi: 0.35, waza: 0.35 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.003 }, tags: ['belt', 'rare'] }),
  createDef({ name: '小手投げ', outcome: 'LOSS', class: 'THROW', baseWeight: 3.8, styleAffinity: { TECHNIQUE: 1.15 }, statAffinity: { nage: 0.6, waza: 0.35 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.001 }, tags: ['rare'] }),
  createDef({ name: '掬い投げ', outcome: 'LOSS', class: 'THROW', baseWeight: 3.5, styleAffinity: { TECHNIQUE: 1.15 }, statAffinity: { nage: 0.55, waza: 0.4 }, sizeAffinity: { heightDiff: -0.001, weightDiff: -0.001 }, tags: [] }),
  createDef({ name: '下手出し投げ', outcome: 'LOSS', class: 'THROW', baseWeight: 2, styleAffinity: { TECHNIQUE: 1.15, GRAPPLE: 1.05 }, statAffinity: { nage: 0.52, waza: 0.35 }, sizeAffinity: { heightDiff: -0.001, weightDiff: 0 }, tags: ['rare'] }),
  createDef({ name: '送り投げ', outcome: 'LOSS', class: 'THROW', baseWeight: 1.5, styleAffinity: { TECHNIQUE: 1.1, GRAPPLE: 1.05 }, statAffinity: { nage: 0.42, waza: 0.3, deashi: 0.18 }, sizeAffinity: { heightDiff: 0, weightDiff: 0 }, tags: ['rare'] }),
  createDef({ name: '引っ掛け', outcome: 'LOSS', class: 'TECH', baseWeight: 1.4, styleAffinity: { TECHNIQUE: 1.15 }, statAffinity: { waza: 0.55, deashi: 0.1 }, sizeAffinity: { heightDiff: 0, weightDiff: -0.001 }, tags: ['rare'] }),
  createDef({ name: '素首落とし', outcome: 'LOSS', class: 'TECH', baseWeight: 1.1, styleAffinity: { TECHNIQUE: 1.2 }, statAffinity: { waza: 0.52, tsuki: 0.15 }, sizeAffinity: { heightDiff: 0, weightDiff: -0.001 }, tags: ['rare', 'slapdown'] }),
  createDef({ name: '渡し込み', outcome: 'LOSS', class: 'TECH', baseWeight: 1, styleAffinity: { TECHNIQUE: 1.15, GRAPPLE: 1.05 }, statAffinity: { waza: 0.55, kumi: 0.18 }, sizeAffinity: { heightDiff: 0, weightDiff: -0.001 }, tags: ['belt', 'rare'] }),
  createDef({ name: '小股掬い', outcome: 'LOSS', class: 'TECH', baseWeight: 0.7, styleAffinity: { TECHNIQUE: 1.2 }, statAffinity: { waza: 0.62, nage: 0.18 }, sizeAffinity: { heightDiff: 0, weightDiff: -0.001 }, tags: ['rare'] }),
  createDef({ name: '勇み足', outcome: 'LOSS', class: 'FOUL', baseWeight: 0.7, styleAffinity: { BALANCE: 1.1 }, statAffinity: { waza: 0.1 }, sizeAffinity: { heightDiff: 0, weightDiff: 0 }, tags: ['mistake'] }),
];

export const getKimariteDefsByOutcome = (outcome: KimariteOutcome): KimariteDef[] =>
  KIMARITE_CATALOG.filter((def) => def.outcome === outcome);

export const getReversalKimariteDefs = (): KimariteDef[] =>
  KIMARITE_CATALOG.filter((def) => def.class === 'REVERSAL');
