import { BodyMetrics, BodyType, Rank } from '../../logic/models';

export type RikishiPortraitStage = 'entry' | 'lower' | 'sekitori' | 'yokozuna';

export const resolvePortraitBodyType = (
  fallback: BodyType,
  bodyMetrics?: BodyMetrics,
): BodyType => {
  if (!bodyMetrics) return fallback;

  const height = bodyMetrics.heightCm;
  const weight = bodyMetrics.weightKg;
  const bmi = weight / (height / 100) ** 2;

  if (weight >= 165 || bmi >= 48) return 'ANKO';
  if (weight <= 128 && height >= 180) return 'SOPPU';
  if (weight >= 145 && bmi < 45) return 'MUSCULAR';
  return fallback;
};

export const resolvePortraitStageFromRank = (rank?: Rank): RikishiPortraitStage => {
  if (!rank) return 'entry';
  if (rank.name === '横綱') return 'yokozuna';
  if (rank.division === 'Makuuchi' || rank.division === 'Juryo') return 'sekitori';
  return 'lower';
};

export const resolveRikishiPortraitPath = ({
  bodyType,
  bodyMetrics,
  stage = 'entry',
  facing = 'front',
}: {
  bodyType: BodyType;
  bodyMetrics?: BodyMetrics;
  stage?: RikishiPortraitStage;
  facing?: 'front' | 'back';
}): string => {
  const resolvedBodyType = resolvePortraitBodyType(bodyType, bodyMetrics);
  const prefix = resolvedBodyType.toLowerCase();
  const resolvedStage = stage === 'lower' || (facing === 'back' && stage !== 'entry') ? 'entry' : stage;
  return `/images/rikishi/${resolvedStage}/${prefix}_${facing}.png`;
};
