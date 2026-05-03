import { getDb, GenerationTokenLedgerRow, GenerationTokenRow } from './db';

export const GENERATION_TOKEN_INITIAL = 5;
export const GENERATION_TOKEN_CAP = 5;
export const GENERATION_TOKEN_REGEN_INTERVAL_MS = 30 * 60 * 1000;
const MAX_REGEN_TOKENS_PER_CHECK = GENERATION_TOKEN_CAP;

export interface GenerationTokenState {
  tokens: number;
  cap: number;
  lastRegenAt: number;
  nextRegenInSec: number;
}

export type GenerationTokenSpendReason = 'CAREER_START' | 'EXPERIMENT_START';

export interface SpendGenerationTokenResult {
  ok: boolean;
  state: GenerationTokenState;
}

const createLedgerId = (nowMs: number): string =>
  globalThis.crypto?.randomUUID?.() ?? `generation-token-${nowMs}-${Math.random().toString(36).slice(2, 10)}`;

const createLedgerRow = (
  params: Omit<GenerationTokenLedgerRow, 'id' | 'createdAt'> & { nowMs: number },
): GenerationTokenLedgerRow => ({
  id: createLedgerId(params.nowMs),
  createdAt: new Date(params.nowMs).toISOString(),
  kind: params.kind,
  amount: params.amount,
  balanceAfter: params.balanceAfter,
  reason: params.reason,
  careerId: params.careerId,
});

const ensureGenerationTokenRow = async (nowMs: number): Promise<GenerationTokenRow> => {
  const db = getDb();
  const existing = await db.meta.get('generationTokens');
  if (existing?.key === 'generationTokens') return existing;

  const row: GenerationTokenRow = {
    key: 'generationTokens',
    tokens: GENERATION_TOKEN_INITIAL,
    lastRegenAt: nowMs,
    updatedAt: new Date(nowMs).toISOString(),
  };
  await db.meta.put(row);
  await db.generationTokenLedger.put(createLedgerRow({
    nowMs,
    kind: 'INIT',
    amount: GENERATION_TOKEN_INITIAL,
    balanceAfter: GENERATION_TOKEN_INITIAL,
    reason: 'INIT',
  }));
  return row;
};

const toState = (row: GenerationTokenRow, nowMs: number): GenerationTokenState => {
  const tokens = Math.max(0, Math.min(GENERATION_TOKEN_CAP, row.tokens));
  const elapsedMs = Math.max(0, nowMs - row.lastRegenAt);
  const nextRegenInSec =
    tokens >= GENERATION_TOKEN_CAP
      ? 0
      : Math.ceil(Math.max(0, GENERATION_TOKEN_REGEN_INTERVAL_MS - elapsedMs) / 1000);
  return {
    tokens,
    cap: GENERATION_TOKEN_CAP,
    lastRegenAt: row.lastRegenAt,
    nextRegenInSec,
  };
};

const applyRegen = (row: GenerationTokenRow, nowMs: number): { row: GenerationTokenRow; regenerated: number } => {
  const tokens = Math.max(0, Math.min(GENERATION_TOKEN_CAP, row.tokens));
  if (tokens >= GENERATION_TOKEN_CAP) {
    return {
      row: {
        ...row,
        tokens,
        lastRegenAt: Math.max(row.lastRegenAt, nowMs),
        updatedAt: new Date(Math.max(row.lastRegenAt, nowMs)).toISOString(),
      },
      regenerated: 0,
    };
  }

  if (nowMs < row.lastRegenAt) {
    return { row: { ...row, tokens }, regenerated: 0 };
  }

  const elapsedMs = nowMs - row.lastRegenAt;
  const rawRegenerated = Math.floor(elapsedMs / GENERATION_TOKEN_REGEN_INTERVAL_MS);
  const regenerated = Math.max(0, Math.min(MAX_REGEN_TOKENS_PER_CHECK, rawRegenerated, GENERATION_TOKEN_CAP - tokens));
  if (regenerated <= 0) {
    return { row: { ...row, tokens }, regenerated: 0 };
  }

  const nextTokens = Math.min(GENERATION_TOKEN_CAP, tokens + regenerated);
  return {
    row: {
      ...row,
      tokens: nextTokens,
      lastRegenAt: nextTokens >= GENERATION_TOKEN_CAP
        ? nowMs
        : row.lastRegenAt + regenerated * GENERATION_TOKEN_REGEN_INTERVAL_MS,
      updatedAt: new Date(nowMs).toISOString(),
    },
    regenerated,
  };
};

export const getGenerationTokenState = async (nowMs: number = Date.now()): Promise<GenerationTokenState> => {
  const db = getDb();
  return db.transaction('rw', db.meta, db.generationTokenLedger, async () => {
    const current = await ensureGenerationTokenRow(nowMs);
    const { row, regenerated } = applyRegen(current, nowMs);
    if (
      row.tokens !== current.tokens ||
      row.lastRegenAt !== current.lastRegenAt ||
      row.updatedAt !== current.updatedAt
    ) {
      await db.meta.put(row);
      if (regenerated > 0) {
        await db.generationTokenLedger.put(createLedgerRow({
          nowMs,
          kind: 'REGEN',
          amount: regenerated,
          balanceAfter: row.tokens,
          reason: 'REGEN',
        }));
      }
    }
    return toState(row, nowMs);
  });
};

export const spendGenerationToken = async (
  reason: GenerationTokenSpendReason,
  careerId?: string,
  nowMs: number = Date.now(),
): Promise<SpendGenerationTokenResult> => {
  const db = getDb();
  return db.transaction('rw', db.meta, db.generationTokenLedger, async () => {
    const current = await ensureGenerationTokenRow(nowMs);
    const { row } = applyRegen(current, nowMs);
    if (row.tokens <= 0) {
      await db.meta.put(row);
      return { ok: false, state: toState(row, nowMs) };
    }
    const next: GenerationTokenRow = {
      ...row,
      tokens: row.tokens - 1,
      updatedAt: new Date(nowMs).toISOString(),
    };
    await db.meta.put(next);
    await db.generationTokenLedger.put(createLedgerRow({
      nowMs,
      kind: 'SPEND',
      amount: 1,
      balanceAfter: next.tokens,
      reason,
      careerId,
    }));
    return { ok: true, state: toState(next, nowMs) };
  });
};

export const refundGenerationToken = async (
  careerId?: string,
  nowMs: number = Date.now(),
): Promise<GenerationTokenState> => {
  const db = getDb();
  return db.transaction('rw', db.meta, db.generationTokenLedger, async () => {
    const current = await ensureGenerationTokenRow(nowMs);
    const { row } = applyRegen(current, nowMs);
    const next: GenerationTokenRow = {
      ...row,
      tokens: Math.min(GENERATION_TOKEN_CAP, row.tokens + 1),
      updatedAt: new Date(nowMs).toISOString(),
    };
    await db.meta.put(next);
    await db.generationTokenLedger.put(createLedgerRow({
      nowMs,
      kind: 'REFUND',
      amount: 1,
      balanceAfter: next.tokens,
      reason: 'TECHNICAL_REFUND',
      careerId,
    }));
    return toState(next, nowMs);
  });
};
