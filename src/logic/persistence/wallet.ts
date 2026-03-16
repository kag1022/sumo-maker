import { getDb, WalletRow, WalletTransactionRow } from './db';

export const WALLET_INITIAL_POINTS = 50;
export const WALLET_MAX_POINTS = 100;
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

export type WalletEarnReason =
  | 'CAREER_PRIZE_REWARD'
  | 'MANUAL_TOP_UP'
  | 'AD_REWARD'
  | 'AD_REWARD_TOKEN';
export type WalletSpendReason = 'BUILD_REGISTRATION' | 'SCOUT_DRAW' | 'SCOUT_OVERRIDE' | 'OTHER';

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

const createWalletTransaction = (
  params: Omit<WalletTransactionRow, 'id' | 'createdAt'> & { nowMs: number },
): WalletTransactionRow => ({
  id: globalThis.crypto?.randomUUID?.() ?? `wallet-tx-${params.nowMs}-${Math.random().toString(36).slice(2, 10)}`,
  createdAt: new Date(params.nowMs).toISOString(),
  kind: params.kind,
  amount: params.amount,
  balanceAfter: params.balanceAfter,
  reason: params.reason,
  careerId: params.careerId,
});

const applyRegen = (row: WalletRow, nowMs: number): WalletRow => {
  const safeNowMs = Math.max(nowMs, row.lastRegenAt);
  const basePoints = clamp(row.points, 0, WALLET_MAX_POINTS);

  if (WALLET_REGEN_INTERVAL_MS <= 0) {
    return {
      ...row,
      points: basePoints,
      lastRegenAt: safeNowMs,
      updatedAt: new Date(safeNowMs).toISOString(),
    };
  }

  if (basePoints >= WALLET_MAX_POINTS) {
    return {
      ...row,
      points: WALLET_MAX_POINTS,
      lastRegenAt: safeNowMs,
      updatedAt: new Date(safeNowMs).toISOString(),
    };
  }

  const elapsedMs = safeNowMs - row.lastRegenAt;
  const regeneratedPoints = Math.floor(elapsedMs / WALLET_REGEN_INTERVAL_MS);
  if (regeneratedPoints <= 0) {
    return {
      ...row,
      points: basePoints,
      lastRegenAt: row.lastRegenAt,
      updatedAt: row.updatedAt,
    };
  }

  const nextPoints = clamp(basePoints + regeneratedPoints, 0, WALLET_MAX_POINTS);
  const reachedCap = nextPoints >= WALLET_MAX_POINTS;
  const lastRegenAt = reachedCap
    ? safeNowMs
    : row.lastRegenAt + regeneratedPoints * WALLET_REGEN_INTERVAL_MS;

  return {
    ...row,
    points: nextPoints,
    lastRegenAt,
    updatedAt: new Date(lastRegenAt).toISOString(),
  };
};

const toWalletState = (row: WalletRow, nowMs: number): WalletState => {
  const points = clamp(row.points, 0, WALLET_MAX_POINTS);
  const safeNowMs = Math.max(nowMs, row.lastRegenAt);
  const elapsedMs = safeNowMs - row.lastRegenAt;
  const remainingMs =
    points >= WALLET_MAX_POINTS || WALLET_REGEN_INTERVAL_MS <= 0
      ? 0
      : Math.max(0, WALLET_REGEN_INTERVAL_MS - elapsedMs);
  return {
    points,
    cap: WALLET_MAX_POINTS,
    nextRegenInSec: remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0,
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
  reasonOrNowMs: WalletSpendReason | number = 'OTHER',
  careerIdOrNowMs?: string | number,
  nowMsArg?: number,
): Promise<SpendWalletResult> => {
  const reason: WalletSpendReason =
    typeof reasonOrNowMs === 'string' ? reasonOrNowMs : 'OTHER';
  const careerId =
    typeof reasonOrNowMs === 'string' && typeof careerIdOrNowMs === 'string'
      ? careerIdOrNowMs
      : undefined;
  const nowMs =
    typeof reasonOrNowMs === 'number'
      ? reasonOrNowMs
      : typeof careerIdOrNowMs === 'number'
        ? careerIdOrNowMs
        : (nowMsArg ?? Date.now());

  const db = getDb();
  return db.transaction('rw', db.meta, db.walletTransactions, async () => {
    const current = await ensureWalletRow(nowMs);
    const regenerated = applyRegen(current, nowMs);

    if (amount > 0 && regenerated.points >= amount) {
      const next = {
        ...regenerated,
        points: regenerated.points - amount,
        updatedAt: new Date(nowMs).toISOString(),
      };
      await db.meta.put(next);
      await db.walletTransactions.put(createWalletTransaction({
        nowMs,
        kind: 'SPEND',
        amount,
        balanceAfter: next.points,
        reason,
        careerId,
      }));
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

export const addWalletPoints = async (
  amount: number,
  reason: WalletEarnReason,
  careerId?: string,
  nowMs: number = Date.now(),
): Promise<WalletState> => {
  const db = getDb();
  return db.transaction('rw', db.meta, db.walletTransactions, async () => {
    const current = await ensureWalletRow(nowMs);
    const regenerated = applyRegen(current, nowMs);
    const nextPoints = clamp(regenerated.points + Math.max(0, Math.floor(amount)), 0, WALLET_MAX_POINTS);
    const next = {
      ...regenerated,
      points: nextPoints,
      updatedAt: new Date(nowMs).toISOString(),
    };
    await db.meta.put(next);
    if (amount > 0) {
      await db.walletTransactions.put(createWalletTransaction({
        nowMs,
        kind: 'EARN',
        amount: Math.floor(amount),
        balanceAfter: nextPoints,
        reason,
        careerId,
      }));
    }
    return toWalletState(next, nowMs);
  });
};
