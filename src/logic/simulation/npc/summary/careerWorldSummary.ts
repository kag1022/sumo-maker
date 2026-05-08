import type { Division, RikishiStatus } from "../../../models";
import type { BashoRecordRow } from "../../../persistence/db";
import type {
  CareerBashoRecordsBySeq,
  CareerPlayerBoutsByBasho,
} from "../../../persistence/shared";
import { buildCareerRaritySummary } from "./careerRarity";
import type {
  CareerWorldSummary,
  EraStarNpcSummary,
  NotableNpcSummary,
  RivalryKind,
} from "./types";

const DIVISION_ORDER: Record<string, number> = {
  Makuuchi: 0,
  Juryo: 1,
  Makushita: 2,
  Sandanme: 3,
  Jonidan: 4,
  Jonokuchi: 5,
  Maezumo: 6,
};

const SAME_GENERATION_WINDOW = 12;
const FREQUENT_OPPONENT_THRESHOLD = 4;
const NEMESIS_DELTA = 3;

const rankSortScore = (row: BashoRecordRow): number =>
  (DIVISION_ORDER[row.division] ?? 99) * 1000 +
  (row.rankNumber ?? 0) * 2 +
  (row.rankSide === "West" ? 1 : 0);

const rankLabelFromRow = (row: BashoRecordRow): string =>
  row.rankNumber ? `${row.rankName}${row.rankNumber}` : row.rankName;

const isSanyakuRow = (row: BashoRecordRow): boolean =>
  row.rankName === "関脇" || row.rankName === "小結";

const isMakuuchiTopHalf = (row: BashoRecordRow): boolean =>
  row.division === "Makuuchi" && (row.rankNumber ?? 99) <= 8;

interface NpcAggregate {
  id: string;
  shikona: string;
  rows: BashoRecordRow[];
  firstSeq: number;
  lastSeq: number;
  yokozunaBasho: number;
  ozekiBasho: number;
  sanyakuBasho: number;
  makuuchiTopHalfBasho: number;
  yushoLikeCount: number;
}

const aggregateNpcsAcrossBasho = (
  bashoRows: CareerBashoRecordsBySeq[],
): Map<string, NpcAggregate> => {
  const map = new Map<string, NpcAggregate>();
  for (const basho of bashoRows) {
    for (const row of basho.rows) {
      if (row.entityType !== "NPC") continue;
      let agg = map.get(row.entityId);
      if (!agg) {
        agg = {
          id: row.entityId,
          shikona: row.shikona,
          rows: [],
          firstSeq: basho.bashoSeq,
          lastSeq: basho.bashoSeq,
          yokozunaBasho: 0,
          ozekiBasho: 0,
          sanyakuBasho: 0,
          makuuchiTopHalfBasho: 0,
          yushoLikeCount: 0,
        };
        map.set(row.entityId, agg);
      }
      agg.rows.push(row);
      agg.shikona = row.shikona;
      if (basho.bashoSeq < agg.firstSeq) agg.firstSeq = basho.bashoSeq;
      if (basho.bashoSeq > agg.lastSeq) agg.lastSeq = basho.bashoSeq;
      if (row.rankName === "横綱") agg.yokozunaBasho += 1;
      else if (row.rankName === "大関") agg.ozekiBasho += 1;
      else if (isSanyakuRow(row)) agg.sanyakuBasho += 1;
      if (isMakuuchiTopHalf(row)) agg.makuuchiTopHalfBasho += 1;
      if (row.titles.includes("YUSHO")) agg.yushoLikeCount += 1;
    }
  }
  return map;
};

const peakRowOf = (agg: NpcAggregate): BashoRecordRow =>
  agg.rows.slice().sort((a, b) => rankSortScore(a) - rankSortScore(b))[0];

interface PlayerBoutAggregate {
  meetings: number;
  playerWins: number;
  npcWins: number;
  firstMetSeq: number;
  lastMetSeq: number;
  decisiveDays: number;
  closeRankBasho: Set<number>;
  promotionRaceBasho: Set<number>;
  titleRaceBasho: Set<number>;
}

const buildPlayerBoutAggregates = (
  playerBouts: CareerPlayerBoutsByBasho[],
  bashoRows: CareerBashoRecordsBySeq[],
  playerEntityId: string,
): Map<string, PlayerBoutAggregate> => {
  const result = new Map<string, PlayerBoutAggregate>();
  const playerRowBySeq = new Map<number, BashoRecordRow>();
  for (const basho of bashoRows) {
    const playerRow = basho.rows.find(
      (r) => r.entityType === "PLAYER" && r.entityId === playerEntityId,
    );
    if (playerRow) playerRowBySeq.set(basho.bashoSeq, playerRow);
  }
  for (const basho of playerBouts) {
    const playerRow = playerRowBySeq.get(basho.bashoSeq);
    for (const bout of basho.bouts) {
      if (!bout.opponentId) continue;
      let agg = result.get(bout.opponentId);
      if (!agg) {
        agg = {
          meetings: 0,
          playerWins: 0,
          npcWins: 0,
          firstMetSeq: basho.bashoSeq,
          lastMetSeq: basho.bashoSeq,
          decisiveDays: 0,
          closeRankBasho: new Set(),
          promotionRaceBasho: new Set(),
          titleRaceBasho: new Set(),
        };
        result.set(bout.opponentId, agg);
      }
      agg.meetings += 1;
      if (bout.result === "WIN") agg.playerWins += 1;
      else if (bout.result === "LOSS") agg.npcWins += 1;
      if (basho.bashoSeq < agg.firstMetSeq) agg.firstMetSeq = basho.bashoSeq;
      if (basho.bashoSeq > agg.lastMetSeq) agg.lastMetSeq = basho.bashoSeq;
      if ((bout.day ?? 0) >= 14) agg.decisiveDays += 1;

      // Close rank: same division & rank number within 5
      if (playerRow) {
        const opp = bashoRows
          .find((b) => b.bashoSeq === basho.bashoSeq)
          ?.rows.find((r) => r.entityId === bout.opponentId);
        if (opp && opp.division === playerRow.division) {
          const dn = Math.abs((opp.rankNumber ?? 0) - (playerRow.rankNumber ?? 0));
          if (dn <= 5) agg.closeRankBasho.add(basho.bashoSeq);
        }
        if (opp && opp.division !== playerRow.division) {
          // both at the boundary
          const ord = (DIVISION_ORDER[opp.division] ?? 99) -
            (DIVISION_ORDER[playerRow.division] ?? 99);
          if (Math.abs(ord) === 1) agg.promotionRaceBasho.add(basho.bashoSeq);
        }
        if (
          playerRow.division === "Makuuchi" &&
          opp?.division === "Makuuchi" &&
          (playerRow.wins >= 11 || (opp.wins ?? 0) >= 11)
        ) {
          agg.titleRaceBasho.add(basho.bashoSeq);
        }
      }
    }
  }
  return result;
};

interface PlayerCareerWindow {
  firstSeq: number;
  lastSeq: number;
  entityId: string;
}

const resolvePlayerWindow = (
  bashoRows: CareerBashoRecordsBySeq[],
): PlayerCareerWindow | null => {
  if (!bashoRows.length) return null;
  const first = bashoRows[0]?.bashoSeq ?? 0;
  const last = bashoRows[bashoRows.length - 1]?.bashoSeq ?? first;
  const playerRow = bashoRows[0]?.rows.find((r) => r.entityType === "PLAYER");
  return {
    firstSeq: first,
    lastSeq: last,
    entityId: playerRow?.entityId ?? "PLAYER",
  };
};

const buildNotableSummary = (
  agg: NpcAggregate,
  bouts: PlayerBoutAggregate | null,
  playerWindow: PlayerCareerWindow,
  playerMaxDivision: Division,
): NotableNpcSummary => {
  const peak = peakRowOf(agg);
  const final = agg.rows[agg.rows.length - 1];
  const meetings = bouts?.meetings ?? 0;
  const playerWins = bouts?.playerWins ?? 0;
  const npcWins = bouts?.npcWins ?? 0;
  const closeRank = bouts?.closeRankBasho.size ?? 0;
  const promotionRace = bouts?.promotionRaceBasho.size ?? 0;
  const titleRace = bouts?.titleRaceBasho.size ?? 0;
  const decisive = bouts?.decisiveDays ?? 0;

  const generationDelta = Math.abs(agg.firstSeq - playerWindow.firstSeq);
  const sameGeneration = generationDelta <= SAME_GENERATION_WINDOW;

  const kinds: RivalryKind[] = [];
  if (meetings >= FREQUENT_OPPONENT_THRESHOLD) kinds.push("frequentOpponent");
  if (npcWins >= playerWins && meetings >= 2) kinds.push("wall");
  if (npcWins - playerWins >= NEMESIS_DELTA) kinds.push("nemesis");
  if (sameGeneration) kinds.push("sameGeneration");
  if (promotionRace > 0) kinds.push("promotionRace");
  if (titleRace > 0) kinds.push("titleRace");

  const rivalryScore =
    meetings * 10 +
    closeRank * 8 +
    promotionRace * 12 +
    npcWins * 6 +
    decisive * 4 +
    (sameGeneration ? 8 : 0);

  const reasonCodes: string[] = [];
  if (kinds.includes("nemesis")) reasonCodes.push("nemesis");
  if (kinds.includes("wall")) reasonCodes.push("wall");
  if (kinds.includes("frequentOpponent")) reasonCodes.push("frequent");
  if (kinds.includes("promotionRace")) reasonCodes.push("promotionRace");
  if (kinds.includes("titleRace")) reasonCodes.push("titleRace");
  if (kinds.includes("sameGeneration")) reasonCodes.push("sameGeneration");
  // mark close-peak relevance
  if (peak.division === playerMaxDivision) reasonCodes.push("samePeakDivision");

  return {
    id: agg.id,
    shikona: agg.shikona,
    visibilityTier: "notable",
    generationLabel: sameGeneration ? "同期" : undefined,
    peakRankLabel: rankLabelFromRow(peak),
    currentOrFinalRankLabel: rankLabelFromRow(final),
    rivalryScore,
    rivalryKinds: kinds,
    meetings,
    playerWins,
    npcWins,
    firstMetBashoIndex: bouts?.firstMetSeq,
    lastMetBashoIndex: bouts?.lastMetSeq,
    notableReasonCodes: reasonCodes,
  };
};

const buildEraStarSummary = (agg: NpcAggregate): EraStarNpcSummary | null => {
  const dominanceScore =
    agg.yokozunaBasho * 6 +
    agg.ozekiBasho * 4 +
    agg.sanyakuBasho * 2 +
    agg.makuuchiTopHalfBasho * 0.5;
  if (dominanceScore < 4) return null;
  const peak = peakRowOf(agg);
  const reasonCodes: string[] = [];
  if (agg.yokozunaBasho > 0) reasonCodes.push("yokozuna");
  else if (agg.ozekiBasho > 0) reasonCodes.push("ozeki");
  else if (agg.sanyakuBasho > 0) reasonCodes.push("sanyaku");
  if (agg.yushoLikeCount > 0) reasonCodes.push("yusho");
  return {
    id: agg.id,
    shikona: agg.shikona,
    visibilityTier: "eraStar",
    activeFromBashoIndex: agg.firstSeq,
    activeToBashoIndex: agg.lastSeq,
    peakRankLabel: rankLabelFromRow(peak),
    dominanceScore: Math.round(dominanceScore * 10) / 10,
    yushoLikeCount: agg.yushoLikeCount > 0 ? agg.yushoLikeCount : undefined,
    sanyakuBashoCount: agg.sanyakuBasho,
    ozekiOrAboveBashoCount: agg.yokozunaBasho + agg.ozekiBasho,
    notableReasonCodes: reasonCodes,
  };
};

export interface BuildCareerWorldSummaryInput {
  status: RikishiStatus;
  bashoRows: CareerBashoRecordsBySeq[];
  playerBouts: CareerPlayerBoutsByBasho[];
}

export const buildCareerWorldSummary = (
  input: BuildCareerWorldSummaryInput,
): CareerWorldSummary => {
  const { status, bashoRows, playerBouts } = input;
  const rarity = buildCareerRaritySummary(status.history.maxRank);
  const playerWindow = resolvePlayerWindow(bashoRows);
  const empty: CareerWorldSummary = {
    generationPeers: [],
    rivals: [],
    promotionRaceOpponents: [],
    strongestOpponents: [],
    eraStars: [],
    rarity,
  };
  if (!playerWindow) return empty;

  const npcAggregates = aggregateNpcsAcrossBasho(bashoRows);
  const playerBoutAggs = buildPlayerBoutAggregates(
    playerBouts,
    bashoRows,
    playerWindow.entityId,
  );
  const playerMaxDivision = status.history.maxRank.division;

  const candidates: NotableNpcSummary[] = [];
  for (const agg of npcAggregates.values()) {
    const bouts = playerBoutAggs.get(agg.id) ?? null;
    const generationDelta = Math.abs(agg.firstSeq - playerWindow.firstSeq);
    const sameGeneration = generationDelta <= SAME_GENERATION_WINDOW;
    const meetings = bouts?.meetings ?? 0;
    if (meetings === 0 && !sameGeneration) continue;
    const summary = buildNotableSummary(agg, bouts, playerWindow, playerMaxDivision);
    candidates.push(summary);
  }

  const byScore = (a: NotableNpcSummary, b: NotableNpcSummary): number =>
    b.rivalryScore - a.rivalryScore || b.meetings - a.meetings;

  const rivals = candidates
    .filter((c) => c.meetings >= 2)
    .slice()
    .sort(byScore)
    .slice(0, 8);

  const generationPeers = candidates
    .filter(
      (c) =>
        c.rivalryKinds.includes("sameGeneration") &&
        !rivals.some((r) => r.id === c.id),
    )
    .slice()
    .sort(byScore)
    .slice(0, 6);

  const promotionRaceOpponents = candidates
    .filter((c) => c.rivalryKinds.includes("promotionRace"))
    .slice()
    .sort(byScore)
    .slice(0, 6);

  const strongestOpponents = candidates
    .filter((c) => c.meetings >= 1)
    .slice()
    .sort((a, b) => {
      const peakA = a.peakRankLabel ?? "";
      const peakB = b.peakRankLabel ?? "";
      // reuse rivalryScore as fallback; peak division order primary
      return b.rivalryScore - a.rivalryScore || peakA.localeCompare(peakB);
    })
    .slice(0, 6);

  const eraStars: EraStarNpcSummary[] = [];
  for (const agg of npcAggregates.values()) {
    const star = buildEraStarSummary(agg);
    if (star) eraStars.push(star);
  }
  eraStars.sort((a, b) => b.dominanceScore - a.dominanceScore);

  return {
    generationPeers,
    rivals,
    promotionRaceOpponents,
    strongestOpponents,
    eraStars: eraStars.slice(0, 8),
    rarity,
  };
};
