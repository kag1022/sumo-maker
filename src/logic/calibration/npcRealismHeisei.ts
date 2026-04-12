import rawCalibration from '../../../sumo-db/data/analysis/npc_realism_c1_heisei.json';
import { resolveEmpiricalRankBand } from '../banzuke/providers/empirical';
import { Division } from '../models';
import {
  DistributionCalibrationStats,
  EmpiricalNpcAbsenceBand,
  EmpiricalNpcAgeBand,
  EmpiricalNpcRealismCalibrationTarget,
  EmpiricalNpcRetirementLookupMeta,
  EmpiricalNpcRetirementResultClass,
  EmpiricalNpcRetirementStateKey,
  EmpiricalNpcSeedRecipe,
} from './types';

const HEISEI_NPC_REALISM_C1 =
  rawCalibration as unknown as EmpiricalNpcRealismCalibrationTarget;

type RandomSource = () => number;

type RecentBashoLike = {
  division: Division;
  wins: number;
  losses: number;
  absent?: number;
  rankName?: string;
  rankNumber?: number;
};

export interface EmpiricalNpcRetirementHazardInput {
  age: number;
  currentDivision: Division;
  currentRankScore?: number;
  recentBashoResults?: RecentBashoLike[];
  formerSekitori?: boolean;
  annualRetirementShock?: number;
}

const JAPANESE_DIVISION_LABEL: Record<Exclude<Division, 'Maezumo'>, string> = {
  Makuuchi: '前頭',
  Juryo: '十両',
  Makushita: '幕下',
  Sandanme: '三段目',
  Jonidan: '序二段',
  Jonokuchi: '序ノ口',
};

const BOUTS_BY_DIVISION: Record<Division, number> = {
  Makuuchi: 15,
  Juryo: 15,
  Makushita: 7,
  Sandanme: 7,
  Jonidan: 7,
  Jonokuchi: 7,
  Maezumo: 3,
};

const DEFAULT_HAZARD_BY_DIVISION: Record<Division, number> = {
  Makuuchi: 0.004,
  Juryo: 0.0055,
  Makushita: 0.008,
  Sandanme: 0.0105,
  Jonidan: 0.0125,
  Jonokuchi: 0.0135,
  Maezumo: 0.01,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveAgeBand = (age: number): EmpiricalNpcAgeBand => {
  if (age <= 18) return '15-18';
  if (age <= 21) return '19-21';
  if (age <= 24) return '22-24';
  if (age <= 27) return '25-27';
  if (age <= 30) return '28-30';
  if (age <= 33) return '31-33';
  if (age <= 36) return '34-36';
  if (age <= 39) return '37-39';
  return '40+';
};

const resolveAbsenceBand = (absent: number): EmpiricalNpcAbsenceBand => {
  if (absent <= 0) return '0';
  if (absent <= 2) return '1-2';
  if (absent <= 5) return '3-5';
  return '6+';
};

const resolveResultClass = (
  division: Division,
  wins: number,
  losses: number,
  absent: number,
): EmpiricalNpcRetirementResultClass => {
  if (absent >= BOUTS_BY_DIVISION[division]) return 'FULL_KYUJO';
  const diff = wins - (losses + absent);
  if (diff > 0) return 'KK';
  if (diff === 0) return 'EVEN';
  if (diff >= -2) return 'MK_LIGHT';
  return 'MK_HEAVY';
};

const sampleTriangularFromQuantiles = (
  stats: DistributionCalibrationStats,
  rng: RandomSource,
): number => {
  const left = stats.p10;
  const mode = stats.p50;
  const right = stats.p90;
  if (left === right) return clamp(mode, stats.min, stats.max);
  const normalizedMode =
    right === left
      ? 0.5
      : clamp((mode - left) / (right - left), Number.EPSILON, 1 - Number.EPSILON);
  const roll = rng();
  const sample =
    roll < normalizedMode
      ? left + Math.sqrt(roll * (right - left) * (mode - left))
      : right - Math.sqrt((1 - roll) * (right - left) * (right - mode));
  return clamp(sample, stats.min, stats.max);
};

const resolveLatestRelevantResult = (
  currentDivision: Division,
  recentBashoResults?: RecentBashoLike[],
): RecentBashoLike | undefined => {
  if (!recentBashoResults?.length) return undefined;
  for (let index = recentBashoResults.length - 1; index >= 0; index -= 1) {
    const row = recentBashoResults[index];
    if (row.division === currentDivision) return row;
  }
  return recentBashoResults[recentBashoResults.length - 1];
};

const resolveRankIdentityFromCurrentState = (
  division: Division,
  currentRankScore = 1,
  recent?: RecentBashoLike,
): { rankName: string; rankNumber?: number } => {
  if (recent?.rankName) {
    return {
      rankName: recent.rankName,
      rankNumber: recent.rankNumber,
    };
  }
  if (division === 'Makuuchi') {
    const slot = clamp(currentRankScore, 1, 42);
    if (slot <= 4) return { rankName: '大関', rankNumber: 1 };
    if (slot <= 8) return { rankName: '関脇', rankNumber: 1 };
    return {
      rankName: '前頭',
      rankNumber: clamp(Math.ceil((slot - 8) / 2), 1, 17),
    };
  }
  if (division === 'Juryo') {
    return {
      rankName: '十両',
      rankNumber: clamp(Math.ceil(currentRankScore / 2), 1, 14),
    };
  }
  if (division === 'Maezumo') {
    return { rankName: '序ノ口', rankNumber: 1 };
  }
  return {
    rankName: JAPANESE_DIVISION_LABEL[division],
    rankNumber: Math.max(1, Math.ceil(currentRankScore / 2)),
  };
};

const resolveStateKey = (
  input: EmpiricalNpcRetirementHazardInput,
): EmpiricalNpcRetirementStateKey => {
  const recent = resolveLatestRelevantResult(input.currentDivision, input.recentBashoResults);
  const rankIdentity = resolveRankIdentityFromCurrentState(
    input.currentDivision,
    input.currentRankScore,
    recent,
  );
  const absent = Math.max(0, recent?.absent ?? 0);
  return {
    division: input.currentDivision,
    rankBand: resolveEmpiricalRankBand(
      input.currentDivision,
      rankIdentity.rankName,
      rankIdentity.rankNumber,
    ),
    ageBand: resolveAgeBand(input.age),
    resultClass: resolveResultClass(
      input.currentDivision,
      Math.max(0, recent?.wins ?? 0),
      Math.max(0, recent?.losses ?? 0),
      absent,
    ),
    absenceBand: resolveAbsenceBand(absent),
    formerSekitori:
      input.formerSekitori ??
      (
        input.currentDivision === 'Makuuchi' ||
        input.currentDivision === 'Juryo' ||
        Boolean(
          input.recentBashoResults?.some(
            (row) => row.division === 'Makuuchi' || row.division === 'Juryo',
          ),
        )
      ),
  };
};

const buildFullKey = (state: EmpiricalNpcRetirementStateKey): string =>
  `${state.division}|${state.rankBand}|${state.ageBand}|${state.resultClass}|${state.absenceBand}|${
    state.formerSekitori ? 1 : 0
  }`;

const resolveLookupRow = (
  state: EmpiricalNpcRetirementStateKey,
): EmpiricalNpcRetirementLookupMeta & { hazard: number } => {
  const threshold = HEISEI_NPC_REALISM_C1.meta.sampleSizeThreshold;
  const fullKey = buildFullKey(state);
  const fullRow = HEISEI_NPC_REALISM_C1.retirementHazardByState[fullKey];
  if (fullRow && fullRow.sampleSize >= threshold) {
    return { fallbackLevel: 'full', sampleSize: fullRow.sampleSize, hazard: fullRow.hazard };
  }

  const dropFormerKey = `${state.division}|${state.rankBand}|${state.ageBand}|${state.resultClass}|${state.absenceBand}`;
  const dropFormerRow = HEISEI_NPC_REALISM_C1.retirementFallbacks.dropFormerSekitori[dropFormerKey];
  if (dropFormerRow && dropFormerRow.sampleSize >= threshold) {
    return {
      fallbackLevel: 'dropFormerSekitori',
      sampleSize: dropFormerRow.sampleSize,
      hazard: dropFormerRow.hazard,
    };
  }

  const dropRankKey = `${state.division}|${state.ageBand}|${state.resultClass}|${state.absenceBand}|${
    state.formerSekitori ? 1 : 0
  }`;
  const dropRankRow = HEISEI_NPC_REALISM_C1.retirementFallbacks.dropRankBand[dropRankKey];
  if (dropRankRow && dropRankRow.sampleSize >= threshold) {
    return {
      fallbackLevel: 'dropRankBand',
      sampleSize: dropRankRow.sampleSize,
      hazard: dropRankRow.hazard,
    };
  }

  const divisionAgeResultKey = `${state.division}|${state.ageBand}|${state.resultClass}`;
  const divisionAgeResultRow =
    HEISEI_NPC_REALISM_C1.retirementFallbacks.divisionAgeResult[divisionAgeResultKey];
  if (divisionAgeResultRow && divisionAgeResultRow.sampleSize >= threshold) {
    return {
      fallbackLevel: 'divisionAgeResult',
      sampleSize: divisionAgeResultRow.sampleSize,
      hazard: divisionAgeResultRow.hazard,
    };
  }

  const divisionOnlyRow = HEISEI_NPC_REALISM_C1.retirementFallbacks.divisionOnly[state.division];
  if (divisionOnlyRow && divisionOnlyRow.sampleSize >= threshold) {
    return {
      fallbackLevel: 'divisionOnly',
      sampleSize: divisionOnlyRow.sampleSize,
      hazard: divisionOnlyRow.hazard,
    };
  }

  return {
    fallbackLevel: 'none',
    sampleSize: 0,
    hazard: DEFAULT_HAZARD_BY_DIVISION[state.division],
  };
};

export const sampleEmpiricalNpcSeed = (
  rng: RandomSource,
): EmpiricalNpcSeedRecipe => {
  const roll = rng();
  let cursor = 0;
  for (const recipe of HEISEI_NPC_REALISM_C1.npcSeedMix) {
    cursor += recipe.weight;
    if (roll <= cursor) return recipe;
  }
  return HEISEI_NPC_REALISM_C1.npcSeedMix[HEISEI_NPC_REALISM_C1.npcSeedMix.length - 1];
};

export const sampleEmpiricalDivisionAge = (
  division: Division,
  rng: RandomSource,
): number => {
  const stats =
    HEISEI_NPC_REALISM_C1.divisionAgeProfile[division] ??
    HEISEI_NPC_REALISM_C1.divisionAgeProfile.Jonokuchi;
  return Math.round(sampleTriangularFromQuantiles(stats, rng));
};

export const resolveEmpiricalNpcRetirementLookupMeta = (
  input: EmpiricalNpcRetirementHazardInput,
): EmpiricalNpcRetirementLookupMeta => {
  const state = resolveStateKey(input);
  const lookup = resolveLookupRow(state);
  return {
    fallbackLevel: lookup.fallbackLevel,
    sampleSize: lookup.sampleSize,
  };
};

export const resolveEmpiricalNpcRetirementHazard = (
  input: EmpiricalNpcRetirementHazardInput,
): number => {
  const state = resolveStateKey(input);
  const lookup = resolveLookupRow(state);
  const populationMultiplier = clamp(1 + (input.annualRetirementShock ?? 0), 0.65, 1.35);
  return clamp(lookup.hazard * populationMultiplier, 0, 0.92);
};
