/**
 * シミュレーションモデルバージョン
 *
 * 現在は 'v3' のみ。将来バージョンを追加する場合に型として拡張する。
 * 既存のセーブデータには 'unified-v2-kimarite' や 'unified-v3-variance' が
 * 残っている可能性があるため、normalizeSimulationModelVersion で安全にフォールバックする。
 */
export type SimulationModelVersion = 'v3';

export const DEFAULT_SIMULATION_MODEL_VERSION: SimulationModelVersion = 'v3';

export const normalizeSimulationModelVersion = (
  _version?: string,
): SimulationModelVersion => 'v3';

export const normalizeNewRunModelVersion = (
  _requested?: string,
): SimulationModelVersion => 'v3';
