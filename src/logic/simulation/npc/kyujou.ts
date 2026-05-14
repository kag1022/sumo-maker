/**
 * NPC 場所開始時の確率的全休判定 (Fix-2)。
 *
 * 平成期実データ (sumo-db/data/analysis/realism_reference_heisei.json) の
 * "0-0-N" セル出現率に揃え、部屋格別の年率を per-basho 確率に変換して適用する。
 * 既存の世界 (`world/participants.ts`) には三役以上の age/streak driven kyujou があるが、
 * 中下位 / 平幕 / 関取一般 / 下位部屋には怪我休場のパイプラインが存在せず、
 * 診断レポートで全部屋 0-0-N = 0% という観測の根本原因になっていた。
 *
 * 部屋別の値はリファレンス実値からそのまま採用 (上位三役は世界側で別系統がさらに
 * 加算するため、Makuuchi はやや控えめに 2.0% とする)。
 */

import { Division } from '../../models';
import { RandomSource } from '../deps';
import type { TopDivision } from '../world/types';

const NPC_BASHO_KYUJOU_RATE: Record<Division, number> = {
  Makuuchi: 0.014, // ref 2.5% — 上位三役の既存 kyujou と partial 増を踏まえて微減
  Juryo: 0.019,    // ref 2.2% — 関取全休が過多だったため微減
  Makushita: 0.024, // ref 2.4%
  Sandanme: 0.036,  // ref 3.6%
  Jonidan: 0.052,   // ref 5.2%
  Jonokuchi: 0.088, // ref 8.8%
  Maezumo: 0.020,   // 参考値なし、平均的に
};

export const resolveNpcInjuryKyujou = (
  division: Division,
  rng: RandomSource,
): boolean => {
  const rate = NPC_BASHO_KYUJOU_RATE[division] ?? 0;
  return rng() < rate;
};

export type NpcPartialKyujoReason = 'injury' | 'illness' | 'fatigue' | 'unknown';

export type NpcPartialKyujoPlan = {
  startDay: number;
  reason: NpcPartialKyujoReason;
};

const NPC_SEKITORI_PARTIAL_KYUJO_RATE: Record<TopDivision, { base: number; cap: number }> = {
  Makuuchi: { base: 0.0098, cap: 0.045 },
  Juryo: { base: 0.0082, cap: 0.035 },
};

export const resolveNpcPartialKyujoPlan = (
  input: {
    division: TopDivision;
    rankName: string;
    age: number;
    form: number;
    stagnationPressure: number;
    recentAbsenceTotal: number;
    consecutiveMakekoshi: number;
    isPlayer: boolean;
    bashoKyujo: boolean;
  },
  rng: RandomSource,
): NpcPartialKyujoPlan | undefined => {
  if (input.isPlayer || input.bashoKyujo) return undefined;

  const topRankPressure =
    input.rankName === '横綱' ? 0.018 :
      input.rankName === '大関' ? 0.014 :
        input.rankName === '関脇' || input.rankName === '小結' ? 0.010 :
          0;
  const divisionRate = NPC_SEKITORI_PARTIAL_KYUJO_RATE[input.division];
  const agePressure = Math.max(0, input.age - 29) * 0.002 + Math.max(0, input.age - 34) * 0.003;
  const formPressure = Math.max(0, 0.95 - input.form) * 0.02;
  const slumpPressure =
    (Math.max(0, input.stagnationPressure - 1.2) * 0.0006 +
      Math.max(0, input.consecutiveMakekoshi - 1) * 0.0005 +
      Math.max(0, input.recentAbsenceTotal - 1) * 0.00025) * 3;
  const rate = Math.min(
    divisionRate.cap,
    divisionRate.base + topRankPressure + agePressure + formPressure + slumpPressure,
  );
  if (rng() >= rate) return undefined;

  const roll = rng();
  const startDay =
    roll < 0.36 ? 2 + Math.floor(rng() * 7) :
      roll < 0.66 ? 9 + Math.floor(rng() * 4) :
        13 + Math.floor(rng() * 3);
  const reasonRoll = rng();
  const reason: NpcPartialKyujoReason =
    reasonRoll < 0.58 ? 'injury' :
      reasonRoll < 0.78 ? 'fatigue' :
        reasonRoll < 0.9 ? 'illness' :
          'unknown';
  return {
    startDay: Math.max(2, Math.min(15, startDay)),
    reason,
  };
};
