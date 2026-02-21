import { getDb, WalletRow } from './db';

export const WALLET_INITIAL_POINTS = 300;
export const WALLET_MAX_POINTS = 500;
export const WALLET_REGEN_INTERVAL_MS = 60_000;

export interface WalletState {
  points: number;
  cap: number;
  nextRegenInSec: number;
  lastRegenAt: number;
}

export interface SpendWalletResult {
  ok: boolean;
  state: WalletState;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const ensureWalletRow = async (nowMs: number): Promise<WalletRow> => {
  const db = getDb();
  const existing = await db.meta.get('wallet');
  if (existing && existing.key === 'wallet') return existing;

  const row: WalletRow = {
    key: 'wallet',
    points: WALLET_INITIAL_POINTS,
    lastRegenAt: nowMs,
    updatedAt: new Date(nowMs).toISOString(),
  };
  await db.meta.put(row);
  return row;
};

const applyRegen = (row: WalletRow, nowMs: number): WalletRow => {
  const normalizedNow = Math.max(nowMs, row.lastRegenAt);
  if (row.points >= WALLET_MAX_POINTS) {
    return {
      ...row,
      points: WALLET_MAX_POINTS,
      lastRegenAt: normalizedNow,
      updatedAt: new Date(normalizedNow).toISOString(),
    };
  }

  const elapsed = normalizedNow - row.lastRegenAt;
  const ticks = Math.floor(elapsed / WALLET_REGEN_INTERVAL_MS);
  if (ticks <= 0) return row;

  const gained = Math.min(WALLET_MAX_POINTS - row.points, ticks);
  const nextPoints = clamp(row.points + gained, 0, WALLET_MAX_POINTS);
  const reachedCap = nextPoints >= WALLET_MAX_POINTS;
  return {
    ...row,
    points: nextPoints,
    lastRegenAt: reachedCap
      ? normalizedNow
      : row.lastRegenAt + ticks * WALLET_REGEN_INTERVAL_MS,
    updatedAt: new Date(normalizedNow).toISOString(),
  };
};

const toWalletState = (row: WalletRow, nowMs: number): WalletState => {
  const normalizedNow = Math.max(nowMs, row.lastRegenAt);
  if (row.points >= WALLET_MAX_POINTS) {
    return {
      points: WALLET_MAX_POINTS,
      cap: WALLET_MAX_POINTS,
      nextRegenInSec: 0,
      lastRegenAt: row.lastRegenAt,
    };
  }
  const elapsed = normalizedNow - row.lastRegenAt;
  const mod = elapsed % WALLET_REGEN_INTERVAL_MS;
  const remainingMs = mod === 0 ? WALLET_REGEN_INTERVAL_MS : WALLET_REGEN_INTERVAL_MS - mod;
  return {
    points: row.points,
    cap: WALLET_MAX_POINTS,
    nextRegenInSec: Math.ceil(remainingMs / 1000),
    lastRegenAt: row.lastRegenAt,
  };
};

export const getWalletState = async (nowMs: number = Date.now()): Promise<WalletState> => {
  const db = getDb();
  return db.transaction('rw', db.meta, async () => {
    const current = await ensureWalletRow(nowMs);
    const regenerated = applyRegen(current, nowMs);
    if (
      regenerated.points !== current.points ||
      regenerated.lastRegenAt !== current.lastRegenAt
    ) {
      await db.meta.put(regenerated);
    }
    return toWalletState(regenerated, nowMs);
  });
};

export const spendWalletPoints = async (
  amount: number,
  nowMs: number = Date.now(),
): Promise<SpendWalletResult> => {
  const db = getDb();
  return db.transaction('rw', db.meta, async () => {
    const current = await ensureWalletRow(nowMs);
    const regenerated = applyRegen(current, nowMs);

    if (amount > 0 && regenerated.points >= amount) {
      const next = {
        ...regenerated,
        points: regenerated.points - amount,
        updatedAt: new Date(nowMs).toISOString(),
      };
      await db.meta.put(next);
      return { ok: true, state: toWalletState(next, nowMs) };
    }

    if (
      regenerated.points !== current.points ||
      regenerated.lastRegenAt !== current.lastRegenAt
    ) {
      await db.meta.put(regenerated);
    }
    return { ok: amount <= 0, state: toWalletState(regenerated, nowMs) };
  });
};
