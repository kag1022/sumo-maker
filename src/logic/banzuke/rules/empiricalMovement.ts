/**
 * 経験的番付移動モデル
 *
 * 実データ calibration の量子値を使い、
 * 幕内・十両の番付移動を決定論的な線形乗数からデータ駆動型に置換する。
 *
 * COMMITTEE_MODEL パス（singleRankChange.ts）から呼ばれ、
 * 前頭内移動・十両内移動の基本ロジックを提供する。
 */
import {
  resolveEmpiricalSlotBand,
  resolveEmpiricalRankBand,
  resolveEmpiricalRecordBucket,
} from '../providers/empirical';
import { RandomSource } from '../../simulation/deps';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const MIN_SAMPLE_SIZE = 20;

export interface EmpiricalMovementInput {
  division: 'Makuuchi' | 'Juryo';
  rankName: string;
  rankNumber: number;
  wins: number;
  losses: number;
  absent: number;
  /** 幕内なら8(Y/OのE/Wスロット数)、十両ならofssets.Juryoに相当 */
  divisionSlotOffset: number;
  /** 部門内の最大半枠数 (前頭17*2=34 or 十両14*2=28) */
  divisionTotalHalfSlots: number;
  /** プレイヤーの場所内POE (領域4) */
  performanceOverExpected?: number;
  /** 停滞圧力 (0-4.2, 領域7): 高値でp90寄り（不利）、低値でp10寄り（有利） */
  stagnationPressure?: number;
}

export interface EmpiricalMovementResult {
  /** 新しい部門内番号 (e.g., 前頭3、十両5) */
  targetNumber: number;
  /** 東西 */
  targetSide: 'East' | 'West';
  /** サンプルサイズ (0なら経験的データ不使用) */
  sampleSize: number;
  /** 使用されたソース */
  source: 'recordAware' | 'divisionQuantile' | 'fallback';
  /** ランクバンド */
  rankBand: string;
  /** 記録バケット */
  recordBucket: string;
}

/**
 * 経験的データに基づく前頭/十両内の移動先を計算する。
 *
 * サンプルサイズが不足する場合は null を返し、
 * 呼び出し側は従来の線形計算にフォールバックする。
 */
export const resolveEmpiricalMovement = (
  input: EmpiricalMovementInput,
  rng: RandomSource = Math.random,
): EmpiricalMovementResult | null => {
  const {
    division,
    rankName,
    rankNumber,
    wins,
    losses,
    absent,
    divisionTotalHalfSlots,
    performanceOverExpected,
  } = input;

  // 現在の部門内ハーフステップ位置を計算
  const currentHalfSlot = (rankNumber - 1) * 2 + 1; // East=1, 奇数基準

  // 全体スロット座標に変換（empirical.tsが全体座標で動く前提だが、
  // 幕内・十両単独での半枠移動量として量子値を利用する）
  const totalSlots = divisionTotalHalfSlots;
  const currentSlot = clamp(currentHalfSlot, 1, totalSlots);

  const empiricalResult = resolveEmpiricalSlotBand({
    division,
    rankName,
    rankNumber,
    currentSlot,
    totalSlots,
    wins,
    losses,
    absent,
  });

  if (empiricalResult.sampleSize < MIN_SAMPLE_SIZE) {
    return null;
  }

  // p10-p90の範囲からrngでサンプリング
  // 停滞圧力: 高圧力(>2.0)でp90寄り(不利な結果)、低圧力でp10寄り(有利)にバイアス
  let t = rng();
  const pressure = input.stagnationPressure ?? 0;
  if (pressure > 2.0) {
    // 不利方向にバイアス: tを0.5-1.0寄りにシフト
    const bias = clamp((pressure - 2.0) / 2.2, 0, 0.35);
    t = clamp(t + bias * (1 - t), 0, 1);
  } else if (pressure < 0.5 && pressure > 0) {
    // リバウンド中: tを0-0.5寄りにシフト（有利）
    const bonus = clamp((0.5 - pressure) * 0.3, 0, 0.15);
    t = clamp(t - bonus * t, 0, 1);
  }
  const sampledSlot = Math.round(
    empiricalResult.minSlot + (empiricalResult.maxSlot - empiricalResult.minSlot) * t,
  );
  const boundedSlot = clamp(sampledSlot, 1, totalSlots);

  // POE調整 (領域4): POEが高い → スロットを下げる(昇進寄り)
  let adjustedSlot = boundedSlot;
  if (performanceOverExpected !== undefined) {
    const poeShift = performanceOverExpected > 2.0
      ? -3
      : performanceOverExpected > 1.0
        ? -1
        : performanceOverExpected < -2.0
          ? 3
          : performanceOverExpected < -1.0
            ? 1
            : 0;
    adjustedSlot = clamp(adjustedSlot + poeShift, 1, totalSlots);
  }

  // ハーフステップから番号・東西に変換
  const targetNumber = Math.floor((adjustedSlot - 1) / 2) + 1;
  const targetSide: 'East' | 'West' = adjustedSlot % 2 === 1 ? 'East' : 'West';

  return {
    targetNumber,
    targetSide,
    sampleSize: empiricalResult.sampleSize,
    source: empiricalResult.source,
    rankBand: empiricalResult.rankBand,
    recordBucket: empiricalResult.recordBucket,
  };
};

/**
 * 経験的データが利用可能かどうかを素早くチェックする。
 * singleRankChange.ts のハードルール判定より後で呼ぶ。
 */
export const hasEmpiricalData = (
  division: string,
  rankName: string,
  rankNumber?: number,
  wins?: number,
  losses?: number,
  absent?: number,
): boolean => {
  const recordBucket = resolveEmpiricalRecordBucket(wins ?? 0, losses ?? 0, absent ?? 0);
  const rankBand = resolveEmpiricalRankBand(division, rankName, rankNumber);
  // 量子値が存在するかの簡易チェック（完全なルックアップは resolveEmpiricalMovement に委ねる）
  return rankBand !== 'unknown' && recordBucket.length > 0;
};
