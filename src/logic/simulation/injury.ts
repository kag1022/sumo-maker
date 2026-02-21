import { CONSTANTS } from '../constants';
import { Injury, InjuryType, RikishiStatus } from '../models';
import { RandomSource } from './deps';

export interface InjuryParticipation {
  maxAcuteSeverity: number;
  maxEffectiveSeverity: number;
  mustSitOut: boolean;
  battlePowerMultiplier: number;
  conditionPenalty: number;
}

const FORCED_ABSENCE_SEVERITY = 7;
const SIDE_AWARE_TYPES = new Set<InjuryType>([
  'KNEE',
  'SHOULDER',
  'ELBOW',
  'ANKLE',
  'WRIST',
  'HAMSTRING',
  'HIP',
]);

const capSeverityForTraits = (
  severity: number,
  traits: string[],
): number => (traits.includes('BUJI_KORE_MEIBA') && severity >= 5 ? 4 : severity);

const resolveInjuryDisplayName = (
  type: InjuryType,
  baseName: string,
  severity: number,
  rng: RandomSource,
): string => {
  const sidePrefix = SIDE_AWARE_TYPES.has(type)
    ? (rng() < 0.5 ? '右' : '左')
    : '';
  const severityPrefix = severity >= 8 ? '重度' : severity <= 2 ? '軽度' : '';
  return `${severityPrefix}${sidePrefix}${baseName}`;
};

export const resolveInjuryRate = (status: RikishiStatus): number => {
  const traits = status.traits || [];
  let injuryRate = CONSTANTS.PROBABILITY.INJURY_PER_BOUT;
  if (traits.includes('TETSUJIN')) {
    injuryRate *= 0.5;
  }
  const bodyData = CONSTANTS.BODY_TYPE_DATA[status.bodyType];
  return injuryRate * bodyData.injuryMod;
};

export const generateInjury = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
): Injury => {
  const traits = status.traits || [];
  const types = Object.keys(CONSTANTS.INJURY_DATA) as InjuryType[];
  let totalWeight = 0;
  const weights: Record<string, number> = {};

  for (const injuryType of types) {
    let weight = CONSTANTS.INJURY_DATA[injuryType].weight;
    if (injuryType === 'KNEE' && traits.includes('GLASS_KNEE')) {
      weight *= 2.5;
    }

    const bodyData = CONSTANTS.BODY_TYPE_DATA[status.bodyType];
    if (bodyData.injuryWeightMod && bodyData.injuryWeightMod[injuryType]) {
      weight *= bodyData.injuryWeightMod[injuryType]!;
    }

    weights[injuryType] = weight;
    totalWeight += weight;
  }

  let roll = rng() * totalWeight;
  let selectedType: InjuryType = types[0];
  for (const injuryType of types) {
    roll -= weights[injuryType];
    if (roll <= 0) {
      selectedType = injuryType;
      break;
    }
  }

  const data = CONSTANTS.INJURY_DATA[selectedType];
  const severity = Math.floor(rng() * (data.severityMax - data.severityMin + 1)) + data.severityMin;

  return {
    id: crypto.randomUUID(),
    type: selectedType,
    name: resolveInjuryDisplayName(selectedType, data.name, severity, rng),
    severity,
    status: 'ACUTE',
    occurredAt: { year, month },
  };
};

export const applyGeneratedInjury = (
  status: RikishiStatus,
  injury: Injury,
): void => {
  const traits = status.traits || [];
  const appliedSeverity = capSeverityForTraits(injury.severity, traits);
  const appliedInjury = { ...injury, severity: appliedSeverity };

  if (!status.injuries) status.injuries = [];
  const existingIndex = status.injuries.findIndex(
    (existing) => existing.type === appliedInjury.type && existing.status !== 'HEALED',
  );

  if (existingIndex >= 0) {
    const existing = status.injuries[existingIndex];
    existing.severity = Math.min(10, existing.severity + appliedInjury.severity);
    existing.status = 'ACUTE';
    existing.name = appliedInjury.name;
    existing.severity = capSeverityForTraits(existing.severity, traits);
  } else {
    status.injuries.push(appliedInjury);
  }

  status.injuryLevel += appliedInjury.severity;
};

export const resolveInjuryParticipation = (
  status: RikishiStatus,
): InjuryParticipation => {
  const injuries = status.injuries || [];
  let maxAcuteSeverity = 0;
  let maxEffectiveSeverity = 0;

  for (const injury of injuries) {
    if (injury.status === 'HEALED') continue;
    if (injury.status !== 'CHRONIC') {
      maxAcuteSeverity = Math.max(maxAcuteSeverity, injury.severity);
    }
    const effectiveSeverity = injury.status === 'CHRONIC'
      ? Math.max(1, Math.round(injury.severity * 0.6))
      : injury.severity;
    maxEffectiveSeverity = Math.max(maxEffectiveSeverity, effectiveSeverity);
  }
  if (maxEffectiveSeverity === 0 && status.injuryLevel > 0) {
    maxAcuteSeverity = status.injuryLevel;
    maxEffectiveSeverity = status.injuryLevel;
  }

  let battlePowerMultiplier = 1;
  let conditionPenalty = 0;
  if (maxEffectiveSeverity >= 1 && maxEffectiveSeverity <= 2) {
    battlePowerMultiplier = 0.96;
    conditionPenalty = 4;
  } else if (maxEffectiveSeverity <= 4) {
    battlePowerMultiplier = 0.90;
    conditionPenalty = 8;
  } else if (maxEffectiveSeverity <= 6) {
    battlePowerMultiplier = 0.82;
    conditionPenalty = 12;
  } else if (maxEffectiveSeverity >= 7) {
    battlePowerMultiplier = 0.74;
    conditionPenalty = 16;
  }

  return {
    maxAcuteSeverity,
    maxEffectiveSeverity,
    mustSitOut: maxAcuteSeverity >= FORCED_ABSENCE_SEVERITY,
    battlePowerMultiplier,
    conditionPenalty,
  };
};

export const withInjuryBattlePenalty = (status: RikishiStatus): RikishiStatus => {
  const participation = resolveInjuryParticipation(status);
  if (participation.battlePowerMultiplier >= 0.999) {
    return status;
  }
  const scale = participation.battlePowerMultiplier;
  return {
    ...status,
    currentCondition: Math.max(20, status.currentCondition - participation.conditionPenalty),
    stats: {
      tsuki: status.stats.tsuki * scale,
      oshi: status.stats.oshi * scale,
      kumi: status.stats.kumi * scale,
      nage: status.stats.nage * scale,
      koshi: status.stats.koshi * scale,
      deashi: status.stats.deashi * scale,
      waza: status.stats.waza * scale,
      power: status.stats.power * scale,
    },
  };
};
