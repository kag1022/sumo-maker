import React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ListOrdered, Swords, Trophy, Users } from "lucide-react";
import { type Division } from "../../../logic/models";
import type { CareerBashoDetail } from "../../../logic/persistence/careerHistory";
import { formatRankDisplayName } from "../../../logic/ranking";
import { WinLossBar } from "../../../shared/ui/WinLossBar";
import type {
  CareerLedgerModel,
  CareerLedgerPoint,
  CareerPlaceSummaryModel,
  CareerPlaceTabId,
} from "../utils/careerResultModel";
import { groupNearbyRanks, listDivisionRows } from "../../shared/utils/banzukeRows";
import { OfficialBoutResultList } from "./OfficialBoutResultList";
import styles from "./CareerPlaceChapter.module.css";
import table from "../../../shared/styles/table.module.css";

interface CareerPlaceChapterProps {
  ledger: CareerLedgerModel;
  point: CareerLedgerPoint | null;
  detail: CareerBashoDetail | null;
  summary: CareerPlaceSummaryModel | null;
  placeTab: CareerPlaceTabId;
  isLoading: boolean;
  hasPersistence: boolean;
  onSelectBasho: (bashoSeq: number) => void;
  onSelectNpc: (entityId: string | null) => void;
  onPlaceTabChange: (tab: CareerPlaceTabId) => void;
}

type BoutResult = "WIN" | "LOSS" | "ABSENT";

const RESULT_MARK: Record<BoutResult, { symbol: string; style: React.CSSProperties }> = {
  WIN: { symbol: "○", style: { color: "var(--chart-win)" } },
  LOSS: { symbol: "●", style: { color: "var(--chart-loss)" } },
  ABSENT: { symbol: "休", style: { color: "var(--chart-absent)" } },
};

const SANSHO_LABEL: Record<string, string> = {
  SHUKUN: "殊勲賞",
  KANTO: "敢闘賞",
  GINO: "技能賞",
  殊勲賞: "殊勲賞",
  敢闘賞: "敢闘賞",
  技能賞: "技能賞",
};

export const CareerPlaceChapter: React.FC<CareerPlaceChapterProps> = ({
  ledger,
  point,
  detail,
  summary,
  placeTab,
  isLoading,
  hasPersistence,
  onSelectBasho,
  onSelectNpc,
  onPlaceTabChange,
}) => {
  const nearbyRows = React.useMemo(() => {
    if (!detail?.rows?.length || !detail.playerRecord) return [];
    return groupNearbyRanks(detail.rows, detail.playerRecord, 3);
  }, [detail]);
  const fullRows = React.useMemo(() => {
    if (!detail?.rows?.length || !detail.playerRecord) return [];
    return listDivisionRows(detail.rows, detail.playerRecord);
  }, [detail]);
  const selectedIndex = React.useMemo(
    () => ledger.points.findIndex((entry) => entry.bashoSeq === point?.bashoSeq),
    [ledger.points, point?.bashoSeq],
  );
  const nearbyPoints = React.useMemo(() => {
    if (selectedIndex < 0) {
      return ledger.points.slice(Math.max(0, ledger.points.length - 8));
    }
    const start = Math.max(0, selectedIndex - 3);
    const end = Math.min(ledger.points.length, selectedIndex + 4);
    return ledger.points.slice(start, end);
  }, [ledger.points, selectedIndex]);
  const previousPoint = selectedIndex > 0 ? ledger.points[selectedIndex - 1] : null;
  const nextPoint = selectedIndex >= 0 && selectedIndex < ledger.points.length - 1 ? ledger.points[selectedIndex + 1] : null;

  const wins = point?.wins ?? 0;
  const losses = point?.losses ?? 0;
  const absent = point?.absent ?? 0;
  const totalDecisions = wins + losses;
  const winRate = totalDecisions > 0 ? wins / totalDecisions : 0;
  const resultTone = wins > losses ? "win" : losses > wins ? "loss" : absent > 0 ? "absence" : "flat";
  const playerTitles = detail?.playerRecord?.titles ?? [];
  const yushoTitles = playerTitles.filter((title) => title === "YUSHO");
  const sanshoTitles = playerTitles
    .map((title) => SANSHO_LABEL[title])
    .filter((title): title is string => Boolean(title));
  const hasYusho = yushoTitles.length > 0;
  const heroTitleText = sanshoTitles.length > 0
    ? `三賞記録: ${sanshoTitles.join(" / ")}`
    : hasYusho
      ? "優勝記録: 優勝"
      : null;
  const activeRows = placeTab === "nearby" ? nearbyRows : fullRows;
  const tabCounts: Record<CareerPlaceTabId, number> = {
    nearby: nearbyRows.length,
    full: fullRows.length,
    bouts: detail?.bouts?.length ?? 0,
  };
  const topImportantNote = detail?.importantTorikumi?.[0]?.summary ?? null;

  return (
    <section className={styles.shell}>
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>場所別</div>
          <h2 className={styles.title}>{summary?.bashoLabel ?? point?.bashoLabel ?? "場所詳細"}</h2>
        </div>
        <div className={styles.stepperGroup}>
          <button
            type="button"
            className={styles.stepper}
            onClick={() => previousPoint && onSelectBasho(previousPoint.bashoSeq)}
            disabled={!previousPoint}
          >
            <ChevronLeft className="h-3.5 w-3.5" />前
          </button>
          <button
            type="button"
            className={styles.stepper}
            onClick={() => nextPoint && onSelectBasho(nextPoint.bashoSeq)}
            disabled={!nextPoint}
          >
            次<ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className={styles.placeHero} data-tone={resultTone} data-yusho={hasYusho}>
        <div className={styles.placeHeroMain}>
          <div className={styles.placeStamp}>
            {hasYusho ? <Trophy className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
          </div>
          <div>
            <span className={styles.placeHeroLabel}>選択中の場所</span>
            <strong className={styles.placeHeroTitle}>{summary?.bashoLabel ?? point?.bashoLabel ?? "場所詳細"}</strong>
            <p className={styles.placeHeroCopy}>
              {heroTitleText
                ? heroTitleText
                : topImportantNote ?? "この場所の番付、成績、周辺力士、十五日間を確認します。"}
            </p>
          </div>
        </div>
        <div className={styles.scoreBoard}>
          <div className={styles.scoreMain}>
            <span>成績</span>
            <strong>{summary?.recordLabel ?? "—"}</strong>
          </div>
          <div className={styles.scoreGrid}>
            <article>
              <span>番付</span>
              <strong>{summary?.rankLabel ?? "—"}</strong>
            </article>
            <article>
              <span>昇降</span>
              <strong>{summary?.deltaLabel ?? "—"}</strong>
            </article>
            <article>
              <span>勝率</span>
              <strong>{totalDecisions > 0 ? `${(winRate * 100).toFixed(1)}%` : "—"}</strong>
            </article>
          </div>
        </div>
        {(wins + losses + absent) > 0 && (
          <div className={styles.heroBar}>
            <WinLossBar wins={wins} losses={losses} absent={absent} height="md" />
          </div>
        )}
        <div className={styles.badgeRow}>
          {hasYusho ? <span className={styles.yushoTag}>優勝</span> : null}
          {(summary?.milestoneTags ?? []).map((tag) => (
            <span key={tag} className={styles.milestoneTag}>{tag}</span>
          ))}
        </div>
      </div>

      <div className={styles.tabStrip} role="tablist" aria-label="場所別切替">
        {(["nearby", "full", "bouts"] as CareerPlaceTabId[]).map((tab) => {
          const LABELS: Record<CareerPlaceTabId, { main: string; sub: string }> = {
            nearby: { main: "近傍番付", sub: "周辺の顔ぶれ" },
            full: { main: "全番付", sub: "同階級の全員" },
            bouts: { main: "全取組", sub: "十五日間" },
          };
          const Icon = tab === "nearby" ? Users : tab === "full" ? ListOrdered : Swords;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={placeTab === tab}
              className={styles.tab}
              data-active={placeTab === tab}
              onClick={() => onPlaceTabChange(tab)}
            >
              <Icon className="h-4 w-4" />
              <span className={styles.tabText}>
                <span className={styles.tabMain}>{LABELS[tab].main}</span>
                <span className={styles.tabSub}>{LABELS[tab].sub} / {tabCounts[tab]}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.placeNavigator}>
        <div className={styles.navigatorHead}>
          <span className={styles.kicker}>前後の場所</span>
          <span>{selectedIndex >= 0 ? `${selectedIndex + 1}/${ledger.points.length}` : "-/-"}</span>
        </div>
        <div className={styles.scrollStrip} role="list" aria-label="場所一覧">
          {nearbyPoints.map((entry) => {
            const isSelected = entry.bashoSeq === point?.bashoSeq;
            const r = RESULT_MARK[entry.wins >= entry.losses + entry.absent ? "WIN" : entry.losses > entry.wins ? "LOSS" : "ABSENT"];
            return (
              <button
                key={entry.bashoSeq}
                type="button"
                role="listitem"
                className={styles.bashoChip}
                data-selected={isSelected}
                data-event={entry.milestoneTags.length > 0}
                data-yusho={entry.eventFlags.includes("yusho")}
                onClick={() => onSelectBasho(entry.bashoSeq)}
              >
                <span className={styles.bashoChipLabel}>{entry.bashoLabel}</span>
                <strong className={styles.bashoChipRank}>{entry.rankShortLabel}</strong>
                <span className={styles.bashoChipRecord} style={r.style}>{entry.recordCompactLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {placeTab === "nearby" || placeTab === "full" ? (
        <div className={styles.contentPanel}>
          <div className={styles.contentHead}>
            <div>
              <span className={styles.kicker}>{placeTab === "nearby" ? "番付周辺" : "同階級番付"}</span>
              <h3>{placeTab === "nearby" ? "本人の周辺だけを見る" : "同階級の全番付を見る"}</h3>
            </div>
            <span>{activeRows.length}名</span>
          </div>
          {isLoading ? (
            <div className={styles.empty}>読込中</div>
          ) : activeRows.length > 0 ? (
            <div className={styles.scroll}>
              <table className={styles.banzukeTable}>
                <thead>
                  <tr>
                    <th>四股名</th>
                    <th>番付</th>
                    <th>成績</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows.map((row) => {
                    const isPlayer = row.entityType === "PLAYER";
                    const resultMark = row.wins > row.losses
                      ? RESULT_MARK.WIN
                      : row.losses > row.wins
                        ? RESULT_MARK.LOSS
                        : RESULT_MARK.ABSENT;
                    return (
                      <tr key={`${row.entityType}-${row.entityId}`} className={isPlayer ? styles.banzukePlayer : undefined}>
                        <td>
                          <span className={styles.banzukeResultDot} style={resultMark.style}>{resultMark.symbol}</span>
                          {row.entityType === "NPC" ? (
                            <button type="button" className={table.linkButton} onClick={() => onSelectNpc(row.entityId)}>
                              {row.shikona}
                            </button>
                          ) : (
                            <span className="font-medium">{row.shikona}</span>
                          )}
                        </td>
                        <td>
                          {formatRankDisplayName({
                            division: row.division as Division,
                            name: row.rankName,
                            number: row.rankNumber ?? undefined,
                            side: row.rankSide ?? undefined,
                            specialStatus: row.rankSpecialStatus,
                          })}
                        </td>
                        <td className="text-right tabular-nums">
                          <span style={{ color: "var(--chart-win)" }}>{row.wins}勝</span>
                          <span style={{ color: "var(--chart-loss)" }}>{row.losses}敗</span>
                          {row.absent > 0 && <span style={{ color: "var(--chart-absent)" }}>{row.absent}休</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>{hasPersistence ? "該当データなし" : "保存後に利用可能"}</div>
          )}
        </div>
      ) : (
        <div className={styles.contentPanel}>
          <div className={styles.contentHead}>
            <div>
              <span className={styles.kicker}>取組日誌</span>
              <h3>十五日間の流れを見る</h3>
            </div>
            <span>{detail?.bouts?.length ?? 0}番</span>
          </div>
          {isLoading ? (
            <div className={styles.empty}>読込中</div>
          ) : detail?.bouts?.length ? (
            <OfficialBoutResultList detail={detail} onSelectNpc={onSelectNpc} />
          ) : (
            <div className={styles.empty}>{hasPersistence ? "取組データなし" : "保存後に利用可能"}</div>
          )}
        </div>
      )}
    </section>
  );
};
