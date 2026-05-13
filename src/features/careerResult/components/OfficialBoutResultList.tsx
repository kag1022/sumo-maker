import React from "react";
import { type Division } from "../../../logic/models";
import type { CareerBashoDetail } from "../../../logic/persistence/careerHistory";
import type { BashoRecordRow, ImportantTorikumiRow } from "../../../logic/persistence/db";
import { formatRankDisplayName } from "../../../logic/ranking";
import styles from "./OfficialBoutResultList.module.css";

type BoutResult = "WIN" | "LOSS" | "ABSENT";
type RankSide = "East" | "West";
type ResultTone = "win" | "loss" | "absence" | "muted";

interface OfficialBoutResultListProps {
  detail: CareerBashoDetail;
  onSelectNpc: (entityId: string | null) => void;
}

interface ParticipantCell {
  role: "player" | "opponent";
  shikona: string;
  rankLabel: string | null;
  recordLabel: string | null;
  entityId: string | null;
  mark: string;
  tone: ResultTone;
}

interface OfficialBoutRow {
  day: number;
  east: ParticipantCell;
  west: ParticipantCell;
  kimarite: string;
  importantNote: ImportantTorikumiRow | null;
  importantLabel: string | null;
  isFallbackPlacement: boolean;
  isAbsence: boolean;
}

const PLAYER_ID = "PLAYER";

const RESULT_MARK: Record<BoutResult, { player: string; opponent: string; playerTone: ResultTone; opponentTone: ResultTone }> = {
  WIN: { player: "○", opponent: "●", playerTone: "win", opponentTone: "loss" },
  LOSS: { player: "●", opponent: "○", playerTone: "loss", opponentTone: "win" },
  ABSENT: { player: "休", opponent: "－", playerTone: "absence", opponentTone: "muted" },
};

const IMPORTANT_LABELS: Record<ImportantTorikumiRow["trigger"], string> = {
  YUSHO_RACE: "優勝争い",
  YUSHO_DIRECT: "優勝争い",
  YUSHO_PURSUIT: "優勝争い",
  JOI_DUTY: "上位戦",
  JOI_ASSIGNMENT: "上位戦",
  SEKITORI_BOUNDARY: "関取境界",
  JURYO_BOUNDARY: "関取境界",
  CROSS_DIVISION_EVAL: "越境戦",
  LOWER_BOUNDARY: "段境界",
  LATE_RELAXATION: "編成修復",
};

const formatRecordLabel = (row: Pick<BashoRecordRow, "wins" | "losses" | "absent"> | undefined): string | null => {
  if (!row) return null;
  return `${row.wins}勝${row.losses}敗${row.absent > 0 ? `${row.absent}休` : ""}`;
};

const formatRankFromRow = (row: BashoRecordRow): string =>
  formatRankDisplayName({
    division: row.division as Division,
    name: row.rankName,
    number: row.rankNumber ?? undefined,
    side: row.rankSide ?? undefined,
    specialStatus: row.rankSpecialStatus,
  });

const formatOpponentRank = (
  detail: CareerBashoDetail,
  opponentRecord: BashoRecordRow | undefined,
  opponentRankName: string | undefined,
  opponentRankNumber: number | undefined,
  opponentRankSide: RankSide | undefined,
): string | null => {
  if (opponentRecord) return formatRankFromRow(opponentRecord);
  if (!opponentRankName) return null;

  return formatRankDisplayName({
    division: (detail.playerRecord?.division ?? "Makuuchi") as Division,
    name: opponentRankName,
    number: opponentRankNumber ?? undefined,
    side: opponentRankSide ?? undefined,
  });
};

const buildRecordLookup = (rows: BashoRecordRow[]): {
  byId: Map<string, BashoRecordRow>;
  byShikona: Map<string, BashoRecordRow>;
} => {
  const byId = new Map<string, BashoRecordRow>();
  const byShikona = new Map<string, BashoRecordRow>();

  rows.forEach((row) => {
    if (row.entityType === "NPC") {
      byId.set(row.entityId, row);
      byShikona.set(row.shikona, row);
    }
  });

  return { byId, byShikona };
};

const findOpponentRecord = (
  lookup: ReturnType<typeof buildRecordLookup>,
  opponentId: string | undefined,
  opponentShikona: string | undefined,
): BashoRecordRow | undefined => {
  if (opponentId) {
    const byId = lookup.byId.get(opponentId);
    if (byId) return byId;
  }
  return opponentShikona ? lookup.byShikona.get(opponentShikona) : undefined;
};

const buildOfficialRows = (detail: CareerBashoDetail): OfficialBoutRow[] => {
  const playerRecord = detail.playerRecord;
  const lookup = buildRecordLookup(detail.rows);
  const importantByDay = new Map(detail.importantTorikumi.map((note) => [note.day, note]));

  return detail.bouts.map((bout) => {
    const result = (bout.result ?? "ABSENT") as BoutResult;
    const resultMark = RESULT_MARK[result] ?? RESULT_MARK.ABSENT;
    const opponentRecord = findOpponentRecord(lookup, bout.opponentId, bout.opponentShikona);
    const playerSide = playerRecord?.rankSide;
    const opponentSide = bout.opponentRankSide ?? opponentRecord?.rankSide;
    const canPlaceBySide = Boolean(playerSide && opponentSide && playerSide !== opponentSide);
    const importantNote = importantByDay.get(bout.day) ?? null;

    const playerCell: ParticipantCell = {
      role: "player",
      shikona: playerRecord?.shikona ?? "本人",
      rankLabel: playerRecord ? formatRankFromRow(playerRecord) : null,
      recordLabel: formatRecordLabel(playerRecord),
      entityId: PLAYER_ID,
      mark: resultMark.player,
      tone: resultMark.playerTone,
    };
    const opponentCell: ParticipantCell = {
      role: "opponent",
      shikona: bout.opponentShikona ?? (result === "ABSENT" ? "取組なし" : "記録未詳"),
      rankLabel: formatOpponentRank(
        detail,
        opponentRecord,
        bout.opponentRankName,
        bout.opponentRankNumber,
        opponentSide,
      ),
      recordLabel: formatRecordLabel(opponentRecord),
      entityId: bout.opponentId ?? null,
      mark: resultMark.opponent,
      tone: resultMark.opponentTone,
    };

    const east = canPlaceBySide && playerSide === "West" ? opponentCell : playerCell;
    const west = canPlaceBySide && playerSide === "West" ? playerCell : opponentCell;

    return {
      day: bout.day,
      east,
      west,
      kimarite: bout.kimarite ?? (result === "ABSENT" ? "休場" : "決まり手未詳"),
      importantNote,
      importantLabel: importantNote ? IMPORTANT_LABELS[importantNote.trigger] : null,
      isFallbackPlacement: !canPlaceBySide,
      isAbsence: result === "ABSENT",
    };
  });
};

const WrestlerName: React.FC<{
  cell: ParticipantCell;
  align: "east" | "west";
  onSelectNpc: (entityId: string | null) => void;
}> = ({ cell, align, onSelectNpc }) => (
  <div className={styles.wrestlerName} data-align={align} data-player={cell.role === "player"}>
    {cell.entityId && cell.role === "opponent" ? (
      <button type="button" className={styles.wrestlerButton} onClick={() => onSelectNpc(cell.entityId)}>
        {cell.shikona}
      </button>
    ) : (
      <strong>{cell.shikona}</strong>
    )}
    {cell.rankLabel ? <span>{cell.rankLabel}</span> : null}
  </div>
);

const ResultCell: React.FC<{ cell: ParticipantCell; align: "east" | "west" }> = ({ cell, align }) => (
  <div className={styles.resultCell} data-align={align} data-tone={cell.tone}>
    <strong>{cell.mark}</strong>
    {cell.recordLabel ? <span>{cell.recordLabel}</span> : null}
  </div>
);

export const OfficialBoutResultList: React.FC<OfficialBoutResultListProps> = ({
  detail,
  onSelectNpc,
}) => {
  const rows = React.useMemo(() => buildOfficialRows(detail), [detail]);

  return (
    <div className={styles.shell}>
      <div className={styles.header} aria-hidden="true">
        <span>日</span>
        <span>東力士</span>
        <span>東星取</span>
        <span>決まり手</span>
        <span>西星取</span>
        <span>西力士</span>
      </div>
      <div className={styles.list}>
        {rows.map((row) => (
          <article
            key={`${row.day}-${row.east.shikona}-${row.west.shikona}-${row.kimarite}`}
            className={styles.row}
            data-important={Boolean(row.importantNote)}
            data-fallback={row.isFallbackPlacement}
            data-absence={row.isAbsence}
          >
            <div className={styles.day}>
              <strong>{row.day}</strong>
              <span>日</span>
            </div>
            <WrestlerName cell={row.east} align="east" onSelectNpc={onSelectNpc} />
            <ResultCell cell={row.east} align="east" />
            <div className={styles.kimarite}>
              <span>{row.kimarite}</span>
            </div>
            <ResultCell cell={row.west} align="west" />
            <WrestlerName cell={row.west} align="west" onSelectNpc={onSelectNpc} />
            {row.importantNote ? (
              <div className={styles.detailPanel}>
                <span className={styles.importantTag}>{row.importantLabel}</span>
                <p>{row.importantNote.summary}</p>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
};
