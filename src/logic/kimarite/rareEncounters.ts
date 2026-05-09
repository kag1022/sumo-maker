import type { KimariteRarityBucket } from './catalog';
import { findOfficialKimariteEntry, normalizeKimariteName } from './catalog';
import { findKimariteRealdataFrequency } from './realdata';

export interface RareKimariteEncounter {
  kimariteId: string;
  name: string;
  rarity: KimariteRarityBucket;
  observedRate?: number;
  observedCount?: number;
  count: number;
}

const toKimariteId = (name: string): string =>
  encodeURIComponent(name).replace(/%/g, '').toLowerCase();

export const summarizeRareKimariteEncounters = (
  kimariteTotal: Record<string, number> | undefined,
): RareKimariteEncounter[] => {
  const encounters: RareKimariteEncounter[] = [];
  for (const [rawName, count] of Object.entries(kimariteTotal ?? {})) {
    const name = normalizeKimariteName(rawName);
    const entry = findOfficialKimariteEntry(name);
    if (!entry || count <= 0) continue;
    if (entry.rarityBucket !== 'RARE' && entry.rarityBucket !== 'EXTREME') continue;
    const realdata = findKimariteRealdataFrequency(name);
    encounters.push({
      kimariteId: toKimariteId(name),
      name,
      rarity: entry.rarityBucket,
      observedRate: realdata?.observedRate,
      observedCount: realdata?.observedCount,
      count,
    });
  }
  return encounters.sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return (left.observedRate ?? 1) - (right.observedRate ?? 1);
  });
};
