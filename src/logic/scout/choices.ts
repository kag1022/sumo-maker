/**
 * 力士スカウトの具体的選択肢と DNA 修飾子の定義
 * @CODING_GUIDELINES.md に従い、Named Export と Arrow Function を使用
 */

import { RikishiGenome } from '../models';

export type ScoutBackgroundId = 'JUDO' | 'TRACK' | 'RUGBY' | 'CLUB' | 'NATURE' | 'SCHOOL';
export type ScoutPhysicalTraitId = 'FLEXIBLE' | 'GIANT' | 'POWER' | 'AGILE' | 'TOUGH';
export type ScoutStyleId = 'SPEED' | 'DEFENSE' | 'TECH' | 'YOTSU' | 'FIGHT';

export interface ScoutChoiceInfo {
  id: string;
  name: string;
  help: string;
}

/**
 * ゲノム（DNA）への具体的な加算値・係数
 * 各カテゴリのプロパティは RikishiGenome の構造に対応
 */
export interface DNAModifiers {
  base?: Partial<RikishiGenome['base']>;
  growth?: Partial<RikishiGenome['growth']>;
  durability?: Partial<RikishiGenome['durability']>;
  variance?: Partial<RikishiGenome['variance']>;
}

export const SCOUT_BACKGROUNDS: Record<ScoutBackgroundId, ScoutChoiceInfo & { modifiers: DNAModifiers }> = {
  JUDO: {
    id: 'JUDO',
    name: '柔道',
    help: '組力と技術の基礎が高く、パワーの限界値も優秀。',
    modifiers: {
      base: { techCeiling: 10, powerCeiling: 5, ringSense: 5 },
    },
  },
  TRACK: {
    id: 'TRACK',
    name: '陸上',
    help: '瞬発力に優れ、鋭い出足を持つ。',
    modifiers: {
      base: { speedCeiling: 15, styleFit: 5 },
    },
  },
  RUGBY: {
    id: 'RUGBY',
    name: 'ラグビー',
    help: '強靭な肉体と推進力を持ち、押し相撲に向く。',
    modifiers: {
      base: { powerCeiling: 10, speedCeiling: 5 },
    },
  },
  CLUB: {
    id: 'CLUB',
    name: '相撲クラブ',
    help: '幼少期からの経験により、土俵感覚とバランスが良い。',
    modifiers: {
      base: { ringSense: 10, techCeiling: 5, styleFit: 5 },
    },
  },
  NATURE: {
    id: 'NATURE',
    name: '自然生活',
    help: '足腰が非常に強く、怪我にも強い。',
    modifiers: {
      base: { ringSense: 5, powerCeiling: 5 },
      durability: { baseInjuryRisk: -0.2, recoveryRate: 0.2 },
    },
  },
  SCHOOL: {
    id: 'SCHOOL',
    name: '相撲部',
    help: '戦術理解が早く、安定したキャリアを築きやすい。',
    modifiers: {
      base: { styleFit: 15 },
      variance: { slumpRecovery: 10 },
      growth: { adaptability: 10 },
    },
  },
};

export const SCOUT_PHYSICAL_TRAITS: Record<ScoutPhysicalTraitId, ScoutChoiceInfo & { modifiers: DNAModifiers }> = {
  FLEXIBLE: {
    id: 'FLEXIBLE',
    name: '柔軟',
    help: '関節が柔らかく、投げ技のキレと回復力に秀でる',
    modifiers: {
      base: { techCeiling: 10 },
      durability: { recoveryRate: 0.3 },
    },
  },
  GIANT: {
    id: 'GIANT',
    name: '巨躯',
    help: '規格外の体躯を持つが、膝への負担は大きい。',
    modifiers: {
      base: { powerCeiling: 15 },
      durability: { baseInjuryRisk: 0.2 },
    },
  },
  POWER: {
    id: 'POWER',
    name: '剛力',
    help: '圧倒的な筋力を誇り、力で相手を圧倒する。',
    modifiers: {
      base: { powerCeiling: 20 },
    },
  },
  AGILE: {
    id: 'AGILE',
    name: '俊敏',
    help: '反射神経が鋭く、素早い動きで相手を翻弄する。',
    modifiers: {
      base: { speedCeiling: 20 },
    },
  },
  TOUGH: {
    id: 'TOUGH',
    name: '頑強',
    help: '滅多なことでは怪我をしない、タフな肉体。',
    modifiers: {
      durability: { baseInjuryRisk: -0.4, chronicResistance: 15 },
    },
  },
};

export const SCOUT_STYLES: Record<ScoutStyleId, ScoutChoiceInfo & { modifiers: DNAModifiers }> = {
  SPEED: {
    id: 'SPEED',
    name: '速攻',
    help: '立合いの一撃にすべてを賭ける、早期完成型。',
    modifiers: {
      growth: { maturationAge: -3 },
      variance: { clutchBias: 10 },
    },
  },
  DEFENSE: {
    id: 'DEFENSE',
    name: '堅守',
    help: '土俵際で粘り強く、息の長い活躍が期待できる。',
    modifiers: {
      growth: { peakLength: 3 },
      base: { ringSense: 10 },
    },
  },
  TECH: {
    id: 'TECH',
    name: '巧手',
    help: '多彩な技を使いこなし、相手に応じた相撲を取る。',
    modifiers: {
      base: { techCeiling: 15 },
      growth: { adaptability: 15 },
    },
  },
  YOTSU: {
    id: 'YOTSU',
    name: '四つ',
    help: 'オーソドックスな四つ相撲。安定感がある。',
    modifiers: {
      base: { powerCeiling: 5, techCeiling: 5, ringSense: 5 },
    },
  },
  FIGHT: {
    id: 'FIGHT',
    name: '喧嘩',
    help: '激しい闘争心を持ち、波の激しい取組を見せる。',
    modifiers: {
      variance: { formVolatility: 20, clutchBias: 20 },
    },
  },
};
