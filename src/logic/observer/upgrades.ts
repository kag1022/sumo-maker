import { ObserverUpgradeId } from '../models';
import { getDb, ObserverUpgradeRow } from '../persistence/db';
import { spendObservationPoints } from '../persistence/observationPoints';

export interface ObserverUpgradeDefinition {
  id: ObserverUpgradeId;
  title: string;
  description: string;
  cost: number;
}

export interface ObserverUpgradeView extends ObserverUpgradeDefinition {
  unlocked: boolean;
  unlockedAt?: string;
}

export const OBSERVER_UPGRADES: ObserverUpgradeDefinition[] = [
  {
    id: 'SCOUT_NOTES',
    title: '観測メモ',
    description: '新弟子設計時に仮説を残す帳面を開く。',
    cost: 10,
  },
  {
    id: 'SAVE_TAGS_PLUS',
    title: '保存分類',
    description: '保存時に人生の読み味を分類できる。',
    cost: 15,
  },
  {
    id: 'ARCHIVE_FILTERS',
    title: '書架索引',
    description: '保存タグや実験記録で書架を絞り込める。',
    cost: 20,
  },
  {
    id: 'RIVALRY_READING',
    title: '宿敵読解',
    description: '因縁や対戦相手の読み取りを深める。',
    cost: 25,
  },
  {
    id: 'KEY_BASHO_PICKUP',
    title: '節目拾い',
    description: '一代を決めた場所を拾いやすくする。',
    cost: 25,
  },
  {
    id: 'EXPERIMENT_LAB',
    title: '実験観測',
    description: '標準観測から分けた実験プリセットを開く。',
    cost: 40,
  },
];

export const listObserverUpgrades = async (): Promise<ObserverUpgradeView[]> => {
  const db = getDb();
  const rows = await db.observerUpgrades.toArray();
  const rowById = new Map(rows.map((row) => [row.id, row]));
  return OBSERVER_UPGRADES.map((definition) => {
    const row = rowById.get(definition.id);
    return {
      ...definition,
      unlocked: Boolean(row),
      unlockedAt: row?.unlockedAt,
    };
  });
};

export const isObserverUpgradeUnlocked = async (id: ObserverUpgradeId): Promise<boolean> => {
  const db = getDb();
  return Boolean(await db.observerUpgrades.get(id));
};

export const purchaseObserverUpgrade = async (
  id: ObserverUpgradeId,
): Promise<{ ok: boolean; alreadyUnlocked: boolean }> => {
  const definition = OBSERVER_UPGRADES.find((entry) => entry.id === id);
  if (!definition) return { ok: false, alreadyUnlocked: false };

  const db = getDb();
  const existing = await db.observerUpgrades.get(id);
  if (existing) return { ok: true, alreadyUnlocked: true };

  const spent = await spendObservationPoints(definition.cost, 'OBSERVER_UPGRADE');
  if (!spent.ok) return { ok: false, alreadyUnlocked: false };

  const row: ObserverUpgradeRow = {
    id,
    unlockedAt: new Date().toISOString(),
  };
  await db.observerUpgrades.put(row);
  return { ok: true, alreadyUnlocked: false };
};
