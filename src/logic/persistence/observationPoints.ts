import { getDb, ObservationPointLedgerRow, ObservationPointRow } from './db';

export interface ObservationPointState {
  points: number;
  totalEarned: number;
}

// Note: ObservationPointLedgerRow.reason is a fixed Dexie row type and is not
// changed (no schema migration). Newer reasons fall back to MANUAL_ADJUST in
// the ledger row, but we still pass the semantic reason here for telemetry.
export type ObservationPointReason =
  | 'CAREER_OBSERVATION'
  | 'EXPERIMENT_OBSERVATION'
  | 'OBSERVER_UPGRADE'
  | 'MANUAL_ADJUST'
  | 'OBSERVE_THEME'
  | 'OBSERVATION_BUILD'
  | 'ARCHIVE_NEW_ENTRY'
  | 'NEW_CATEGORY'
  | 'RARE_TITLE';

export type ObservationPointEarnReason = Exclude<ObservationPointReason, 'OBSERVER_UPGRADE' | 'OBSERVE_THEME' | 'OBSERVATION_BUILD'>;
export type ObservationPointSpendReason = Exclude<ObservationPointReason, 'CAREER_OBSERVATION' | 'EXPERIMENT_OBSERVATION' | 'ARCHIVE_NEW_ENTRY' | 'NEW_CATEGORY' | 'RARE_TITLE' | 'MANUAL_ADJUST'>;

const LEGACY_LEDGER_REASONS = new Set([
  'CAREER_OBSERVATION',
  'EXPERIMENT_OBSERVATION',
  'OBSERVER_UPGRADE',
  'MANUAL_ADJUST',
]);

const toLedgerReason = (
  reason: ObservationPointReason,
): ObservationPointLedgerRow['reason'] => {
  if (LEGACY_LEDGER_REASONS.has(reason)) {
    return reason as ObservationPointLedgerRow['reason'];
  }
  // Newer reasons (OBSERVE_THEME / OBSERVATION_BUILD / ARCHIVE_*) — keep ledger
  // row schema-stable by recording them as MANUAL_ADJUST. Telemetry of the
  // semantic reason can be added later via a dedicated column.
  return 'MANUAL_ADJUST';
};

const createLedgerId = (nowMs: number): string =>
  globalThis.crypto?.randomUUID?.() ?? `observation-point-${nowMs}-${Math.random().toString(36).slice(2, 10)}`;

const createLedgerRow = (
  params: Omit<ObservationPointLedgerRow, 'id' | 'createdAt'> & { nowMs: number },
): ObservationPointLedgerRow => ({
  id: createLedgerId(params.nowMs),
  createdAt: new Date(params.nowMs).toISOString(),
  kind: params.kind,
  amount: params.amount,
  balanceAfter: params.balanceAfter,
  reason: params.reason,
  careerId: params.careerId,
});

const ensureObservationPointRow = async (nowMs: number): Promise<ObservationPointRow> => {
  const db = getDb();
  const existing = await db.meta.get('observationPoints');
  if (existing?.key === 'observationPoints') return existing;

  const row: ObservationPointRow = {
    key: 'observationPoints',
    points: 0,
    totalEarned: 0,
    updatedAt: new Date(nowMs).toISOString(),
  };
  await db.meta.put(row);
  return row;
};

const toState = (row: ObservationPointRow): ObservationPointState => ({
  points: Math.max(0, Math.floor(row.points)),
  totalEarned: Math.max(0, Math.floor(row.totalEarned)),
});

export const getObservationPointState = async (nowMs: number = Date.now()): Promise<ObservationPointState> => {
  const row = await ensureObservationPointRow(nowMs);
  return toState(row);
};

export const addObservationPoints = async (
  amount: number,
  reason: ObservationPointEarnReason,
  careerId?: string,
  nowMs: number = Date.now(),
): Promise<ObservationPointState> => {
  const safeAmount = Math.max(0, Math.floor(amount));
  const db = getDb();
  return db.transaction('rw', db.meta, db.observationPointLedger, async () => {
    const current = await ensureObservationPointRow(nowMs);
    const next: ObservationPointRow = {
      ...current,
      points: current.points + safeAmount,
      totalEarned: current.totalEarned + safeAmount,
      updatedAt: new Date(nowMs).toISOString(),
    };
    await db.meta.put(next);
    if (safeAmount > 0) {
      await db.observationPointLedger.put(createLedgerRow({
        nowMs,
        kind: 'EARN',
        amount: safeAmount,
        balanceAfter: next.points,
        reason: toLedgerReason(reason),
        careerId,
      }));
    }
    return toState(next);
  });
};

export const spendObservationPoints = async (
  amount: number,
  reason: ObservationPointSpendReason,
  nowMs: number = Date.now(),
  careerId?: string,
): Promise<{ ok: boolean; state: ObservationPointState }> => {
  const safeAmount = Math.max(0, Math.floor(amount));
  const db = getDb();
  return db.transaction('rw', db.meta, db.observationPointLedger, async () => {
    const current = await ensureObservationPointRow(nowMs);
    if (safeAmount > current.points) {
      return { ok: false, state: toState(current) };
    }
    const next: ObservationPointRow = {
      ...current,
      points: current.points - safeAmount,
      updatedAt: new Date(nowMs).toISOString(),
    };
    await db.meta.put(next);
    if (safeAmount > 0) {
      await db.observationPointLedger.put(createLedgerRow({
        nowMs,
        kind: 'SPEND',
        amount: safeAmount,
        balanceAfter: next.points,
        reason: toLedgerReason(reason),
        careerId,
      }));
    }
    return { ok: true, state: toState(next) };
  });
};
