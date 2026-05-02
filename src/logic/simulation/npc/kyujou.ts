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

const NPC_BASHO_KYUJOU_RATE: Record<Division, number> = {
  Makuuchi: 0.020, // ref 2.5% — 上位三役の既存 kyujou が +0.5% 追加するため控えめ
  Juryo: 0.022,    // ref 2.2%
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
