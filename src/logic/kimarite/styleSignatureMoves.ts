import type { StyleArchetype } from '../models';

/**
 * 各型の「定石」決まり手セット。
 * identity.ts の StyleArchetype ごとに、視聴者が「型の代表技」と感じるものを宣言。
 * selection.ts の weight 計算で軽いブースト係数として層にかける。
 */
export const STYLE_SIGNATURE_MOVES: Record<StyleArchetype, string[]> = {
  YOTSU: ['寄り切り', '寄り倒し', '上手投げ', '下手投げ', '上手出し投げ', '下手出し投げ'],
  TSUKI_OSHI: ['押し出し', '突き出し', '突き倒し', '押し倒し', 'はたき込み'],
  MOROZASHI: ['寄り切り', '下手投げ', '下手出し投げ', '下手ひねり', 'すくい投げ', '掬い投げ'],
  NAGE_TECH: ['上手投げ', '下手投げ', 'すくい投げ', '掬い投げ', '小手投げ', '内無双', '腰投げ', '一本背負い'],
  DOHYOUGIWA: ['うっちゃり', '送り出し', '送り倒し', '極め出し', '極め倒し', '切り返し', '肩透かし'],
  POWER_PRESSURE: ['寄り倒し', '押し倒し', '浴びせ倒し', '極め倒し', 'つり出し', 'つり落とし'],
};

const STYLE_SIGNATURE_SET: Record<StyleArchetype, Set<string>> = {
  YOTSU: new Set(STYLE_SIGNATURE_MOVES.YOTSU),
  TSUKI_OSHI: new Set(STYLE_SIGNATURE_MOVES.TSUKI_OSHI),
  MOROZASHI: new Set(STYLE_SIGNATURE_MOVES.MOROZASHI),
  NAGE_TECH: new Set(STYLE_SIGNATURE_MOVES.NAGE_TECH),
  DOHYOUGIWA: new Set(STYLE_SIGNATURE_MOVES.DOHYOUGIWA),
  POWER_PRESSURE: new Set(STYLE_SIGNATURE_MOVES.POWER_PRESSURE),
};

/**
 * 勝者の得意型セット（strongStyles）と決まり手名から、定石マッチの強度を算出。
 * - 1つでもマッチしていれば >1 の係数を返す。
 * - 複数型にマッチしても上限で飽和。
 */
export const resolveStyleSignatureFit = (
  moveName: string,
  strongStyles: StyleArchetype[] | undefined,
): number => {
  if (!strongStyles || strongStyles.length === 0) return 1;
  let matched = 0;
  for (const style of strongStyles) {
    if (STYLE_SIGNATURE_SET[style]?.has(moveName)) {
      matched += 1;
    }
  }
  if (matched <= 0) return 1;
  return Math.min(1.5, 1 + 0.28 * Math.min(matched, 2));
};

/**
 * 敗者の得意型と決まり手が一致する場合（= 相手の土俵で負ける）の抑制係数。
 */
export const resolveLoserFieldPenalty = (
  moveName: string,
  loserStrongStyles: StyleArchetype[] | undefined,
): number => {
  if (!loserStrongStyles || loserStrongStyles.length === 0) return 1;
  for (const style of loserStrongStyles) {
    if (STYLE_SIGNATURE_SET[style]?.has(moveName)) {
      return 0.82;
    }
  }
  return 1;
};
