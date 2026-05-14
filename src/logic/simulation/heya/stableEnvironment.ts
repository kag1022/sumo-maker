import type { RikishiStatus, StableArchetypeId } from '../../models';
import { ICHIMON_BY_ID } from './ichimonCatalog';
import {
  STABLE_ARCHETYPE_CATALOG,
  STABLE_ARCHETYPE_BY_ID,
  type StableArchetypeDefinition,
} from './stableArchetypeCatalog';
import {
  STABLE_CATALOG,
  type StableDefinition,
  type StableScale,
  resolveStableById,
} from './stableCatalog';

export type StableEnvironmentChoiceId = 'AUTO' | StableArchetypeId;

export interface StableEnvironmentChoiceOption {
  id: StableEnvironmentChoiceId;
  label: string;
  summary: string;
  detail: string;
}

export interface StableEnvironmentReading {
  stableName: string;
  ichimonName: string;
  archetypeName: string;
  scaleLabel: string;
  lead: string;
  influenceLines: string[];
}

const SCALE_LABELS: Record<StableScale, string> = {
  SUPER_GIANT: '最大級の大部屋',
  GIANT: '大部屋',
  LARGE: '中大規模',
  MID: '標準規模',
  SMALL: '小部屋',
  TINY: '少数部屋',
};

const ARCHETYPE_READING_COPY: Record<StableArchetypeId, { summary: string; impact: string }> = {
  TRADITIONAL_LARGE: {
    summary: '基礎鍛錬と四つ相撲の土台を重く見る。',
    impact: '腰、組み止める力、番付を長く戦う地力が読み筋になりやすい。',
  },
  TSUKI_OSHI_GROUP: {
    summary: '前に出る圧力と突き押しの反復を重く見る。',
    impact: '立合いと押し切りの勢いが出やすい一方、消耗の出方も読みどころになる。',
  },
  GIANT_YOTSU: {
    summary: '大きな体で組み止める相撲を重く見る。',
    impact: '馬力と四つの強さが軸になりやすく、速さや細かい技との釣り合いが問われる。',
  },
  TECHNICAL_SMALL: {
    summary: '小兵や技巧派が生き残るための間合いと技を重く見る。',
    impact: '投げ、捌き、土俵際の工夫が読み筋になりやすい。',
  },
  MODERN_SCIENCE: {
    summary: '計測、回復管理、効率のよい強化を重く見る。',
    impact: '幅広い能力の底上げと故障後の戻り方が読みどころになる。',
  },
  MASTER_DISCIPLE: {
    summary: '少人数で個別に弱点を見ながら育てる。',
    impact: '突出した保証は置かず、本人の型や気質がどこまで出るかを読む環境になる。',
  },
};

const pickWeightedStable = (
  candidates: StableDefinition[],
  rng: () => number,
): StableDefinition => {
  const pool = candidates.length > 0 ? candidates : STABLE_CATALOG;
  const total = pool.reduce((sum, stable) => sum + Math.max(1, stable.targetHeadcount), 0);
  let roll = rng() * total;
  for (const stable of pool) {
    roll -= Math.max(1, stable.targetHeadcount);
    if (roll <= 0) return stable;
  }
  return pool[pool.length - 1];
};

const resolveStable = (status: RikishiStatus): StableDefinition =>
  resolveStableById(status.stableId) ??
  STABLE_CATALOG.find((stable) => stable.archetypeId === status.stableArchetypeId) ??
  STABLE_CATALOG[0];

const resolveArchetype = (stable: StableDefinition, status: RikishiStatus): StableArchetypeDefinition =>
  STABLE_ARCHETYPE_BY_ID[stable.archetypeId] ??
  STABLE_ARCHETYPE_BY_ID[status.stableArchetypeId] ??
  STABLE_ARCHETYPE_CATALOG[0];

export const listStableEnvironmentChoices = (): StableEnvironmentChoiceOption[] => [
  {
    id: 'AUTO',
    label: 'おまかせ',
    summary: '部屋の縁も含めて一代を観測する。',
    detail: '45部屋の中から環境を任せます。狙いを固定せず、所属も記録の一部として読みます。',
  },
  ...STABLE_ARCHETYPE_CATALOG.map((archetype) => ({
    id: archetype.id,
    label: archetype.displayName,
    summary: ARCHETYPE_READING_COPY[archetype.id].summary,
    detail: ARCHETYPE_READING_COPY[archetype.id].impact,
  })),
];

export const resolveStableForEnvironmentChoice = (
  choiceId: StableEnvironmentChoiceId,
  rng: () => number = Math.random,
): StableDefinition => {
  if (choiceId === 'AUTO') return pickWeightedStable(STABLE_CATALOG, rng);
  return pickWeightedStable(
    STABLE_CATALOG.filter((stable) => stable.archetypeId === choiceId),
    rng,
  );
};

export const buildStableEnvironmentReading = (status: RikishiStatus): StableEnvironmentReading => {
  const stable = resolveStable(status);
  const ichimon = ICHIMON_BY_ID[stable.ichimonId] ?? ICHIMON_BY_ID[status.ichimonId];
  const archetype = resolveArchetype(stable, status);
  const readingCopy = ARCHETYPE_READING_COPY[archetype.id];
  const recordedBasho = status.history.records.filter((record) => record.rank.division !== 'Maezumo');
  const injuryBasho = recordedBasho.filter((record) => record.absent > 0).length;
  const absenceLine = injuryBasho > 0
    ? `${injuryBasho}場所で休場が残り、環境の色だけでなく身体との付き合い方も記録に出た。`
    : '大きな休場は少なく、所属環境の色は番付推移と取り口の残り方から読む。';

  return {
    stableName: stable.displayName,
    ichimonName: ichimon?.displayName ?? '一門未詳',
    archetypeName: archetype.displayName,
    scaleLabel: SCALE_LABELS[stable.scale],
    lead: `${stable.displayName}は${ichimon?.displayName ?? '一門未詳'}に属する${SCALE_LABELS[stable.scale]}。${stable.flavor}`,
    influenceLines: [
      readingCopy.summary,
      readingCopy.impact,
      absenceLine,
    ],
  };
};
