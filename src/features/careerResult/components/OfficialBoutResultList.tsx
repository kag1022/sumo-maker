import React from "react";
import { type Division, type Rank } from "../../../logic/models";
import type { CareerBashoDetail } from "../../../logic/persistence/careerHistory";
import { formatRankDisplayName } from "../../../logic/ranking";
import type { LocaleCode } from "../../../shared/lib/locale";
import { useLocale } from "../../../shared/hooks/useLocale";
import { BoutExplanationPanel } from "../../shared/components/BoutExplanationPanel";
import styles from "./OfficialBoutResultList.module.css";

type BoutResult = "WIN" | "LOSS" | "ABSENT";
type RankSide = "East" | "West";
type ResultTone = "win" | "loss" | "absence" | "muted";
type BashoRecordItem = CareerBashoDetail["rows"][number];
type ImportantTorikumiItem = CareerBashoDetail["importantTorikumi"][number];

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
  bout: CareerBashoDetail["bouts"][number];
  east: ParticipantCell;
  west: ParticipantCell;
  kimarite: string;
  importantNote: ImportantTorikumiItem | null;
  importantLabel: string | null;
  isFallbackPlacement: boolean;
  isAbsence: boolean;
}

const RESULT_MARK: Record<BoutResult, { player: string; opponent: string; playerTone: ResultTone; opponentTone: ResultTone }> = {
  WIN: { player: "○", opponent: "●", playerTone: "win", opponentTone: "loss" },
  LOSS: { player: "●", opponent: "○", playerTone: "loss", opponentTone: "win" },
  ABSENT: { player: "休", opponent: "－", playerTone: "absence", opponentTone: "muted" },
};

const IMPORTANT_LABELS: Record<ImportantTorikumiItem["trigger"], string> = {
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

const IMPORTANT_LABELS_EN: Record<ImportantTorikumiItem["trigger"], string> = {
  YUSHO_RACE: "Yusho race",
  YUSHO_DIRECT: "Yusho race",
  YUSHO_PURSUIT: "Yusho race",
  JOI_DUTY: "Upper-rank duty",
  JOI_ASSIGNMENT: "Upper-rank bout",
  SEKITORI_BOUNDARY: "Sekitori boundary",
  JURYO_BOUNDARY: "Sekitori boundary",
  CROSS_DIVISION_EVAL: "Cross-division test",
  LOWER_BOUNDARY: "Division boundary",
  LATE_RELAXATION: "Schedule repair",
};

const formatRecordLabel = (
  row: Pick<BashoRecordItem, "wins" | "losses" | "absent"> | undefined,
  locale: LocaleCode,
): string | null => {
  if (!row) return null;
  return locale === "en"
    ? `${row.wins}-${row.losses}${row.absent > 0 ? `, ${row.absent} absences` : ""}`
    : `${row.wins}勝${row.losses}敗${row.absent > 0 ? `${row.absent}休` : ""}`;
};

const formatRankFromRow = (row: BashoRecordItem, locale: LocaleCode): string =>
  formatRankDisplayName({
    division: row.division as Division,
    name: row.rankName,
    number: row.rankNumber ?? undefined,
    side: row.rankSide ?? undefined,
    specialStatus: row.rankSpecialStatus,
  }, locale);

const formatOpponentRank = (
  detail: CareerBashoDetail,
  opponentRecord: BashoRecordItem | undefined,
  opponentRankName: string | undefined,
  opponentRankNumber: number | undefined,
  opponentRankSide: RankSide | undefined,
  locale: LocaleCode,
): string | null => {
  if (opponentRecord) return formatRankFromRow(opponentRecord, locale);
  if (!opponentRankName) return null;

  return formatRankDisplayName({
    division: (detail.playerRecord?.division ?? "Makuuchi") as Division,
    name: opponentRankName,
    number: opponentRankNumber ?? undefined,
    side: opponentRankSide ?? undefined,
  }, locale);
};

const buildRecordLookup = (rows: BashoRecordItem[]): {
  byId: Map<string, BashoRecordItem>;
  byShikona: Map<string, BashoRecordItem>;
} => {
  const byId = new Map<string, BashoRecordItem>();
  const byShikona = new Map<string, BashoRecordItem>();

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
): BashoRecordItem | undefined => {
  if (opponentId) {
    const byId = lookup.byId.get(opponentId);
    if (byId) return byId;
  }
  return opponentShikona ? lookup.byShikona.get(opponentShikona) : undefined;
};

const buildOfficialRows = (detail: CareerBashoDetail, locale: LocaleCode): OfficialBoutRow[] => {
  const playerRecord = detail.playerRecord;
  const lookup = buildRecordLookup(detail.rows);
  const importantByDay = new Map(detail.importantTorikumi.map((note) => [note.day, note]));

  return detail.bouts.map((bout) => {
    const result = (bout.result ?? "ABSENT") as BoutResult;
    const resultMark = locale === "en" && result === "ABSENT"
      ? { player: "A", opponent: "-", playerTone: "absence" as const, opponentTone: "muted" as const }
      : RESULT_MARK[result] ?? RESULT_MARK.ABSENT;
    const opponentRecord = findOpponentRecord(lookup, bout.opponentId, bout.opponentShikona);
    const playerSide = playerRecord?.rankSide;
    const opponentSide = bout.opponentRankSide ?? opponentRecord?.rankSide;
    const canPlaceBySide = Boolean(playerSide && opponentSide && playerSide !== opponentSide);
    const importantNote = importantByDay.get(bout.day) ?? null;

    const playerCell: ParticipantCell = {
      role: "player",
      shikona: playerRecord?.shikona ?? (locale === "en" ? "Player" : "本人"),
      rankLabel: playerRecord ? formatRankFromRow(playerRecord, locale) : null,
      recordLabel: formatRecordLabel(playerRecord, locale),
      entityId: null,
      mark: resultMark.player,
      tone: resultMark.playerTone,
    };
    const opponentCell: ParticipantCell = {
      role: "opponent",
      shikona: bout.opponentShikona ?? (locale === "en" ? "Unknown record" : "記録未詳"),
      rankLabel: formatOpponentRank(
        detail,
        opponentRecord,
        bout.opponentRankName,
        bout.opponentRankNumber,
        opponentSide,
        locale,
      ),
      recordLabel: formatRecordLabel(opponentRecord, locale),
      entityId: bout.opponentId ?? null,
      mark: resultMark.opponent,
      tone: resultMark.opponentTone,
    };

    const east = canPlaceBySide && playerSide === "West" ? opponentCell : playerCell;
    const west = canPlaceBySide && playerSide === "West" ? playerCell : opponentCell;

    return {
      day: bout.day,
      bout,
      east,
      west,
      kimarite: bout.kimarite ?? (result === "ABSENT" ? (locale === "en" ? "Absence" : "休場") : (locale === "en" ? "Unknown kimarite" : "決まり手未詳")),
      importantNote,
      importantLabel: importantNote ? (locale === "en" ? IMPORTANT_LABELS_EN[importantNote.trigger] : IMPORTANT_LABELS[importantNote.trigger]) : null,
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

const resolvePlayerRank = (
  playerRecord: CareerBashoDetail["playerRecord"],
): Rank | null => {
  if (!playerRecord) return null;
  return {
    division: playerRecord.division as Rank["division"],
    name: playerRecord.rankName,
    number: playerRecord.rankNumber,
    side: playerRecord.rankSide,
    specialStatus: playerRecord.rankSpecialStatus,
  };
};

export const OfficialBoutResultList: React.FC<OfficialBoutResultListProps> = ({
  detail,
  onSelectNpc,
}) => {
  const { locale } = useLocale();
  const rows = React.useMemo(() => buildOfficialRows(detail, locale), [detail, locale]);
  const playerRank = React.useMemo(() => resolvePlayerRank(detail.playerRecord), [detail.playerRecord]);
  const [selectedExplanationDay, setSelectedExplanationDay] = React.useState<number | null>(null);

  return (
    <div className={styles.shell}>
      <div className={styles.header} aria-hidden="true">
        <span>{locale === "en" ? "Day" : "日"}</span>
        <span>{locale === "en" ? "East" : "東力士"}</span>
        <span>{locale === "en" ? "East Final" : "東最終成績"}</span>
        <span>{locale === "en" ? "Kimarite" : "決まり手"}</span>
        <span>{locale === "en" ? "West Final" : "西最終成績"}</span>
        <span>{locale === "en" ? "West" : "西力士"}</span>
      </div>
      <div className={styles.list}>
        {rows.map((row) => {
          const commentary = row.bout.boutFlowCommentary;
          const canShowExplanation = Boolean(commentary && playerRank && detail.playerRecord);
          const isExplanationOpen = selectedExplanationDay === row.day;
          return (
            <article
              key={`${row.day}-${row.east.shikona}-${row.west.shikona}-${row.kimarite}`}
              className={styles.row}
              data-important={Boolean(row.importantNote)}
              data-fallback={row.isFallbackPlacement}
              data-absence={row.isAbsence}
              data-explanation={canShowExplanation}
            >
              <div className={styles.day}>
                <strong>{row.day}</strong>
                <span>{locale === "en" ? "Day" : "日"}</span>
              </div>
              {row.isAbsence ? (
                <div className={styles.absencePanel}>
                  <strong>{locale === "en" ? "No bout because of absence" : "休場により取組なし"}</strong>
                  <span>
                    {row.east.shikona}
                    {row.east.recordLabel ? ` / ${locale === "en" ? "Final record" : "最終成績"} ${row.east.recordLabel}` : ""}
                  </span>
                </div>
              ) : (
                <>
                  <WrestlerName cell={row.east} align="east" onSelectNpc={onSelectNpc} />
                  <ResultCell cell={row.east} align="east" />
                  <div className={styles.kimarite}>
                    <span>{row.kimarite}</span>
                    {canShowExplanation ? (
                      <button
                        type="button"
                        className={styles.explanationButton}
                        aria-expanded={isExplanationOpen}
                        aria-label={locale === "en" ? `${isExplanationOpen ? "Close" : "Open"} day ${row.day} bout commentary` : `${row.day}日目の取組解説を${isExplanationOpen ? "閉じる" : "開く"}`}
                        onClick={() => setSelectedExplanationDay((current) => current === row.day ? null : row.day)}
                      >
                        {isExplanationOpen ? (locale === "en" ? "Close" : "閉じる") : (locale === "en" ? "Commentary" : "取組解説")}
                      </button>
                    ) : null}
                  </div>
                  <ResultCell cell={row.west} align="west" />
                  <WrestlerName cell={row.west} align="west" onSelectNpc={onSelectNpc} />
                </>
              )}
              {row.importantNote ? (
                <div className={styles.detailPanel}>
                  <span className={styles.importantTag}>{row.importantLabel}</span>
                  <p>{locale === "en" ? "This bout is marked as important in the saved basho record." : row.importantNote.summary}</p>
                </div>
              ) : null}
              {canShowExplanation && isExplanationOpen && commentary && playerRank && detail.playerRecord ? (
                <div className={styles.explanationPanel}>
                  <BoutExplanationPanel
                    preview={{
                      bashoSeq: detail.bashoSeq,
                      day: row.day,
                      commentary,
                    }}
                    bout={row.bout}
                    playerShikona={detail.playerRecord.shikona}
                    playerRank={playerRank}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
};
