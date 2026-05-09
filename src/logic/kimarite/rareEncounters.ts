import type { KimariteRarityBucket } from './catalog';
import { findCollectionKimariteEntry, isNonTechniqueKimarite, normalizeKimariteName } from './catalog';
import { findKimariteRealdataFrequency } from './realdata';

export type RareKimariteEncounterLabel = '珍しい' | '激レア' | '幻級';

export interface RareKimariteEncounter {
  kimariteId: string;
  name: string;
  rarity: KimariteRarityBucket;
  observedRate?: number;
  observedCount?: number;
  count: number;
  label: RareKimariteEncounterLabel;
}

export interface RareKimariteEncounterOptions {
  includeNonTechnique?: boolean;
}

const toKimariteId = (name: string): string =>
  encodeURIComponent(name).replace(/%/g, '').toLowerCase();

const resolveRareEncounterLabel = (
  rarity: KimariteRarityBucket,
  observedCount: number | undefined,
): RareKimariteEncounterLabel => {
  if (observedCount === 0) return '幻級';
  if (rarity === 'EXTREME') return '激レア';
  return '珍しい';
};

export const summarizeRareKimariteEncounters = (
  kimariteTotal: Record<string, number> | undefined,
  options: RareKimariteEncounterOptions = {},
): RareKimariteEncounter[] => {
  const encounters: RareKimariteEncounter[] = [];
  for (const [rawName, count] of Object.entries(kimariteTotal ?? {})) {
    const name = normalizeKimariteName(rawName);
    const entry = findCollectionKimariteEntry(name);
    if (!entry || count <= 0) continue;
    if (entry.rarityBucket !== 'RARE' && entry.rarityBucket !== 'EXTREME') continue;
    if (!options.includeNonTechnique && isNonTechniqueKimarite(name)) continue;
    const realdata = findKimariteRealdataFrequency(name);
    encounters.push({
      kimariteId: toKimariteId(name),
      name,
      rarity: entry.rarityBucket,
      observedRate: realdata?.observedRate,
      observedCount: realdata?.observedCount,
      count,
      label: resolveRareEncounterLabel(entry.rarityBucket, realdata?.observedCount),
    });
  }
  return encounters.sort((left, right) => {
    if (left.observedCount === 0 && right.observedCount !== 0) return -1;
    if (right.observedCount === 0 && left.observedCount !== 0) return 1;
    if (left.rarity !== right.rarity) return left.rarity === 'EXTREME' ? -1 : 1;
    if (right.count !== left.count) return right.count - left.count;
    return (left.observedRate ?? 1) - (right.observedRate ?? 1);
  });
};
