import React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ListOrdered, Swords, Trophy, Users } from "lucide-react";
import { type Division } from "../../../logic/models";
import type { CareerBashoDetail } from "../../../logic/persistence/careerHistory";
import { formatRankDisplayName } from "../../../logic/ranking";
import type { LocaleCode } from "../../../shared/lib/locale";
import { useLocale } from "../../../shared/hooks/useLocale";
import { WinLossBar } from "../../../shared/ui/WinLossBar";
import type {
  CareerLedgerModel,
  CareerLedgerPoint,
  CareerPlaceSummaryModel,
  CareerPlaceTabId,
} from "../utils/careerResultModel";
import { groupNearbyRanks, listDivisionRows } from "../../shared/utils/banzukeRows";
import { resolveStableRelationshipLabel } from "../../shared/utils/stablemateReading";
import { OfficialBoutResultList } from "./OfficialBoutResultList";
import styles from "./CareerPlaceChapter.module.css";
import table from "../../../shared/styles/table.module.css";

interface CareerPlaceChapterProps {
  ledger: CareerLedgerModel;
  point: CareerLedgerPoint | null;
  detail: CareerBashoDetail | null;
  summary: CareerPlaceSummaryModel | null;
  playerStableId: string;
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

const SANSHO_LABEL_EN: Record<string, string> = {
  SHUKUN: "Outstanding Performance Prize",
  KANTO: "Fighting Spirit Prize",
  GINO: "Technique Prize",
  殊勲賞: "Outstanding Performance Prize",
  敢闘賞: "Fighting Spirit Prize",
  技能賞: "Technique Prize",
};

const MILESTONE_LABELS_EN: Record<string, string> = {
  最高位到達: "Peak rank",
  横綱昇進: "Yokozuna promotion",
  新大関: "New Ozeki",
  再大関: "Ozeki return",
  新関脇: "New Sekiwake",
  再関脇: "Sekiwake return",
  新小結: "New Komusubi",
  再小結: "Komusubi return",
  新入幕: "Top division debut",
  再入幕: "Top division return",
  新十両: "Juryo debut",
  再十両: "Juryo return",
  引退前最後: "Final basho",
};

const formatRecordParts = (wins: number, losses: number, absent: number, locale: LocaleCode): React.ReactNode => (
  locale === "en" ? (
    <>
      <span style={{ color: "var(--chart-win)" }}>{wins}W</span>
      <span style={{ color: "var(--chart-loss)" }}>{losses}L</span>
      {absent > 0 && <span style={{ color: "var(--chart-absent)" }}>{absent}A</span>}
    </>
  ) : (
    <>
      <span style={{ color: "var(--chart-win)" }}>{wins}勝</span>
      <span style={{ color: "var(--chart-loss)" }}>{losses}敗</span>
      {absent > 0 && <span style={{ color: "var(--chart-absent)" }}>{absent}休</span>}
    </>
  )
);

const formatMilestoneLabel = (tag: string, locale: LocaleCode): string =>
  locale === "en" ? MILESTONE_LABELS_EN[tag] ?? tag : tag;

const formatAffiliationLabel = (label: string, locale: LocaleCode): string => {
  if (locale !== "en") return label;
  if (label === "同部屋") return "Same stable";
  if (label === "同一門") return "Same ichimon";
  return label;
};

const formatResultSymbol = (result: BoutResult, locale: LocaleCode): string =>
  locale === "en" && result === "ABSENT" ? "A" : RESULT_MARK[result].symbol;

export const CareerPlaceChapter: React.FC<CareerPlaceChapterProps> = ({
  ledger,
  point,
  detail,
  summary,
  playerStableId,
  placeTab,
  isLoading,
  hasPersistence,
  onSelectBasho,
  onSelectNpc,
  onPlaceTabChange,
}) => {
  const { locale } = useLocale();
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
    .map((title) => (locale === "en" ? SANSHO_LABEL_EN[title] : SANSHO_LABEL[title]))
    .filter((title): title is string => Boolean(title));
  const hasYusho = yushoTitles.length > 0;
  const heroTitleText = sanshoTitles.length > 0
    ? (locale === "en" ? `Special prize: ${sanshoTitles.join(" / ")}` : `三賞記録: ${sanshoTitles.join(" / ")}`)
    : hasYusho
      ? (locale === "en" ? "Yusho record: champion" : "優勝記録: 優勝")
      : null;
  const activeRows = placeTab === "nearby" ? nearbyRows : fullRows;
  const tabCounts: Record<CareerPlaceTabId, number> = {
    nearby: nearbyRows.length,
    full: fullRows.length,
    bouts: detail?.bouts?.length ?? 0,
  };
  const topImportantNote = locale === "en"
    ? detail?.importantTorikumi?.[0] ? "A key bout is recorded in this basho." : null
    : detail?.importantTorikumi?.[0]?.summary ?? null;

  return (
    <section className={styles.shell}>
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>{locale === "en" ? "Basho Records" : "場所別"}</div>
          <h2 className={styles.title}>{summary?.bashoLabel ?? point?.bashoLabel ?? (locale === "en" ? "Basho Detail" : "場所詳細")}</h2>
        </div>
        <div className={styles.stepperGroup}>
          <button
            type="button"
            className={styles.stepper}
            onClick={() => previousPoint && onSelectBasho(previousPoint.bashoSeq)}
            disabled={!previousPoint}
          >
            <ChevronLeft className="h-3.5 w-3.5" />{locale === "en" ? "Prev" : "前"}
          </button>
          <button
            type="button"
            className={styles.stepper}
            onClick={() => nextPoint && onSelectBasho(nextPoint.bashoSeq)}
            disabled={!nextPoint}
          >
            {locale === "en" ? "Next" : "次"}<ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className={styles.placeHero} data-tone={resultTone} data-yusho={hasYusho}>
        <div className={styles.placeHeroMain}>
          <div className={styles.placeStamp}>
            {hasYusho ? <Trophy className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
          </div>
          <div>
            <span className={styles.placeHeroLabel}>{locale === "en" ? "Selected Basho" : "選択中の場所"}</span>
            <strong className={styles.placeHeroTitle}>{summary?.bashoLabel ?? point?.bashoLabel ?? (locale === "en" ? "Basho Detail" : "場所詳細")}</strong>
            <p className={styles.placeHeroCopy}>
              {heroTitleText
                ? heroTitleText
                : topImportantNote ?? (locale === "en" ? "Inspect the rank, record, nearby rikishi, and full fifteen-day log for this basho." : "この場所の番付、成績、周辺力士、十五日間を確認します。")}
            </p>
          </div>
        </div>
        <div className={styles.scoreBoard}>
          <div className={styles.scoreMain}>
            <span>{locale === "en" ? "Record" : "成績"}</span>
            <strong>{summary?.recordLabel ?? "—"}</strong>
          </div>
          <div className={styles.scoreGrid}>
            <article>
              <span>{locale === "en" ? "Rank" : "番付"}</span>
              <strong>{summary?.rankLabel ?? "—"}</strong>
            </article>
            <article>
              <span>{locale === "en" ? "Movement" : "昇降"}</span>
              <strong>{summary?.deltaLabel ?? "—"}</strong>
            </article>
            <article>
              <span>{locale === "en" ? "Win Rate" : "勝率"}</span>
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
          {hasYusho ? <span className={styles.yushoTag}>{locale === "en" ? "Yusho" : "優勝"}</span> : null}
          {(summary?.milestoneTags ?? []).map((tag) => (
            <span key={tag} className={styles.milestoneTag}>{formatMilestoneLabel(tag, locale)}</span>
          ))}
        </div>
      </div>

      <div className={styles.tabStrip} role="tablist" aria-label={locale === "en" ? "Basho record tabs" : "場所別切替"}>
        {(["nearby", "full", "bouts"] as CareerPlaceTabId[]).map((tab) => {
          const LABELS: Record<CareerPlaceTabId, { main: string; sub: string }> = {
            nearby: locale === "en" ? { main: "Nearby", sub: "Around this rank" } : { main: "近傍番付", sub: "周辺の顔ぶれ" },
            full: locale === "en" ? { main: "Full Banzuke", sub: "Same division" } : { main: "全番付", sub: "同階級の全員" },
            bouts: locale === "en" ? { main: "All Bouts", sub: "Fifteen days" } : { main: "全取組", sub: "十五日間" },
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
          <span className={styles.kicker}>{locale === "en" ? "Adjacent Basho" : "前後の場所"}</span>
          <span>{selectedIndex >= 0 ? `${selectedIndex + 1}/${ledger.points.length}` : "-/-"}</span>
        </div>
        <div className={styles.scrollStrip} role="list" aria-label={locale === "en" ? "Basho list" : "場所一覧"}>
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
              <span className={styles.kicker}>{placeTab === "nearby" ? (locale === "en" ? "Nearby Banzuke" : "番付周辺") : (locale === "en" ? "Division Banzuke" : "同階級番付")}</span>
              <h3>{placeTab === "nearby" ? (locale === "en" ? "View the ranks around this rikishi" : "本人の周辺だけを見る") : (locale === "en" ? "View all rikishi in the same division" : "同階級の全番付を見る")}</h3>
            </div>
            <span>{locale === "en" ? `${activeRows.length} rikishi` : `${activeRows.length}名`}</span>
          </div>
          {isLoading ? (
            <div className={styles.empty}>{locale === "en" ? "Loading" : "読込中"}</div>
          ) : activeRows.length > 0 ? (
            <div className={styles.scroll}>
              <table className={styles.banzukeTable}>
                <thead>
                  <tr>
                    <th>{locale === "en" ? "Shikona" : "四股名"}</th>
                    <th>{locale === "en" ? "Rank" : "番付"}</th>
                    <th>{locale === "en" ? "Record" : "成績"}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows.map((row) => {
                    const isPlayer = row.entityType === "PLAYER";
                    const affiliationLabel = isPlayer ? undefined : resolveStableRelationshipLabel(row, playerStableId);
                    const result: BoutResult = row.wins > row.losses
                      ? "WIN"
                      : row.losses > row.wins
                        ? "LOSS"
                        : "ABSENT";
                    const resultMark = RESULT_MARK[result];
                    return (
                      <tr key={`${row.entityType}-${row.entityId}`} className={isPlayer ? styles.banzukePlayer : undefined}>
                        <td>
                          <span className={styles.banzukeResultDot} style={resultMark.style}>{formatResultSymbol(result, locale)}</span>
                          {row.entityType === "NPC" ? (
                            <span className={styles.banzukeNameCell}>
                              <button type="button" className={table.linkButton} onClick={() => onSelectNpc(row.entityId)}>
                                {row.shikona}
                              </button>
                              {affiliationLabel ? (
                                <span className={styles.affiliationBadge} data-same-stable={affiliationLabel === "同部屋"}>
                                  {formatAffiliationLabel(affiliationLabel, locale)}
                                </span>
                              ) : null}
                            </span>
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
                          }, locale)}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatRecordParts(row.wins, row.losses, row.absent, locale)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>{hasPersistence ? (locale === "en" ? "No matching data" : "該当データなし") : (locale === "en" ? "Available after saving" : "保存後に利用可能")}</div>
          )}
        </div>
      ) : (
        <div className={styles.contentPanel}>
          <div className={styles.contentHead}>
            <div>
              <span className={styles.kicker}>{locale === "en" ? "Bout Log" : "取組日誌"}</span>
              <h3>{locale === "en" ? "Read the fifteen-day flow" : "十五日間の流れを見る"}</h3>
            </div>
            <span>{locale === "en" ? `${detail?.bouts?.length ?? 0} bouts` : `${detail?.bouts?.length ?? 0}番`}</span>
          </div>
          {isLoading ? (
            <div className={styles.empty}>{locale === "en" ? "Loading" : "読込中"}</div>
          ) : detail?.bouts?.length ? (
            <OfficialBoutResultList detail={detail} onSelectNpc={onSelectNpc} />
          ) : (
            <div className={styles.empty}>{hasPersistence ? (locale === "en" ? "No bout data" : "取組データなし") : (locale === "en" ? "Available after saving" : "保存後に利用可能")}</div>
          )}
        </div>
      )}
    </section>
  );
};
