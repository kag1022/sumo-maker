import type { EraBoundaryProfile, EraTag, EraTopRankStructure } from './types';

export const ERA_TAG_LABELS: Record<EraTag, string> = {
  yokozuna_stable: '横綱安定期',
  yokozuna_absent: '横綱不在期',
  ozeki_crowded: '大関過密',
  top_division_turbulent: '上位混戦',
  generation_shift: '世代交代',
  sekitori_boundary_hot: '関取境界激戦',
  makushita_congested: '幕下上位過密',
  young_wave: '若手層厚め',
  veteran_heavy: 'ベテラン厚め',
  balanced_era: '均衡期',
};

export const formatEraTagLabel = (tag: EraTag): string => ERA_TAG_LABELS[tag] ?? tag;

export const summarizeTopRankStructure = (structure: EraTopRankStructure): string => {
  if (structure.yokozunaCount >= 2) return '横綱複数';
  if (structure.yokozunaCount === 1 && structure.ozekiCount >= 3) return '上位厚め';
  if (structure.yokozunaCount === 0 && structure.ozekiCount >= 2) return '大関主導';
  if (structure.yokozunaCount === 0) return '横綱不在';
  return '上位安定';
};

export const summarizeBoundaryProfile = (profile: EraBoundaryProfile): string => {
  if (profile.sekitoriBoundaryPressure >= 0.7) return '関取境界は激戦';
  if (profile.sekitoriBoundaryPressure >= 0.45) return '関取境界はやや荒れ';
  return '関取境界は落ち着き気味';
};
