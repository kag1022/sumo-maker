import {
  MakuuchiLayout,
  decodeMakuuchiRankFromScore,
  encodeMakuuchiRankToScore,
} from '../../ranking/banzukeLayout';
import { Rank } from '../../models';
import { normalizeSekitoriLosses } from '../../ranking/topDivisionRules';

type TopDivision = 'Makuuchi' | 'Juryo';

type DivisionBashoSnapshotLike = {
  id: string;
  wins: number;
  losses: number;
  absent?: number;
  rankScore?: number;
  rank?: Rank;
};

type WorldForPlayerNormalization = {
  lastBashoResults: Partial<Record<TopDivision, DivisionBashoSnapshotLike[]>>;
  makuuchiLayout: MakuuchiLayout;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const toTopDivision = (rank: Rank): TopDivision | null => {
  if (rank.division === 'Makuuchi') return 'Makuuchi';
  if (rank.division === 'Juryo') return 'Juryo';
  return null;
};

const resolvePlayerSnapshot = (
  world: WorldForPlayerNormalization,
  division: TopDivision,
): DivisionBashoSnapshotLike | undefined =>
  (world.lastBashoResults[division] ?? []).find((result) => result.id === 'PLAYER');

const resolveMakuuchiRank = (
  row: DivisionBashoSnapshotLike,
  layout: MakuuchiLayout,
): Rank | undefined => {
  if (row.rank?.division === 'Makuuchi') return row.rank;
  if (typeof row.rankScore === 'number') return decodeMakuuchiRankFromScore(row.rankScore, layout);
  return undefined;
};

const isUpperMakuuchiLane = (rank: Rank): boolean =>
  rank.division === 'Makuuchi' &&
  (
    rank.name === '関脇' ||
    rank.name === '小結' ||
    (rank.name === '前頭' && (rank.number || 99) <= 8)
  );

const resolveUpperLanePressure = (world: WorldForPlayerNormalization): number => {
  const rows = world.lastBashoResults.Makuuchi ?? [];
  let collapse = 0;
  let blockers = 0;
  for (const row of rows) {
    if (row.id === 'PLAYER') continue;
    const rank = resolveMakuuchiRank(row, world.makuuchiLayout);
    if (!rank || !isUpperMakuuchiLane(rank)) continue;
    const losses = normalizeSekitoriLosses(row.wins, row.losses, row.absent);
    const diff = row.wins - losses;
    if (diff <= -1) collapse += 1;
    if (diff >= 2) blockers += 1;
  }
  return collapse - blockers;
};

const toMakuuchiSlot = (rank: Rank, layout: MakuuchiLayout): number =>
  encodeMakuuchiRankToScore(rank, layout) - 1;

const fromMakuuchiSlot = (slot: number, layout: MakuuchiLayout): Rank =>
  decodeMakuuchiRankFromScore(slot + 1, layout);

export const normalizePlayerAssignedRank = (
  world: WorldForPlayerNormalization,
  currentRank: Rank,
  assignedRank: Rank,
): Rank => {
  const topDivision = toTopDivision(currentRank);
  if (!topDivision) return assignedRank;
  const snapshot = resolvePlayerSnapshot(world, topDivision);
  const wins = snapshot?.wins ?? 0;
  const losses = snapshot
    ? normalizeSekitoriLosses(snapshot.wins, snapshot.losses, snapshot.absent)
    : 15 - wins;

  // 十両→幕内は、現実的に前頭帯への昇進に制限する（十両からの直三役を防止）。
  if (currentRank.division === 'Juryo' && assignedRank.division === 'Makuuchi') {
    const juryoNumber = currentRank.number || 14;
    const upperLanePressure = resolveUpperLanePressure(world);
    let mNumber = 17;
    if (juryoNumber <= 3 && wins >= 14) {
      const dominantBase = juryoNumber === 1 ? 9 : juryoNumber === 2 ? 10 : 11;
      const pressureShift = upperLanePressure >= 4 ? -1 : upperLanePressure <= -3 ? 1 : 0;
      mNumber = clamp(dominantBase + pressureShift, 8, 12);
    } else if (juryoNumber === 1 && wins >= 10) {
      mNumber = clamp(16 - (wins - 10), 12, 17);
    } else if (juryoNumber === 2 && wins >= 11) {
      mNumber = clamp(15 - (wins - 11), 11, 17);
    } else if (juryoNumber <= 3 && wins >= 12) {
      mNumber = clamp(14 - (wins - 12), 10, 17);
    } else if (juryoNumber <= 6 && wins >= 13) {
      mNumber = 12;
    }
    return {
      division: 'Makuuchi',
      name: '前頭',
      number: mNumber,
      side: assignedRank.side ?? 'East',
    };
  }

  if (currentRank.division !== 'Makuuchi' || assignedRank.division !== 'Makuuchi') {
    return assignedRank;
  }

  // 幕内内の再配置は全段位を東西込みスロットで正規化する。
  const diff = wins - losses;
  const currentSlot = toMakuuchiSlot(currentRank, world.makuuchiLayout);
  let assignedSlot = toMakuuchiSlot(assignedRank, world.makuuchiLayout);
  const slotFloor = 0;
  const slotCeiling = Math.max(41, currentSlot, assignedSlot);

  // 全段位共通: 勝ち越しで下位へ、負け越しで上位へ行く逆転をまず抑制。
  if (diff > 0 && assignedSlot > currentSlot) assignedSlot = currentSlot;
  if (diff < 0 && assignedSlot < currentSlot) assignedSlot = currentSlot;

  const promotionCapSlots =
    diff <= 0 ? 0 : diff === 1 ? 2 : diff === 2 ? 4 : diff === 3 ? 6 : diff === 4 ? 8 : 10;
  const demotionCapSlots =
    diff >= 0 ? 0 : diff === -1 ? 2 : diff === -2 ? 5 : diff === -3 ? 9 : diff === -4 ? 13 : diff === -5 ? 17 : 21;
  const minAllowedSlot = clamp(currentSlot - promotionCapSlots, slotFloor, slotCeiling);
  const maxAllowedSlot = clamp(currentSlot + demotionCapSlots, slotFloor, slotCeiling);

  const forceRiseSlots =
    diff <= 0 ? 0 : diff === 1 ? 1 : diff === 2 ? 2 : diff === 3 ? 3 : diff === 4 ? 4 : diff === 5 ? 5 : 6;
  const forcedMaxSlot = clamp(currentSlot - forceRiseSlots, slotFloor, slotCeiling);
  const forceDropSlots =
    diff >= 0 ? 0 : diff === -1 ? 2 : diff === -2 ? 4 : diff === -3 ? 8 : diff === -4 ? 12 : diff === -5 ? 16 : 19;
  const forcedMinSlot = clamp(currentSlot + forceDropSlots, slotFloor, slotCeiling);

  let normalizedSlot = assignedSlot;
  if (diff > 0) {
    // 勝ち越し時は最低限上がる（半枚上昇を含む）。
    normalizedSlot = Math.min(normalizedSlot, forcedMaxSlot);
  }
  if (diff < 0) {
    // 負け越し時は最低限下がる（半枚降下を含む）。
    normalizedSlot = Math.max(normalizedSlot, forcedMinSlot);
  }
  normalizedSlot = clamp(normalizedSlot, minAllowedSlot, maxAllowedSlot);

  if (
    currentRank.name === '前頭' &&
    (currentRank.number || 99) <= 5 &&
    diff === 1
  ) {
    const upperMaegashiraFloor = toMakuuchiSlot({
      division: 'Makuuchi',
      name: '前頭',
      number: 1,
      side: 'East',
    }, world.makuuchiLayout);
    normalizedSlot = Math.max(normalizedSlot, upperMaegashiraFloor);
  }

  if (
    currentRank.name === '前頭' &&
    diff === 1 &&
    (currentRank.number || 99) >= 6 &&
    (currentRank.number || 0) <= 10
  ) {
    const upperLanePressure = resolveUpperLanePressure(world);
    const relativeNudge = upperLanePressure >= 4 ? -1 : upperLanePressure <= -3 ? 1 : 0;
    normalizedSlot = clamp(normalizedSlot + relativeNudge, minAllowedSlot, maxAllowedSlot);
  }

  if (
    currentRank.division === 'Makuuchi' &&
    (currentRank.name === '前頭' || currentRank.name === '小結')
  ) {
    const sekiwakeCeiling = toMakuuchiSlot({
      division: 'Makuuchi',
      name: '関脇',
      side: 'East',
    }, world.makuuchiLayout);
    normalizedSlot = Math.max(normalizedSlot, sekiwakeCeiling);
  }

  // 関脇・小結の7-8は大崩れにしないが、東西/半枚変動は許容する。
  if (currentRank.name === '関脇' && wins === 7) {
    const sekiwakeSoftLandingMax = toMakuuchiSlot({
      division: 'Makuuchi',
      name: '前頭',
      number: 4,
      side: 'West',
    }, world.makuuchiLayout);
    normalizedSlot = Math.min(normalizedSlot, sekiwakeSoftLandingMax);
  }
  if (currentRank.name === '小結' && wins === 7) {
    const komusubiSoftLandingMax = toMakuuchiSlot({
      division: 'Makuuchi',
      name: '前頭',
      number: 6,
      side: 'West',
    }, world.makuuchiLayout);
    normalizedSlot = Math.min(normalizedSlot, komusubiSoftLandingMax);
  }

  return fromMakuuchiSlot(normalizedSlot, world.makuuchiLayout);
};
