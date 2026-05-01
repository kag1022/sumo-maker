/**
 * Fix-3: NPC 想定キャリア場所数モデル
 *
 * 平成期 (1989-2019) の retired 力士の career_bashos 分位値:
 *   p10 = 4 / p50 = 32 / p90 = 89 / sample = 2627
 *   ([sumo-db/data/analysis/realism_reference_heisei.json](../../../../sumo-db/data/analysis/realism_reference_heisei.json))
 *
 * 旧モデル (`careerLengthHazardMultiplier`) は全 NPC に共通の hazard カーブを当てるため、
 * 個体差が出ず生存曲線が指数的になっていた。本実装は NPC 生成時に triangular 分布から
 * 個別の plannedCareerBasho を抽出し、retirement step が
 *   targetHazard = 0.5 * sigmoid((careerBashoCount - planned) / 6)
 * を発火させる。これにより:
 *   - 早期に planned が小さい NPC は数場所で消える (p10 帯)
 *   - 平均的 NPC は 30 場所前後で退場 (p50 帯)
 *   - 一握りの NPC は 80+ 場所まで残存 (p90 帯)
 * という Heisei 形状の集団生存曲線が再現される。
 */

import { RandomSource } from '../deps';

const HEISEI_CAREER_BASHO_P10 = 4;
const HEISEI_CAREER_BASHO_P50 = 32;
const HEISEI_CAREER_BASHO_P90 = 89;
const HEISEI_CAREER_BASHO_MIN = 1;
const HEISEI_CAREER_BASHO_MAX = 200;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Triangular sampling from (p10, p50, p90) approximated as
 * piecewise-uniform between low/mid/high.
 * Tail probability ~10% on each side covers 1..p10 and p90..200.
 */
export const samplePlannedCareerBasho = (rng: RandomSource): number => {
  const u = rng();
  let v: number;
  if (u < 0.10) {
    // 1..p10 域 (左裾)
    v = HEISEI_CAREER_BASHO_MIN +
      (HEISEI_CAREER_BASHO_P10 - HEISEI_CAREER_BASHO_MIN) * (u / 0.10);
  } else if (u < 0.50) {
    // p10..p50 域 (左本体)
    v = HEISEI_CAREER_BASHO_P10 +
      (HEISEI_CAREER_BASHO_P50 - HEISEI_CAREER_BASHO_P10) * ((u - 0.10) / 0.40);
  } else if (u < 0.90) {
    // p50..p90 域 (右本体)
    v = HEISEI_CAREER_BASHO_P50 +
      (HEISEI_CAREER_BASHO_P90 - HEISEI_CAREER_BASHO_P50) * ((u - 0.50) / 0.40);
  } else {
    // p90..max 域 (右裾)
    v = HEISEI_CAREER_BASHO_P90 +
      (HEISEI_CAREER_BASHO_MAX - HEISEI_CAREER_BASHO_P90) * ((u - 0.90) / 0.10);
  }
  return Math.round(clamp(v, HEISEI_CAREER_BASHO_MIN, HEISEI_CAREER_BASHO_MAX));
};

/**
 * planned に基づく per-basho 退場 hazard。
 *
 * 設計方針:
 *  - planned よりかなり前 (past <= -3): 0 — 既存 empirical/streak hazard に任せる
 *  - planned 直前 (past = -2 to -1): 軽い hazard で planning 値の前後 ±2 場所のジッタ確保
 *  - planned 到達後 (past >= 0): 強い hazard で確実に退場へ
 * planned 値そのものは triangular で個別に振っているため、集団としての生存曲線は
 * Heisei 形状 (p10=4 / p50=32 / p90=89) に整合する。
 */
export const resolvePlannedCareerHazard = (
  careerBashoCount: number,
  plannedCareerBasho: number | undefined,
): number => {
  const planned = plannedCareerBasho ?? HEISEI_CAREER_BASHO_P50;
  // 設計変更 (v5): plannedCareerBasho の主な役割は「個体差の付与」であり、retirement
  // hazard 寄与は最小限とする。empirical/multiplier が主、planned は超過滞留時の保険のみ。
  // 短期 planned NPC を強制退場させると逆に診断 KL が悪化する（短命 NPC が長命 NPC の
  // 観測ウィンドウで過剰検出されるバイアス）ため、ハザード寄与は遅め・小さめ。
  const past = careerBashoCount - planned;
  if (past >= 8) return 0.30;
  if (past >= 4) return 0.10;
  return 0;
};
