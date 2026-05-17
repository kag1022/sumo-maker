import React from "react";
import type { RikishiStatus } from "../../../logic/models";
import { formatBashoLabel } from "../../../logic/bashoLabels";
import { listCareerPlayerBoutsByBasho } from "../../../logic/persistence/careerHistory";
import type { BashoRecordRow } from "../../../logic/persistence/db";
import type {
  CareerBashoRecordsBySeq,
  CareerPlayerBoutsByBasho,
} from "../../../logic/persistence/shared";
import { formatRankDisplayName, getRankValueForChart } from "../../../logic/ranking";
import { useLocale } from "../../../shared/hooks/useLocale";
import type { LocaleCode } from "../../../shared/lib/locale";
import {
  buildCareerWorldSummary,
  buildCareerWorldNarrative,
  formatCareerPosition,
  formatDominanceLabel,
  formatEraStarYushoNote,
  formatRivalDescription,
  selectKeyNpcCards,
  buildRivalViewModels,
  buildPeerSections,
  buildEraStarViewModels,
  type CareerWorldSummary,
  type NotableNpcSummary,
  type EraStarNpcSummary,
} from "../utils/careerResultModel";
import styles from "./CareerWorldSection.module.css";

interface CareerWorldSectionProps {
  status: RikishiStatus;
  careerId: string | null;
  bashoRows: CareerBashoRecordsBySeq[];
  isRetired?: boolean;
}

const emptyRivalsCopy = (isRetired: boolean, locale: LocaleCode): string => {
  if (locale === "en") {
    return isRetired
      ? "No opponent stood out strongly in the preserved record."
      : "No strongly memorable opponent has emerged in this career yet.";
  }
  return isRetired
    ? "記録上、強く印象に残る対戦相手は確認できなかった。"
    : "このキャリアでは、強く印象に残る対戦相手はまだ現れていない。";
};

const emptyPeersCopy = (isRetired: boolean, locale: LocaleCode): string => {
  if (locale === "en") {
    return isRetired
      ? "No same-generation rikishi stood out strongly in the preserved record."
      : "Same-generation records are still thin, but relationships may emerge later in the career.";
  }
  return isRetired
    ? "記録上、強く印象に残る同世代の力士は確認できなかった。"
    : "同世代力士の記録は少ないが、今後のキャリアで関係性が生まれる可能性がある。";
};

const emptyEraStarsCopy = (locale: LocaleCode): string =>
  locale === "en"
    ? "Upper-rank records from this career period were limited."
    : "このキャリア期間中、上位番付で目立った力士の記録は限定的だった。";

const formatPersonCount = (count: number, locale: LocaleCode): string =>
  locale === "en" ? `${count} rikishi` : `${count}人`;

const formatItemCount = (count: number, locale: LocaleCode): string =>
  locale === "en" ? `${count} ${count === 1 ? "item" : "items"}` : `${count}件`;

const formatMoreCount = (count: number, locale: LocaleCode): string =>
  locale === "en" ? `${count} more` : `ほか ${count}人`;

const localizeRankLabel = (label: string | undefined | null, locale: LocaleCode): string => {
  if (!label) return locale === "en" ? "Banzuke record" : "";
  if (locale === "ja") return label;
  const replacements: Array<[RegExp, string]> = [
    [/^東?西?横綱/, "Yokozuna"],
    [/^東?西?大関/, "Ozeki"],
    [/^東?西?関脇/, "Sekiwake"],
    [/^東?西?小結/, "Komusubi"],
    [/^東?西?前頭/, "Maegashira"],
    [/^東?西?十両/, "Juryo"],
    [/^東?西?幕下/, "Makushita"],
    [/^東?西?三段目/, "Sandanme"],
    [/^東?西?序二段/, "Jonidan"],
    [/^東?西?序ノ口/, "Jonokuchi"],
    [/^東?西?序/, "Jonokuchi"],
    [/^三役/, "Sanyaku"],
    [/^下位/, "Lower division"],
    [/^不明/, "Unknown"],
  ];
  let next = label;
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(next)) {
      next = next.replace(pattern, replacement);
      break;
    }
  }
  return next
    .replace(/筆頭/g, "1")
    .replace(/枚目/g, "")
    .replace(/(Yokozuna|Ozeki|Sekiwake|Komusubi|Maegashira|Juryo|Makushita|Sandanme|Jonidan|Jonokuchi)(\d+)/g, "$1 $2");
};

const localizePeakRankMeta = (rankLabel: string | undefined, locale: LocaleCode): string =>
  rankLabel
    ? locale === "en"
      ? `Peak ${localizeRankLabel(rankLabel, locale)}`
      : `最高位 ${rankLabel}`
    : locale === "en"
      ? "Banzuke record"
      : "番付記録あり";

interface RelationItem {
  id: string;
  name: string;
  meta: string;
  description: string;
}

type RelationNodeSlot = "mapNorthWest" | "mapNorthEast" | "mapSouthWest" | "mapSouthEast";
type RelationNodeTone = "rival" | "race" | "peer" | "era" | "strong";

interface RelationNodeRecord {
  wins: number;
  losses: number;
  meetings: number;
}

interface RelationMapNode {
  id: string;
  role: string;
  name: string;
  meta: string;
  tone: RelationNodeTone;
  slot: RelationNodeSlot;
  tier: RankTierMeta;
  record?: RelationNodeRecord;
}

interface RelationScaleItem {
  key: string;
  label: string;
  count: number;
  note: string;
}

interface OpponentRecordItem {
  id: string;
  name: string;
  recordLabel: string;
  wins: number;
  losses: number;
  meetings: number;
}

interface HierarchyItem {
  id: string;
  name: string;
  meta: string;
  isPlayer?: boolean;
  tier?: RankTierMeta;
  record?: RelationNodeRecord;
}

interface HierarchyTier {
  key: string;
  label: string;
  note: string;
  positionBadge?: RelativePosition;
  items: HierarchyItem[];
}

type EraPowerKey = "yokozuna" | "ozeki" | "sanyaku" | "makuuchiTop" | "juryoWall";

interface EraPowerItem {
  key: EraPowerKey;
  label: string;
  shortLabel: string;
  count: number;
  average: number;
  note: string;
}

interface PeerDistributionBin {
  key: RankTierKey;
  label: string;
  count: number;
  isPlayerTier: boolean;
}

interface PeerDistributionModel {
  bins: PeerDistributionBin[];
  playerTier: RankTierMeta;
  total: number;
  rankText: string;
}

interface CareerTimelineEvent {
  key: string;
  label: string;
  bashoLabel: string;
  ageLabel: string;
  rankLabel: string;
  context: string;
  tone: "entry" | "promotion" | "peak" | "exit";
}

interface WallNetworkNode {
  key: string;
  label: string;
  name: string;
  meta: string;
  note: string;
  tone: RelationNodeTone;
}

interface ChapterSectionProps {
  title: string;
  lead: string;
  children: React.ReactNode;
}

interface DetailChapterSectionProps extends ChapterSectionProps {
  summary: string;
}

interface RelationGroupProps {
  title: string;
  lead?: string;
  count: number;
  items: RelationItem[];
  emptyCopy: string;
  locale: LocaleCode;
}

const RELATION_PREVIEW_LIMIT = 5;
const SECONDARY_PREVIEW_LIMIT = 4;
const RELATION_NODE_SLOTS: RelationNodeSlot[] = [
  "mapNorthWest",
  "mapNorthEast",
  "mapSouthWest",
  "mapSouthEast",
];

type RankTierKey =
  | "yokozuna"
  | "ozeki"
  | "sanyaku"
  | "maegashira"
  | "juryo"
  | "makushita"
  | "lower"
  | "unknown";

interface RankTierMeta {
  key: RankTierKey;
  level: number;
  symbol: string;
  shortLabel: string;
}

const rankTierLevelMap: Record<RankTierKey, number> = {
  yokozuna: 6,
  ozeki: 5,
  sanyaku: 4,
  maegashira: 3,
  juryo: 2,
  makushita: 1,
  lower: 0,
  unknown: -1,
};

const createRankTierMeta = (key: RankTierKey, locale: LocaleCode): RankTierMeta => ({
  key,
  level: rankTierLevelMap[key],
  symbol: rankTierSymbol(key, locale),
  shortLabel: rankTierLabel(key, locale),
});

const resolveRankTier = (label?: string | null, locale: LocaleCode = "ja"): RankTierMeta => {
  if (!label) return createRankTierMeta("unknown", locale);
  const normalized = label.toLowerCase();
  if (label.startsWith("横綱") || normalized.startsWith("yokozuna")) return createRankTierMeta("yokozuna", locale);
  if (label.startsWith("大関") || normalized.startsWith("ozeki")) return createRankTierMeta("ozeki", locale);
  if (
    label.startsWith("関脇") ||
    label.startsWith("小結") ||
    normalized.startsWith("sekiwake") ||
    normalized.startsWith("komusubi") ||
    normalized.startsWith("sanyaku")
  ) {
    return createRankTierMeta("sanyaku", locale);
  }
  if (label.startsWith("前頭") || normalized.startsWith("maegashira")) return createRankTierMeta("maegashira", locale);
  if (label.startsWith("十両") || normalized.startsWith("juryo")) return createRankTierMeta("juryo", locale);
  if (label.startsWith("幕下") || normalized.startsWith("makushita")) return createRankTierMeta("makushita", locale);
  if (
    label.startsWith("三段目") ||
    label.startsWith("序二段") ||
    label.startsWith("序") ||
    label.startsWith("下位") ||
    normalized.startsWith("sandanme") ||
    normalized.startsWith("jonidan") ||
    normalized.startsWith("jonokuchi") ||
    normalized.startsWith("lower")
  ) {
    return createRankTierMeta("lower", locale);
  }
  return createRankTierMeta("unknown", locale);
};

const rankTierClassMap: Record<RankTierKey, string> = {
  yokozuna: styles.tierYokozuna,
  ozeki: styles.tierOzeki,
  sanyaku: styles.tierSanyaku,
  maegashira: styles.tierMaegashira,
  juryo: styles.tierJuryo,
  makushita: styles.tierMakushita,
  lower: styles.tierLower,
  unknown: styles.tierUnknown,
};

type RelativePosition = "above" | "same" | "below" | "mixed" | "unknown";

const relativePositionLabel = (position: RelativePosition, locale: LocaleCode): string => {
  if (locale === "en") {
    switch (position) {
      case "above":
        return "Mostly above";
      case "same":
        return "Same tier";
      case "below":
        return "Mostly below";
      case "mixed":
        return "Mixed tiers";
      case "unknown":
      default:
        return "No comparison";
    }
  }
  switch (position) {
    case "above":
      return "上位多め";
    case "same":
      return "同格中心";
    case "below":
      return "下位多め";
    case "mixed":
      return "上下混在";
    case "unknown":
    default:
      return "比較なし";
  }
};

const positionClassMap: Record<RelativePosition, string> = {
  above: styles.posAbove,
  same: styles.posSame,
  below: styles.posBelow,
  mixed: styles.posMixed,
  unknown: styles.posUnknown,
};

const resolveMapToneClass = (tone: RelationNodeTone): string => {
  switch (tone) {
    case "race":
      return styles.mapToneRace;
    case "peer":
      return styles.mapTonePeer;
    case "era":
      return styles.mapToneEra;
    case "strong":
      return styles.mapToneStrong;
    case "rival":
    default:
      return styles.mapToneRival;
  }
};

const ChapterSection: React.FC<ChapterSectionProps> = ({ title, lead, children }) => (
  <section className={styles.chapterSection}>
    <header className={styles.chapterHead}>
      <h3 className={styles.chapterTitle}>{title}</h3>
      <p className={styles.chapterLead}>{lead}</p>
    </header>
    {children}
  </section>
);

const DetailChapterSection: React.FC<DetailChapterSectionProps> = ({
  title,
  lead,
  summary,
  children,
}) => (
  <details className={styles.detailChapter}>
    <summary className={styles.detailSummary}>
      <span className={styles.detailSummaryText}>
        <span className={styles.detailTitle}>{title}</span>
        <span className={styles.detailLead}>{lead}</span>
      </span>
      <span className={styles.detailMeta}>
        <span className={styles.detailCount}>{summary}</span>
        <span className={styles.detailAction} aria-hidden="true" />
      </span>
    </summary>
    <div className={styles.detailBody}>{children}</div>
  </details>
);

const RelationGroup: React.FC<RelationGroupProps> = ({ title, lead, count, items, emptyCopy, locale }) => {
  const hiddenCount = Math.max(0, count - items.length);

  return (
    <section className={styles.relationGroup}>
      <header className={styles.relationHead}>
        <div className={styles.relationLabelStack}>
          <span className={styles.relationTitle}>{title}</span>
          {lead ? <span className={styles.relationLead}>{lead}</span> : null}
        </div>
        <span className={styles.relationCount}>{formatPersonCount(count, locale)}</span>
      </header>
      <div className={styles.relationList}>
        {items.length === 0 ? (
          <div className={styles.emptyState}>{emptyCopy}</div>
        ) : (
          items.map((item) => (
            <article key={item.id} className={styles.row}>
              <div className={styles.rowHeader}>
                <span className={styles.rowName}>{item.name}</span>
                <span className={styles.rowMeta}>{item.meta}</span>
              </div>
              <p className={styles.rowDesc}>{item.description}</p>
            </article>
          ))
        )}
      </div>
      {hiddenCount > 0 ? <div className={styles.moreCount}>{formatMoreCount(hiddenCount, locale)}</div> : null}
    </section>
  );
};

interface RelationMapProps {
  shikona: string;
  positionLabel: string;
  playerTier: RankTierMeta;
  nodes: RelationMapNode[];
  locale: LocaleCode;
}

const buildStarMarks = (record?: RelationNodeRecord): Array<"win" | "loss"> => {
  if (!record || record.meetings <= 0) return [];
  const marks: Array<"win" | "loss"> = [];
  const cappedWins = Math.min(record.wins, 6);
  const remainingSlots = 6 - cappedWins;
  const cappedLosses = Math.min(record.losses, remainingSlots);
  for (let i = 0; i < cappedWins; i += 1) marks.push("win");
  for (let i = 0; i < cappedLosses; i += 1) marks.push("loss");
  return marks;
};

const formatRelationBoardRecord = (record: RelationNodeRecord | undefined, locale: LocaleCode): string =>
  record && record.meetings > 0
    ? locale === "en"
      ? `${record.meetings} bouts, ${record.wins}-${record.losses}`
      : `${record.meetings}戦${record.wins}勝${record.losses}敗`
    : locale === "en"
      ? "Banzuke relation"
      : "番付上の関係";

const formatRelationBoardMeta = (node: RelationMapNode, locale: LocaleCode): string | null => {
  if (node.record && node.meta === formatRelationBoardRecord(node.record, locale)) return null;
  return node.meta;
};

const RelationMap: React.FC<RelationMapProps> = ({ shikona, positionLabel, playerTier, nodes, locale }) => {
  const rows = nodes.slice(0, 8);

  return (
    <div className={styles.relationMap} aria-label={locale === "en" ? "Head-to-head relation board" : "星取相関盤"}>
      <header className={styles.relationBoardHead}>
        <div className={styles.relationBoardSubject}>
          {playerTier.key !== "unknown" ? (
            <span
              className={`${styles.tierChip} ${styles.tierChipLg} ${rankTierClassMap[playerTier.key]}`}
              title={playerTier.shortLabel}
              aria-label={locale === "en" ? `Peak ${playerTier.shortLabel}` : `最高位 ${playerTier.shortLabel}`}
            >
              {playerTier.symbol}
            </span>
          ) : null}
          <span className={styles.relationBoardSubjectText}>
            <span className={styles.mapCenterLabel}>{locale === "en" ? "Subject" : "本人"}</span>
            <strong className={styles.mapCenterName}>{shikona}</strong>
            <span className={styles.mapCenterMeta}>{positionLabel}</span>
          </span>
        </div>
        <div className={styles.relationBoardLegend} aria-label={locale === "en" ? "Bout result legend" : "星取凡例"}>
          <span><span className={styles.starWin} />{locale === "en" ? "Wins" : "白星"}</span>
          <span><span className={styles.starLoss} />{locale === "en" ? "Losses" : "黒星"}</span>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className={styles.mapEmpty}>
          {locale === "en"
            ? "There are not enough opponent records to draw this board yet."
            : "相関盤に出せる相手の記録はまだ少ない。"}
        </div>
      ) : (
        <div className={styles.relationBoardTable}>
          <div className={styles.relationBoardHeader} aria-hidden="true">
            <span>{locale === "en" ? "Relation" : "関係"}</span>
            <span>{locale === "en" ? "Opponent" : "相手"}</span>
            <span>{locale === "en" ? "Peak" : "最高位"}</span>
            <span>{locale === "en" ? "Bouts" : "対戦"}</span>
            <span>{locale === "en" ? "Results" : "星取"}</span>
          </div>
          {rows.map((node) => {
            const marks = buildStarMarks(node.record);
            const boardMeta = formatRelationBoardMeta(node, locale);
            return (
              <article
                key={node.id}
                className={`${styles.relationBoardRow} ${resolveMapToneClass(node.tone)}`}
              >
                <span className={styles.mapNodeRole}>{node.role}</span>
                <span className={styles.relationBoardNameBlock}>
                  <strong className={styles.mapNodeName}>{node.name}</strong>
                  {boardMeta ? <span className={styles.mapNodeMeta}>{boardMeta}</span> : null}
                </span>
                <span className={styles.relationRankCell}>
                  {node.tier.key !== "unknown" ? (
                    <span
                      className={`${styles.tierChip} ${rankTierClassMap[node.tier.key]}`}
                      title={node.tier.shortLabel}
                      aria-label={locale === "en" ? `Peak ${node.tier.shortLabel}` : `最高位 ${node.tier.shortLabel}`}
                    >
                      {node.tier.symbol}
                    </span>
                  ) : (
                    <span className={`${styles.tierChip} ${styles.tierChipEmpty}`} aria-hidden="true" />
                  )}
                  <span>{node.tier.shortLabel}</span>
                </span>
                <span className={styles.relationRecordText}>{formatRelationBoardRecord(node.record, locale)}</span>
                <span className={styles.starStrip} aria-label={formatRelationBoardRecord(node.record, locale)}>
                  {marks.length > 0 ? (
                    marks.map((mark, index) => (
                      <span
                        key={`${node.id}-${mark}-${index}`}
                        className={mark === "win" ? styles.starWin : styles.starLoss}
                      />
                    ))
                  ) : (
                    <span className={styles.starNoRecord}>{locale === "en" ? "Rank" : "番付"}</span>
                  )}
                </span>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface WorldHierarchyProps {
  tiers: HierarchyTier[];
  locale: LocaleCode;
}

const WorldHierarchy: React.FC<WorldHierarchyProps> = ({ tiers, locale }) => (
  <div
    className={styles.hierarchyDiagram}
    aria-label={locale === "en" ? "Banzuke and relation hierarchy" : "番付と関係の階層図"}
  >
    <aside className={styles.hierarchyAxis} aria-hidden="true">
      <span className={styles.hierarchyAxisCap}>{locale === "en" ? "Higher" : "上位"}</span>
      <span className={styles.hierarchyAxisLine} />
      <span className={styles.hierarchyAxisCap}>{locale === "en" ? "Lower" : "下位"}</span>
    </aside>
    <div className={styles.hierarchyTiers}>
      {tiers.map((tier) => (
        <section
          key={tier.key}
          className={`${styles.hierarchyTier} ${tier.key === "player" ? styles.hierarchyTierPlayer : ""}`}
        >
          <header className={styles.hierarchyTierHead}>
            <div className={styles.hierarchyTierTitleLine}>
              <span className={styles.hierarchyTierMarker} aria-hidden="true" />
              <span className={styles.hierarchyTierLabel}>{tier.label}</span>
              {tier.positionBadge ? (
                <span
                  className={`${styles.hierarchyTierPos} ${positionClassMap[tier.positionBadge]}`}
                >
                  {relativePositionLabel(tier.positionBadge, locale)}
                </span>
              ) : null}
            </div>
            <span className={styles.hierarchyTierNote}>{tier.note}</span>
          </header>
          <div className={styles.hierarchyItems}>
            {tier.items.length === 0 ? (
              <span className={styles.hierarchyEmpty}>
                {locale === "en" ? "No matching record" : "該当する記録なし"}
              </span>
            ) : (
              tier.items.map((item) => {
                const itemTier = item.tier ?? createRankTierMeta("unknown", locale);
                const showChip = itemTier.key !== "unknown";
                const winRatio =
                  item.record && item.record.meetings > 0
                    ? (item.record.wins / item.record.meetings) * 100
                    : null;
                return (
                  <span
                    key={item.id}
                    className={`${styles.hierarchyItem} ${item.isPlayer ? styles.hierarchyPlayer : ""}`}
                  >
                    {showChip ? (
                      <span
                        className={`${styles.tierChip} ${rankTierClassMap[itemTier.key]}`}
                        title={itemTier.shortLabel}
                        aria-label={locale === "en" ? `Peak ${itemTier.shortLabel}` : `最高位 ${itemTier.shortLabel}`}
                      >
                        {itemTier.symbol}
                      </span>
                    ) : (
                      <span className={`${styles.tierChip} ${styles.tierChipEmpty}`} aria-hidden="true" />
                    )}
                    <span className={styles.hierarchyItemBody}>
                      <strong className={styles.hierarchyName}>
                        {item.isPlayer ? (
                          <span className={styles.hierarchyPlayerMark}>{locale === "en" ? "S" : "本"}</span>
                        ) : null}
                        {item.name}
                      </strong>
                      <span className={styles.hierarchyMeta}>{item.meta}</span>
                      {winRatio !== null && item.record ? (
                        <span
                          className={styles.hierarchyItemRecord}
                          aria-label={
                            locale === "en"
                              ? `${item.record.wins} wins, ${item.record.losses} losses`
                              : `${item.record.wins}勝${item.record.losses}敗`
                          }
                        >
                          <span
                            className={styles.hierarchyItemRecordWin}
                            style={{ width: `${winRatio}%` }}
                          />
                          <span
                            className={styles.hierarchyItemRecordLoss}
                            style={{ width: `${100 - winRatio}%` }}
                          />
                        </span>
                      ) : null}
                    </span>
                  </span>
                );
              })
            )}
          </div>
        </section>
      ))}
    </div>
  </div>
);

interface RelationScaleChartProps {
  items: RelationScaleItem[];
  locale: LocaleCode;
}

const RelationScaleChart: React.FC<RelationScaleChartProps> = ({ items, locale }) => {
  const maxCount = Math.max(1, ...items.map((item) => item.count));

  return (
    <div className={styles.scaleChart} aria-label={locale === "en" ? "Relation category counts" : "関係カテゴリの件数"}>
      <header className={styles.visualCardHead}>
        <span className={styles.visualCardTitle}>{locale === "en" ? "Relationship Span" : "関係の広がり"}</span>
        <span className={styles.visualCardNote}>
          {locale === "en" ? "Longer lines mean more records" : "多い項目ほど線が長い"}
        </span>
      </header>
      <div className={styles.scaleList}>
        {items.map((item) => {
          const width = item.count > 0 ? `${Math.max(6, (item.count / maxCount) * 100)}%` : "0%";
          return (
            <div key={item.key} className={styles.scaleRow}>
              <div className={styles.scaleLabelLine}>
                <span className={styles.scaleLabel}>{item.label}</span>
                <span className={styles.scaleCount}>{formatPersonCount(item.count, locale)}</span>
              </div>
              <div className={styles.scaleTrack} aria-hidden="true">
                <span className={styles.scaleFill} style={{ width }} />
              </div>
              <span className={styles.scaleNote}>{item.note}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface OpponentRecordChartProps {
  items: OpponentRecordItem[];
  locale: LocaleCode;
}

const OpponentRecordChart: React.FC<OpponentRecordChartProps> = ({ items, locale }) => (
  <div className={styles.recordChart} aria-label={locale === "en" ? "Record against main opponents" : "主な対戦相手との勝敗"}>
    <header className={styles.visualCardHead}>
      <span className={styles.visualCardTitle}>{locale === "en" ? "Head-To-Head Tilt" : "対戦成績の偏り"}</span>
      <span className={styles.visualCardNote}>{locale === "en" ? "Wins / losses" : "白星 / 黒星"}</span>
    </header>
    <div className={styles.recordList}>
      {items.length === 0 ? (
        <div className={styles.compactEmpty}>
          {locale === "en" ? "No opponent has two or more recorded bouts yet." : "2戦以上の対戦相手がまだいない。"}
        </div>
      ) : (
        items.map((item) => {
          const winWidth = `${(item.wins / item.meetings) * 100}%`;
          const lossWidth = `${(item.losses / item.meetings) * 100}%`;
          return (
            <div key={item.id} className={styles.recordRow}>
              <div className={styles.recordLabelLine}>
                <span className={styles.recordName}>{item.name}</span>
                <span className={styles.recordValue}>{item.recordLabel}</span>
              </div>
              <div className={styles.recordTrack} aria-hidden="true">
                <span className={styles.recordWin} style={{ width: winWidth }} />
                <span className={styles.recordLoss} style={{ width: lossWidth }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  </div>
);

interface EraPowerMapProps {
  items: EraPowerItem[];
  label: string;
  locale: LocaleCode;
}

const EraPowerMap: React.FC<EraPowerMapProps> = ({ items, label, locale }) => {
  const maxCount = Math.max(1, ...items.map((item) => item.count));

  return (
    <section
      className={`${styles.visualBlock} ${styles.eraPowerBlock}`}
      aria-label={locale === "en" ? "Era banzuke power map" : "時代の番付勢力図"}
    >
      <header className={styles.visualBlockHead}>
        <span className={styles.visualBlockKicker}>{locale === "en" ? "Era Banzuke Map" : "時代の番付勢力図"}</span>
        <strong className={styles.visualBlockTitle}>{label}</strong>
      </header>
      <div className={styles.powerMountain}>
        {items.map((item) => {
          const width = item.count > 0 ? `${Math.max(10, (item.count / maxCount) * 100)}%` : "0%";
          return (
            <div key={item.key} className={styles.powerRow} data-tier={item.key}>
              <div className={styles.powerLabel}>
                <span>{item.shortLabel}</span>
                <em>{item.label}</em>
              </div>
              <div className={styles.powerTrack} aria-label={`${item.label} ${item.note}`}>
                <span style={{ width }} />
              </div>
              <strong className={styles.powerValue}>{item.note}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
};

interface PeerDistributionProps {
  model: PeerDistributionModel;
  locale: LocaleCode;
}

const PeerDistribution: React.FC<PeerDistributionProps> = ({ model, locale }) => {
  const maxCount = Math.max(1, ...model.bins.map((bin) => bin.count));

  return (
    <section className={styles.visualBlock} aria-label={locale === "en" ? "Same-generation peak-rank distribution" : "同期最高位分布"}>
      <header className={styles.visualBlockHead}>
        <span className={styles.visualBlockKicker}>
          {locale === "en" ? "Peer Peak Distribution" : "同期最高位分布"}
        </span>
        <strong className={styles.visualBlockTitle}>{model.rankText}</strong>
      </header>
      <div className={styles.peerHistogram}>
        {model.bins.map((bin) => {
          const height = bin.count > 0 ? `${Math.max(18, (bin.count / maxCount) * 100)}%` : "8%";
          const chipClass = rankTierClassMap[bin.key] ?? styles.tierUnknown;
          return (
            <div
              key={bin.key}
              className={`${styles.peerBin} ${bin.isPlayerTier ? styles.peerBinPlayer : ""}`}
            >
              <div className={styles.peerDots} aria-label={`${bin.label} ${formatPersonCount(bin.count, locale)}`}>
                <span style={{ height }} />
                {bin.isPlayerTier ? (
                  <strong aria-label={locale === "en" ? "Subject peak rank" : "本人の最高位"}>◎</strong>
                ) : null}
              </div>
              <span className={`${styles.tierChip} ${chipClass}`}>{rankTierSymbol(bin.key, locale)}</span>
              <em>{formatPersonCount(bin.count, locale)}</em>
            </div>
          );
        })}
      </div>
      <p className={styles.visualBlockNote}>
        {locale === "en"
          ? "The mark shows the subject's peak rank among same-generation rikishi."
          : "◎は本人の最高到達点。同期の中でどの高さまで届いたかを見る。"}
      </p>
    </section>
  );
};

interface CareerPositionTimelineProps {
  events: CareerTimelineEvent[];
  locale: LocaleCode;
}

const CareerPositionTimeline: React.FC<CareerPositionTimelineProps> = ({ events, locale }) => (
  <section className={styles.visualBlock} aria-label={locale === "en" ? "Career position timeline" : "キャリア位置タイムライン"}>
    <header className={styles.visualBlockHead}>
      <span className={styles.visualBlockKicker}>{locale === "en" ? "Career Position Timeline" : "キャリア位置タイムライン"}</span>
      <strong className={styles.visualBlockTitle}>{locale === "en" ? "Read The Career By Milestones" : "節目だけで読む一代"}</strong>
    </header>
    <div className={styles.positionTimeline}>
      {events.map((event) => (
        <article key={event.key} className={styles.timelineEvent} data-tone={event.tone}>
          <span className={styles.timelineStamp}>{event.ageLabel}</span>
          <div className={styles.timelineBody}>
            <div className={styles.timelineHead}>
              <strong>{event.label}</strong>
              <em>{event.bashoLabel}</em>
            </div>
            <span className={styles.timelineRank}>{event.rankLabel}</span>
            <p>{event.context}</p>
          </div>
        </article>
      ))}
    </div>
  </section>
);

interface WallNetworkProps {
  shikona: string;
  nodes: WallNetworkNode[];
  locale: LocaleCode;
}

const WallNetwork: React.FC<WallNetworkProps> = ({ shikona, nodes, locale }) => (
  <section className={styles.visualBlock} aria-label={locale === "en" ? "Rival and wall network" : "宿敵・壁ネットワーク"}>
    <header className={styles.visualBlockHead}>
      <span className={styles.visualBlockKicker}>{locale === "en" ? "Rival And Wall Network" : "宿敵・壁ネットワーク"}</span>
      <strong className={styles.visualBlockTitle}>{locale === "en" ? "Read The Meaning Of Each Link" : "関係の意味だけを見る"}</strong>
    </header>
    <div className={styles.wallNetwork}>
      <div className={styles.wallHub}>
        <span>{locale === "en" ? "Subject" : "本人"}</span>
        <strong>{shikona}</strong>
      </div>
      <div className={styles.wallNodes}>
        {nodes.length === 0 ? (
          <div className={styles.compactEmpty}>
            {locale === "en"
              ? "Few opponents have left a strong relationship record yet."
              : "関係性として強く残る相手はまだ少ない。"}
          </div>
        ) : (
          nodes.map((node) => (
            <article
              key={node.key}
              className={`${styles.wallNode} ${resolveMapToneClass(node.tone)}`}
            >
              <span className={styles.wallNodeLabel}>{node.label}</span>
              <strong>{node.name}</strong>
              <em>{node.meta}</em>
              <p>{node.note}</p>
            </article>
          ))
        )}
      </div>
    </div>
  </section>
);

const formatRecordLabel = (n: NotableNpcSummary, locale: LocaleCode): string =>
  n.meetings > 0
    ? locale === "en"
      ? `${n.meetings} bouts, ${n.playerWins}-${n.npcWins}`
      : `${n.meetings}戦${n.playerWins}勝${n.npcWins}敗`
    : locale === "en"
      ? "No head-to-head record"
      : "対戦記録なし";

const formatRivalDescriptionForLocale = (n: NotableNpcSummary, locale: LocaleCode): string => {
  if (locale === "ja") return formatRivalDescription(n);
  const wins = n.playerWins;
  const losses = n.npcWins;
  const meetings = n.meetings;
  if (meetings === 0) return "A banzuke contemporary who never met him on the dohyo.";
  if (wins === 0 && meetings >= 3) return "A wall he never solved.";
  if (losses - wins >= 3) return "A difficult opponent across the career.";
  if (wins - losses >= 3) return "An opponent he consistently beat.";
  if (meetings >= 5 && wins > losses) return "A frequent rival he edged ahead of.";
  if (meetings >= 5) return "A frequent opponent throughout the career.";
  if (n.rivalryKinds.includes("titleRace")) return "An opponent tied to the title race.";
  if (n.rivalryKinds.includes("promotionRace")) return "An opponent tied to the promotion race.";
  if (n.rivalryKinds.includes("sameGeneration")) return "A same-generation rival.";
  if (losses > wins) return "An opponent who held the edge.";
  return "An opponent he met several times on the dohyo.";
};

const formatGenerationPeerDescriptionForLocale = (n: NotableNpcSummary, locale: LocaleCode): string => {
  if (locale === "ja") {
    if (/^(横綱|大関)/.test(n.peakRankLabel ?? "")) return "同世代から最高位まで駆け上がった力士";
    if (/^(関脇|小結)/.test(n.peakRankLabel ?? "")) return "同世代から三役まで進んだ実力者";
    if ((n.peakRankLabel ?? "").startsWith("前頭") || (n.peakRankLabel ?? "").startsWith("十両")) {
      return "同世代で関取まで上がった力士";
    }
    if (n.meetings >= 4) return "何度も同じ階級でぶつかった同期";
    if (n.rivalryKinds.includes("promotionRace")) return "同じ昇進の壁に挑んだ同期";
    if (n.meetings >= 1) return "土俵を共にした同期";
    return "同じ世代に番付を重ねた力士";
  }
  const peakTier = resolveRankTier(n.peakRankLabel, locale);
  if (peakTier.key === "yokozuna" || peakTier.key === "ozeki") return "A same-generation rikishi who climbed to the top ranks.";
  if (peakTier.key === "sanyaku") return "A same-generation rikishi who reached sanyaku.";
  if (peakTier.key === "maegashira" || peakTier.key === "juryo") return "A same-generation rikishi who reached sekitori status.";
  if (n.meetings >= 4) return "A peer he met repeatedly around the same rank band.";
  if (n.rivalryKinds.includes("promotionRace")) return "A peer who challenged the same promotion wall.";
  if (n.meetings >= 1) return "A peer who shared the dohyo with him.";
  return "A rikishi whose banzuke path overlapped with his generation.";
};

const formatDominanceLabelForLocale = (s: EraStarNpcSummary, locale: LocaleCode): string => {
  if (locale === "ja") return formatDominanceLabel(s);
  const score = s.dominanceScore;
  const peakTier = resolveRankTier(s.peakRankLabel, locale);
  if (peakTier.key === "yokozuna") {
    if (score >= 80) return "A defining yokozuna of this era.";
    if (score >= 30) return "A yokozuna who led this era.";
    return "A yokozuna who left a mark on this era.";
  }
  if (peakTier.key === "ozeki") {
    if (score >= 60) return "An ozeki who anchored the upper ranks.";
    return "An ozeki of this era.";
  }
  if (peakTier.key === "sanyaku") return "A sanyaku regular who supported the upper ranks.";
  if (peakTier.key === "maegashira") return "A durable makuuchi upper-rank presence.";
  return "An upper-rank figure from this era.";
};

const formatEraStarYushoNoteForLocale = (s: EraStarNpcSummary, locale: LocaleCode): string | undefined => {
  if (!s.yushoLikeCount || s.yushoLikeCount <= 0) return undefined;
  return locale === "en"
    ? `Yusho-level runs: ${s.yushoLikeCount}`
    : formatEraStarYushoNote(s);
};

const toOpponentItem = (n: NotableNpcSummary, locale: LocaleCode): RelationItem => ({
  id: n.id,
  name: n.shikona,
  meta: `${n.peakRankLabel ? `${localizePeakRankMeta(n.peakRankLabel, locale)} / ` : ""}${formatRecordLabel(n, locale)}`,
  description: formatRivalDescriptionForLocale(n, locale),
});

const toEraStarItem = (s: EraStarNpcSummary, locale: LocaleCode): RelationItem => ({
  id: s.id,
  name: s.shikona,
  meta: `${localizeRankLabel(s.peakRankLabel, locale)}${formatEraStarYushoNoteForLocale(s, locale) ? ` / ${formatEraStarYushoNoteForLocale(s, locale)}` : ""}`,
  description: formatDominanceLabelForLocale(s, locale),
});

const formatPeakMeta = (n: NotableNpcSummary, locale: LocaleCode): string =>
  localizePeakRankMeta(n.peakRankLabel, locale);

const toNpcRecord = (n: NotableNpcSummary): RelationNodeRecord | undefined =>
  n.meetings > 0
    ? { wins: n.playerWins, losses: n.npcWins, meetings: n.meetings }
    : undefined;

const isMakuuchiTopRank = (row: BashoRecordRow): boolean =>
  row.division === "Makuuchi" && row.rankName === "前頭" && (row.rankNumber ?? 99) <= 8;

const resolvePowerKey = (row: BashoRecordRow): EraPowerKey | null => {
  if (row.rankName === "横綱") return "yokozuna";
  if (row.rankName === "大関") return "ozeki";
  if (row.rankName === "関脇" || row.rankName === "小結") return "sanyaku";
  if (isMakuuchiTopRank(row)) return "makuuchiTop";
  if (row.division === "Juryo") return "juryoWall";
  return null;
};

const eraPowerDefinition = (
  key: EraPowerKey,
  locale: LocaleCode,
): Pick<EraPowerItem, "key" | "label" | "shortLabel"> => {
  const ja: Record<EraPowerKey, Pick<EraPowerItem, "key" | "label" | "shortLabel">> = {
    yokozuna: { key: "yokozuna", label: "横綱", shortLabel: "横" },
    ozeki: { key: "ozeki", label: "大関", shortLabel: "大" },
    sanyaku: { key: "sanyaku", label: "三役", shortLabel: "役" },
    makuuchiTop: { key: "makuuchiTop", label: "幕内上位", shortLabel: "前" },
    juryoWall: { key: "juryoWall", label: "十両壁", shortLabel: "両" },
  };
  if (locale === "ja") return ja[key];
  const en: Record<EraPowerKey, Pick<EraPowerItem, "key" | "label" | "shortLabel">> = {
    yokozuna: { key: "yokozuna", label: "Yokozuna", shortLabel: "Y" },
    ozeki: { key: "ozeki", label: "Ozeki", shortLabel: "O" },
    sanyaku: { key: "sanyaku", label: "Sanyaku", shortLabel: "S" },
    makuuchiTop: { key: "makuuchiTop", label: "Upper Makuuchi", shortLabel: "M" },
    juryoWall: { key: "juryoWall", label: "Juryo Wall", shortLabel: "J" },
  };
  return en[key];
};

const ERA_POWER_KEYS: EraPowerKey[] = ["yokozuna", "ozeki", "sanyaku", "makuuchiTop", "juryoWall"];

const buildEraPowerItems = (
  bashoRows: CareerBashoRecordsBySeq[],
  locale: LocaleCode,
): EraPowerItem[] => {
  const counts = new Map<EraPowerKey, number>();
  for (const row of bashoRows.flatMap((basho) => basho.rows)) {
    if (row.entityType !== "NPC") continue;
    const key = resolvePowerKey(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const bashoCount = Math.max(1, bashoRows.length);
  return ERA_POWER_KEYS.map((key) => {
    const definition = eraPowerDefinition(key, locale);
    const count = counts.get(definition.key) ?? 0;
    const average = Math.round((count / bashoCount) * 10) / 10;
    return {
      ...definition,
      count,
      average,
      note: average > 0
        ? locale === "en"
          ? `avg ${average}`
          : `平均${average}人`
        : locale === "en"
          ? "limited record"
          : "記録少",
    };
  });
};

const resolveEraPowerLabel = (
  summary: CareerWorldSummary,
  items: EraPowerItem[],
  locale: LocaleCode,
): string => {
  const yokozunaAvg = items.find((item) => item.key === "yokozuna")?.average ?? 0;
  const ozekiAvg = items.find((item) => item.key === "ozeki")?.average ?? 0;
  const sanyakuAvg = items.find((item) => item.key === "sanyaku")?.average ?? 0;
  const activeTop = summary.eraStars.length;
  if (yokozunaAvg + ozekiAvg >= 2.4 && activeTop <= 4) {
    return locale === "en" ? "Stable Top-Rank Era" : "上位固定期";
  }
  if (activeTop >= 6 || sanyakuAvg >= 3.5) return locale === "en" ? "Crowded Upper Division" : "混戦期";
  if (summary.generationPeers.length + summary.promotionRaceOpponents.length >= 8) {
    return locale === "en" ? "Generation-Turnover Era" : "世代交代期";
  }
  return locale === "en" ? "Standard Banzuke Environment" : "標準的な番付環境";
};

const uniqueNotables = (items: NotableNpcSummary[]): NotableNpcSummary[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const buildPeerDistribution = (
  summary: CareerWorldSummary,
  highestRankLabel: string,
  locale: LocaleCode,
): PeerDistributionModel => {
  const peers = uniqueNotables([
    ...summary.generationPeers,
    ...summary.promotionRaceOpponents,
    ...summary.rivals.filter((rival) => rival.rivalryKinds.includes("sameGeneration")),
  ]);
  const playerTier = resolveRankTier(highestRankLabel, locale);
  const counts = new Map<RankTierKey, number>();
  for (const peer of peers) {
    const tier = resolveRankTier(peer.peakRankLabel, locale);
    if (tier.key === "unknown") continue;
    counts.set(tier.key, (counts.get(tier.key) ?? 0) + 1);
  }
  const higherCount = peers.filter((peer) => resolveRankTier(peer.peakRankLabel, locale).level > playerTier.level).length;
  const total = peers.length + 1;
  const rankText =
    total > 1
      ? locale === "en"
        ? `No. ${higherCount + 1} among ${total} same-generation rikishi`
        : `同期${total}人中 上から${higherCount + 1}番目`
      : locale === "en"
        ? "Limited same-generation record"
        : "同期記録は限定的";
  const tierOrder: RankTierKey[] = [
    "yokozuna",
    "ozeki",
    "sanyaku",
    "maegashira",
    "juryo",
    "makushita",
    "lower",
  ];
  return {
    playerTier,
    total,
    rankText,
    bins: tierOrder.map((key) => ({
      key,
      label: rankTierLabel(key, locale),
      count: counts.get(key) ?? 0,
      isPlayerTier: key === playerTier.key,
    })),
  };
};

const rankTierLabel = (key: RankTierKey, locale: LocaleCode = "ja"): string => {
  if (locale === "en") {
    switch (key) {
      case "yokozuna":
        return "Yokozuna";
      case "ozeki":
        return "Ozeki";
      case "sanyaku":
        return "Sanyaku";
      case "maegashira":
        return "Maegashira";
      case "juryo":
        return "Juryo";
      case "makushita":
        return "Makushita";
      case "lower":
        return "Lower";
      case "unknown":
      default:
        return "Unknown";
    }
  }
  switch (key) {
    case "yokozuna":
      return "横綱";
    case "ozeki":
      return "大関";
    case "sanyaku":
      return "三役";
    case "maegashira":
      return "前頭";
    case "juryo":
      return "十両";
    case "makushita":
      return "幕下";
    case "lower":
      return "下位";
    case "unknown":
    default:
      return "不明";
  }
};

const rankTierSymbol = (key: RankTierKey, locale: LocaleCode = "ja"): string => {
  if (locale === "en") {
    switch (key) {
      case "yokozuna":
        return "Y";
      case "ozeki":
        return "O";
      case "sanyaku":
        return "S";
      case "maegashira":
        return "M";
      case "juryo":
        return "J";
      case "makushita":
        return "Ms";
      case "lower":
        return "L";
      case "unknown":
      default:
        return "?";
    }
  }
  switch (key) {
    case "yokozuna":
      return "横";
    case "ozeki":
      return "大";
    case "sanyaku":
      return "役";
    case "maegashira":
      return "前";
    case "juryo":
      return "両";
    case "makushita":
      return "幕";
    case "lower":
      return "下";
    case "unknown":
    default:
      return "?";
  }
};

const formatAgeAtBasho = (status: RikishiStatus, bashoIndex: number, locale: LocaleCode): string => {
  const age = status.entryAge + Math.floor(Math.max(0, bashoIndex) / 6);
  return locale === "en" ? `Age ${age}` : `${age}歳`;
};

const buildTimelineEvent = (
  key: string,
  label: string,
  record: RikishiStatus["history"]["records"][number],
  index: number,
  status: RikishiStatus,
  context: string,
  tone: CareerTimelineEvent["tone"],
  locale: LocaleCode,
): CareerTimelineEvent => ({
  key,
  label,
  bashoLabel: formatBashoLabel(record.year, record.month, locale),
  ageLabel: formatAgeAtBasho(status, index, locale),
  rankLabel: formatRankDisplayName(record.rank, locale),
  context,
  tone,
});

const buildCareerTimelineEvents = (
  status: RikishiStatus,
  peerDistribution: PeerDistributionModel,
  locale: LocaleCode,
): CareerTimelineEvent[] => {
  const records = status.history.records.filter((record) => record.rank.division !== "Maezumo");
  if (records.length === 0) return [];
  const events: CareerTimelineEvent[] = [];
  const first = records[0];
  events.push(buildTimelineEvent(
    "entry",
    locale === "en" ? "Entry" : "入門",
    first,
    0,
    status,
    locale === "en" ? "The observation of this career begins." : "この一代の観測が始まる。",
    "entry",
    locale,
  ));

  const firstJuryoIndex = records.findIndex((record) =>
    record.rank.division === "Juryo" || record.rank.division === "Makuuchi",
  );
  if (firstJuryoIndex >= 0) {
    events.push(
      buildTimelineEvent(
        "juryo",
        locale === "en" ? "Reached Juryo" : "十両到達",
        records[firstJuryoIndex],
        firstJuryoIndex,
        status,
        peerDistribution.rankText,
        "promotion",
        locale,
      ),
    );
  }

  const firstMakuuchiIndex = records.findIndex((record) => record.rank.division === "Makuuchi");
  if (firstMakuuchiIndex >= 0) {
    events.push(
      buildTimelineEvent(
        "makuuchi",
        locale === "en" ? "Reached Makuuchi" : "幕内到達",
        records[firstMakuuchiIndex],
        firstMakuuchiIndex,
        status,
        locale === "en"
          ? "A milestone where he entered the upper banzuke environment directly."
          : "番付の上位環境に直接触れた節目。",
        "promotion",
        locale,
      ),
    );
  }

  const highestIndex = records.reduce((bestIndex, record, index) => {
    const best = records[bestIndex];
    return getRankValueForChart(record.rank) < getRankValueForChart(best.rank) ? index : bestIndex;
  }, 0);
  events.push(
    buildTimelineEvent(
      "peak",
      locale === "en" ? "Peak Rank" : "最高位",
      records[highestIndex],
      highestIndex,
      status,
      peerDistribution.rankText,
      "peak",
      locale,
    ),
  );

  const lastIndex = records.length - 1;
  events.push(
    buildTimelineEvent(
      "last",
      locale === "en" ? "Final Record" : "終幕",
      records[lastIndex],
      lastIndex,
      status,
      locale === "en" ? "The final rank and record left by the career." : "最後に残った番付と記録。",
      "exit",
      locale,
    ),
  );

  return events.filter((event, index, array) =>
    array.findIndex((candidate) => candidate.key === event.key || candidate.bashoLabel === event.bashoLabel && candidate.label === event.label) === index,
  );
};

const buildWallNetworkNodes = (summary: CareerWorldSummary, locale: LocaleCode): WallNetworkNode[] => {
  const byMeetings = summary.rivals.slice().sort((a, b) => b.meetings - a.meetings)[0];
  const nemesis = summary.rivals
    .filter((rival) => rival.npcWins > rival.playerWins)
    .slice()
    .sort((a, b) => (b.npcWins - b.playerWins) - (a.npcWins - a.playerWins))[0];
  const favorite = summary.rivals
    .filter((rival) => rival.playerWins > rival.npcWins)
    .slice()
    .sort((a, b) => (b.playerWins - b.npcWins) - (a.playerWins - a.npcWins))[0];

  const nodes: WallNetworkNode[] = [];
  if (byMeetings) {
    nodes.push({
      key: "most",
      label: locale === "en" ? "Most Bouts" : "最多対戦",
      name: byMeetings.shikona,
      meta: formatRecordLabel(byMeetings, locale),
      note: locale === "en"
        ? "The opponent with the most dohyo contact."
        : "土俵で最も接点が多かった相手。",
      tone: "rival",
    });
  }
  if (nemesis && nemesis.id !== byMeetings?.id) {
    nodes.push({
      key: "wall",
      label: locale === "en" ? "Wall" : "壁",
      name: nemesis.shikona,
      meta: formatRecordLabel(nemesis, locale),
      note: locale === "en"
        ? "An opponent whose wins made him a career wall."
        : "黒星が先行し、キャリアの壁として残った相手。",
      tone: "strong",
    });
  }
  if (favorite && favorite.id !== byMeetings?.id && favorite.id !== nemesis?.id) {
    nodes.push({
      key: "favorite",
      label: locale === "en" ? "Edge" : "得意",
      name: favorite.shikona,
      meta: formatRecordLabel(favorite, locale),
      note: locale === "en"
        ? "An opponent he beat often enough to support his rise."
        : "白星が先行し、上昇を支えた相手。",
      tone: "peer",
    });
  }
  return nodes;
};

const buildRelationMapNodes = (summary: CareerWorldSummary, locale: LocaleCode): RelationMapNode[] => {
  const nodes: Array<Omit<RelationMapNode, "slot">> = [];
  const usedIds = new Set<string>();
  const addNode = (node: Omit<RelationMapNode, "slot"> | null): void => {
    if (!node || usedIds.has(node.id) || nodes.length >= RELATION_NODE_SLOTS.length) return;
    usedIds.add(node.id);
    nodes.push(node);
  };

  const mainRival = summary.rivals[0];
  addNode(
    mainRival
      ? {
        id: mainRival.id,
        role: locale === "en" ? "Main opponent" : "対戦の中心",
        name: mainRival.shikona,
        meta: formatRecordLabel(mainRival, locale),
        tone: "rival",
        tier: resolveRankTier(mainRival.peakRankLabel, locale),
        record: toNpcRecord(mainRival),
      }
      : null,
  );

  const raceOpponent = summary.promotionRaceOpponents[0];
  addNode(
    raceOpponent
      ? {
        id: raceOpponent.id,
        role: locale === "en" ? "Promotion race" : "昇進争い",
        name: raceOpponent.shikona,
        meta: `${formatPeakMeta(raceOpponent, locale)} / ${formatRecordLabel(raceOpponent, locale)}`,
        tone: "race",
        tier: resolveRankTier(raceOpponent.peakRankLabel, locale),
        record: toNpcRecord(raceOpponent),
      }
      : null,
  );

  const peer = summary.generationPeers[0];
  addNode(
    peer
      ? {
        id: peer.id,
        role: locale === "en" ? "Same generation" : "同世代",
        name: peer.shikona,
        meta: formatPeakMeta(peer, locale),
        tone: "peer",
        tier: resolveRankTier(peer.peakRankLabel, locale),
        record: toNpcRecord(peer),
      }
      : null,
  );

  const eraStar = summary.eraStars[0];
  addNode(
    eraStar
      ? {
        id: eraStar.id,
        role: locale === "en" ? "Era upper-rank" : "時代の上位",
        name: eraStar.shikona,
        meta: `${localizeRankLabel(eraStar.peakRankLabel, locale)}${formatEraStarYushoNoteForLocale(eraStar, locale) ? ` / ${formatEraStarYushoNoteForLocale(eraStar, locale)}` : ""}`,
        tone: "era",
        tier: resolveRankTier(eraStar.peakRankLabel, locale),
      }
      : null,
  );

  const strongOpponent = summary.strongestOpponents[0];
  addNode(
    strongOpponent
      ? {
        id: strongOpponent.id,
        role: locale === "en" ? "Strong opponent" : "強い相手",
        name: strongOpponent.shikona,
        meta: `${formatPeakMeta(strongOpponent, locale)} / ${formatRecordLabel(strongOpponent, locale)}`,
        tone: "strong",
        tier: resolveRankTier(strongOpponent.peakRankLabel, locale),
        record: toNpcRecord(strongOpponent),
      }
      : null,
  );

  return nodes.map((node, index) => ({
    ...node,
    slot: RELATION_NODE_SLOTS[index],
  }));
};

const toHierarchyOpponent = (n: NotableNpcSummary, locale: LocaleCode): HierarchyItem => ({
  id: n.id,
  name: n.shikona,
  meta: formatPeakMeta(n, locale),
  tier: resolveRankTier(n.peakRankLabel, locale),
  record: toNpcRecord(n),
});

const toHierarchyEraStar = (s: EraStarNpcSummary, locale: LocaleCode): HierarchyItem => ({
  id: s.id,
  name: s.shikona,
  meta: `${localizeRankLabel(s.peakRankLabel, locale)}${formatEraStarYushoNoteForLocale(s, locale) ? ` / ${formatEraStarYushoNoteForLocale(s, locale)}` : ""}`,
  tier: resolveRankTier(s.peakRankLabel, locale),
});

const aggregateTierPosition = (
  items: HierarchyItem[],
  playerTier: RankTierMeta,
): RelativePosition => {
  if (playerTier.level < 0 || items.length === 0) return "unknown";
  let above = 0;
  let same = 0;
  let below = 0;
  let known = 0;
  for (const item of items) {
    const t = item.tier;
    if (!t || t.level < 0) continue;
    known += 1;
    if (t.level > playerTier.level) above += 1;
    else if (t.level < playerTier.level) below += 1;
    else same += 1;
  }
  if (known === 0) return "unknown";
  const ranked: Array<[RelativePosition, number]> = [
    ["above", above],
    ["same", same],
    ["below", below],
  ];
  ranked.sort(([, a], [, b]) => b - a);
  const [position, count] = ranked[0];
  return count / known >= 0.67 ? position : "mixed";
};

const buildWorldHierarchyTiers = (
  shikona: string,
  position: ReturnType<typeof formatCareerPosition>,
  summary: CareerWorldSummary,
  locale: LocaleCode,
): HierarchyTier[] => {
  const sameWall = summary.promotionRaceOpponents.length > 0
    ? summary.promotionRaceOpponents
    : summary.generationPeers;
  const playerTier = resolveRankTier(position.highestRankLabel, locale);
  const eraStarItems = summary.eraStars.slice(0, 3).map((item) => toHierarchyEraStar(item, locale));
  const sameWallItems = sameWall.slice(0, 3).map((item) => toHierarchyOpponent(item, locale));
  const rivalItems = summary.rivals.slice(0, 3).map((item) => toHierarchyOpponent(item, locale));

  return [
    {
      key: "eraTop",
      label: locale === "en" ? "Era Upper Ranks" : "時代の上位",
      note: locale === "en" ? "The measuring stick above the subject" : "本人の上にいた物差し",
      positionBadge: eraStarItems.length > 0 ? aggregateTierPosition(eraStarItems, playerTier) : "above",
      items: eraStarItems,
    },
    {
      key: "player",
      label: locale === "en" ? "Subject Peak" : "本人の到達点",
      note: locale === "en" ? "The highest point of this career" : "この一代の最高到達点",
      positionBadge: "same",
      items: [
        {
          id: "player",
          name: shikona,
          meta: `${position.highestRankLabel} / ${position.careerTypeLabel}`,
          isPlayer: true,
          tier: playerTier,
        },
      ],
    },
    {
      key: "sameWall",
      label: locale === "en" ? "Shared Wall" : "同じ壁",
      note: locale === "en" ? "Peers and promotion-race opponents on the same wall" : "同世代・昇進争いで重なった相手",
      positionBadge: sameWallItems.length > 0 ? aggregateTierPosition(sameWallItems, playerTier) : "same",
      items: sameWallItems,
    },
    {
      key: "direct",
      label: locale === "en" ? "Direct Bouts" : "直接対戦",
      note: locale === "en" ? "Opponents with the strongest dohyo connection" : "土俵で関係が濃かった相手",
      positionBadge: rivalItems.length > 0 ? aggregateTierPosition(rivalItems, playerTier) : undefined,
      items: rivalItems,
    },
  ];
};

const formatCareerTypeLabelForLocale = (
  rarity: CareerWorldSummary["rarity"],
  locale: LocaleCode,
): string => {
  if (locale === "ja") return formatCareerPosition(rarity).careerTypeLabel;
  switch (rarity.highestRankBucket) {
    case "横綱":
      return "Summit career";
    case "大関":
      return "Top-rank challenger";
    case "三役":
      return "Sanyaku career";
    case "幕内":
      return "Makuuchi career";
    case "十両":
      return "Sekitori career";
    case "幕下":
      return "Makushita near-miss";
    case "三段目":
      return "Lower-division rise";
    case "序二段":
      return "Lower-division stay";
    case "序ノ口":
      return "Short career";
    default:
      return "Dohyo entrant";
  }
};

const formatCareerPositionTextForLocale = (
  rarity: CareerWorldSummary["rarity"],
  locale: LocaleCode,
): string => {
  if (locale === "ja") return rarity.realDataPercentileText;
  switch (rarity.highestRankBucket) {
    case "横綱":
      return "A historically rare career (top approx. 0.36% in real data)";
    case "大関":
      return "A historically rare career (top approx. 0.76% in real data)";
    case "三役":
      return "A sanyaku-reaching career (top approx. 2.6% in real data)";
    case "幕内":
      return "A makuuchi-reaching career (top approx. 5.7% in real data)";
    case "十両":
      return "A rare sekitori-reaching career (top approx. 9% in real data)";
    case "幕下":
      return "A career one step short of sekitori (top approx. 25% in real data)";
    case "三段目":
      return "A typical lower-division career";
    case "序二段":
      return "A career that spent time in the lower divisions";
    case "序ノ口":
      return "A short career";
    default:
      return "A very short career";
  }
};

const formatCareerTitleForLocale = (
  rarity: CareerWorldSummary["rarity"],
  locale: LocaleCode,
): string => {
  if (locale === "ja") return rarity.reasonCodes[0] ?? "土俵に上がった者";
  switch (rarity.highestRankBucket) {
    case "横綱":
      return "Joined the line of yokozuna";
    case "大関":
      return "Reached ozeki";
    case "三役":
      return "Crossed the sanyaku wall";
    case "幕内":
      return "Reached makuuchi";
    case "十両":
      return "Reached sekitori";
    case "幕下":
      return "Chased sekitori from makushita";
    case "三段目":
      return "Sandanme challenger";
    case "序二段":
      return "Jonidan campaigner";
    case "序ノ口":
      return "Short-career rikishi";
    default:
      return "Stepped onto the dohyo";
  }
};

const formatCareerPositionForLocale = (
  summary: CareerWorldSummary,
  locale: LocaleCode,
): ReturnType<typeof formatCareerPosition> => {
  const position = formatCareerPosition(summary.rarity);
  if (locale === "ja") return position;
  return {
    highestRankLabel: localizeRankLabel(position.highestRankLabel, locale),
    positionText: formatCareerPositionTextForLocale(summary.rarity, locale),
    title: formatCareerTitleForLocale(summary.rarity, locale),
    careerTypeLabel: formatCareerTypeLabelForLocale(summary.rarity, locale),
  };
};

const buildCareerWorldNarrativeForLocale = (
  summary: CareerWorldSummary,
  locale: LocaleCode,
): string => {
  if (locale === "ja") return buildCareerWorldNarrative(summary, summary.rarity);
  const rankLabel = localizeRankLabel(summary.rarity.highestRankLabel, locale);
  const sentences: string[] = [];
  switch (summary.rarity.highestRankBucket) {
    case "横綱":
      sentences.push(`A historic career that reached ${rankLabel}.`);
      break;
    case "大関":
      sentences.push(`An ozeki career that reached ${rankLabel} and challenged the summit.`);
      break;
    case "三役":
      sentences.push(`A career that climbed to ${rankLabel} and crossed the sanyaku wall.`);
      break;
    case "幕内":
      sentences.push(`A makuuchi-level career that reached ${rankLabel}.`);
      break;
    case "十両":
      sentences.push(`A rare sekitori career that reached ${rankLabel}.`);
      break;
    case "幕下":
      sentences.push(`He rose to ${rankLabel}, but the sekitori wall stayed out of reach.`);
      break;
    case "三段目":
      sentences.push(`He climbed to ${rankLabel}, but did not break through to makushita.`);
      break;
    case "序二段":
      sentences.push("A lower-division career that spent many basho in jonidan.");
      break;
    case "序ノ口":
      sentences.push("A short career that ended early on the dohyo.");
      break;
    default:
      sentences.push("A rikishi who stepped onto the dohyo and left a trace in this world.");
  }

  const peer = summary.generationPeers[0];
  const rival = summary.rivals[0];
  const eraStar = summary.eraStars[0];
  if (peer?.peakRankLabel) {
    sentences.push(`His generation included ${peer.shikona}, who reached ${localizeRankLabel(peer.peakRankLabel, locale)}.`);
  } else if (rival) {
    sentences.push(`${rival.shikona} was ${formatRivalDescriptionForLocale(rival, locale).replace(/\.$/, "").toLowerCase()}.`);
  } else if (eraStar) {
    sentences.push(`${eraStar.shikona} (${localizeRankLabel(eraStar.peakRankLabel, locale)}) stood above this era.`);
  } else {
    sentences.push("The career is best read through the rikishi who shared his dohyo path.");
  }
  return sentences.join(" ");
};

const isHighRankLabel = (label: string | undefined): boolean => {
  const tier = resolveRankTier(label);
  return tier.level >= 2;
};

const buildKeyCardsForLocale = (
  summary: CareerWorldSummary,
  locale: LocaleCode,
): ReturnType<typeof selectKeyNpcCards> => {
  if (locale === "ja") return selectKeyNpcCards(summary);
  const cards: ReturnType<typeof selectKeyNpcCards> = [];
  const rival = summary.rivals[0];
  if (rival) {
    cards.push({
      kind: "rival",
      heading: "Central Opponent",
      shikona: rival.shikona,
      metaLabel: formatRecordLabel(rival, locale),
      description: formatRivalDescriptionForLocale(rival, locale),
      sourceId: rival.id,
    });
  }
  const peerLeader = summary.generationPeers
    .slice()
    .sort((a, b) => {
      const aHigh = isHighRankLabel(a.peakRankLabel) ? 1 : 0;
      const bHigh = isHighRankLabel(b.peakRankLabel) ? 1 : 0;
      if (aHigh !== bHigh) return bHigh - aHigh;
      return b.rivalryScore - a.rivalryScore;
    })[0];
  if (peerLeader && peerLeader.id !== rival?.id) {
    cards.push({
      kind: "peerLeader",
      heading: "High-Ranked Peer",
      shikona: peerLeader.shikona,
      metaLabel: peerLeader.peakRankLabel ? localizePeakRankMeta(peerLeader.peakRankLabel, locale) : "Same-generation rikishi",
      description: formatGenerationPeerDescriptionForLocale(peerLeader, locale),
      sourceId: peerLeader.id,
    });
  }
  const eraTop = summary.eraStars[0];
  if (eraTop && eraTop.id !== rival?.id && eraTop.id !== peerLeader?.id) {
    cards.push({
      kind: "eraTop",
      heading: "Era Center",
      shikona: eraTop.shikona,
      metaLabel: localizeRankLabel(eraTop.peakRankLabel, locale),
      description: formatDominanceLabelForLocale(eraTop, locale),
      sourceId: eraTop.id,
    });
  }
  return cards;
};

const buildPeerSectionsForLocale = (
  summary: CareerWorldSummary,
  locale: LocaleCode,
): ReturnType<typeof buildPeerSections> => {
  if (locale === "ja") return buildPeerSections(summary);
  const peers = summary.generationPeers;
  if (!peers.length) return [];
  const leaders: NotableNpcSummary[] = [];
  const wallSharers: NotableNpcSummary[] = [];
  const frequentMet: NotableNpcSummary[] = [];
  const others: NotableNpcSummary[] = [];

  for (const peer of peers) {
    if (isHighRankLabel(peer.peakRankLabel)) leaders.push(peer);
    else if (peer.rivalryKinds.includes("promotionRace")) wallSharers.push(peer);
    else if (peer.meetings >= 3) frequentMet.push(peer);
    else others.push(peer);
  }

  const makeMember = (peer: NotableNpcSummary): ReturnType<typeof buildPeerSections>[number]["members"][number] => ({
    id: peer.id,
    shikona: peer.shikona,
    metaLabel: peer.peakRankLabel ? localizePeakRankMeta(peer.peakRankLabel, locale) : "",
    description: formatGenerationPeerDescriptionForLocale(peer, locale),
  });
  const sections: ReturnType<typeof buildPeerSections> = [];
  if (leaders.length) {
    sections.push({
      heading: "High-Ranked Peers",
      members: leaders.slice(0, 3).map(makeMember),
    });
  }
  if (wallSharers.length) {
    sections.push({
      heading: "Shared Promotion Wall",
      members: wallSharers.slice(0, 3).map(makeMember),
    });
  }
  if (frequentMet.length) {
    sections.push({
      heading: "Frequent Same-Generation Opponents",
      members: frequentMet.slice(0, 3).map(makeMember),
    });
  }
  if (!sections.length && others.length) {
    sections.push({
      heading: "Same-Generation Rikishi",
      members: others.slice(0, 3).map(makeMember),
    });
  }
  return sections;
};

export const CareerWorldSection: React.FC<CareerWorldSectionProps> = ({
  status,
  careerId,
  bashoRows,
  isRetired = false,
}) => {
  const { locale } = useLocale();
  const [bouts, setBouts] = React.useState<CareerPlayerBoutsByBasho[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!careerId) {
      setBouts([]);
      return () => undefined;
    }
    listCareerPlayerBoutsByBasho(careerId)
      .then((rows) => {
        if (!cancelled) setBouts(rows);
      })
      .catch(() => {
        if (!cancelled) setBouts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [careerId]);

  const summary: CareerWorldSummary | null = React.useMemo(() => {
    if (bouts == null) return null;
    return buildCareerWorldSummary({ status, bashoRows, playerBouts: bouts });
  }, [bouts, bashoRows, status]);

  if (!summary) {
    return (
      <section className={styles.section}>
        <div className={styles.worldPanel}>
          <header className={styles.worldHead}>
            <div>
              <span className={styles.worldKicker}>{locale === "en" ? "Relationships" : "関係性"}</span>
              <h2 className={styles.worldTitle}>{locale === "en" ? "Career World" : "このキャリアの世界"}</h2>
            </div>
            <p className={styles.worldLead}>
              {locale === "en"
                ? "Loading opponent and same-generation records."
                : "対戦相手と同世代の記録を読み込んでいます。"}
            </p>
          </header>
          <div className={styles.loadingState}>{locale === "en" ? "Loading..." : "読み込み中..."}</div>
        </div>
      </section>
    );
  }

  const narrative = buildCareerWorldNarrativeForLocale(summary, locale);
  const position = formatCareerPositionForLocale(summary, locale);
  const keyCards = buildKeyCardsForLocale(summary, locale);
  const rivalVMs = buildRivalViewModels(summary);
  const peerSections = buildPeerSectionsForLocale(summary, locale);
  const eraStarVMs = buildEraStarViewModels(summary);
  const frequentOpponentItems = summary.rivals
    .slice(0, RELATION_PREVIEW_LIMIT)
    .map((item) => toOpponentItem(item, locale));
  const winningOpponents = summary.rivals.filter((r) => r.meetings > 0 && r.playerWins > r.npcWins);
  const difficultOpponents = summary.rivals.filter((r) => r.meetings > 0 && r.npcWins > r.playerWins);
  const winningOpponentItems = winningOpponents
    .slice(0, SECONDARY_PREVIEW_LIMIT)
    .map((item) => toOpponentItem(item, locale));
  const difficultOpponentItems = difficultOpponents
    .slice(0, SECONDARY_PREVIEW_LIMIT)
    .map((item) => toOpponentItem(item, locale));
  const peerMembers = peerSections.flatMap((section) =>
    section.members.map((member) => ({
      sectionTitle: section.heading,
      member,
    })),
  );
  const peerItems: RelationItem[] = peerMembers.slice(0, RELATION_PREVIEW_LIMIT).map(({ sectionTitle, member }) => ({
    id: member.id,
    name: member.shikona,
    meta: `${sectionTitle}${member.metaLabel ? ` / ${member.metaLabel}` : ""}`,
    description: member.description,
  }));
  const promotionRaceItems = summary.promotionRaceOpponents
    .slice(0, SECONDARY_PREVIEW_LIMIT)
    .map((item) => toOpponentItem(item, locale));
  const eraStarItems = summary.eraStars
    .slice(0, RELATION_PREVIEW_LIMIT)
    .map((item) => toEraStarItem(item, locale));
  const strongOpponentItems = summary.strongestOpponents
    .slice(0, SECONDARY_PREVIEW_LIMIT)
    .map((item) => toOpponentItem(item, locale));
  const relationMapNodes = buildRelationMapNodes(summary, locale);
  const hierarchyTiers = buildWorldHierarchyTiers(status.shikona, position, summary, locale);
  const eraPowerItems = buildEraPowerItems(bashoRows, locale);
  const eraPowerLabel = resolveEraPowerLabel(summary, eraPowerItems, locale);
  const peerDistribution = buildPeerDistribution(summary, position.highestRankLabel, locale);
  const timelineEvents = buildCareerTimelineEvents(status, peerDistribution, locale);
  const wallNetworkNodes = buildWallNetworkNodes(summary, locale);
  const relationScaleItems: RelationScaleItem[] = [
    {
      key: "rivals",
      label: locale === "en" ? "Opponents" : "対戦相手",
      count: rivalVMs.length,
      note: locale === "en" ? "Opponents with 2+ bouts" : "2戦以上の相手",
    },
    {
      key: "winning",
      label: locale === "en" ? "Winning Records" : "勝ち越し",
      count: winningOpponents.length,
      note: locale === "en" ? "Opponents he led in wins" : "白星が上回った相手",
    },
    {
      key: "difficult",
      label: locale === "en" ? "Difficult Matchups" : "苦手",
      count: difficultOpponents.length,
      note: locale === "en" ? "Opponents who led him in wins" : "黒星が上回った相手",
    },
    {
      key: "peers",
      label: locale === "en" ? "Same Generation" : "同世代",
      count: peerMembers.length,
      note: locale === "en" ? "Rikishi moving through the banzuke in the same period" : "同じ時期に番付を進んだ力士",
    },
    {
      key: "era",
      label: locale === "en" ? "Upper-Rank Figures" : "上位力士",
      count: eraStarVMs.length,
      note: locale === "en" ? "Upper-rank rikishi who shaped the era" : "時代を作った上位陣",
    },
  ];
  const opponentRecordItems: OpponentRecordItem[] = summary.rivals
    .filter((rival) => rival.meetings > 0)
    .slice(0, RELATION_PREVIEW_LIMIT)
    .map((rival) => ({
      id: rival.id,
      name: rival.shikona,
      recordLabel: formatRecordLabel(rival, locale),
      wins: rival.playerWins,
      losses: rival.npcWins,
      meetings: rival.meetings,
    }));
  const keyCardsSummary = formatPersonCount(keyCards.length, locale);
  const opponentSummary = locale === "en"
    ? `${formatPersonCount(rivalVMs.length, locale)} / winning ${formatPersonCount(winningOpponents.length, locale)} / difficult ${formatPersonCount(difficultOpponents.length, locale)}`
    : `${rivalVMs.length}人 / 勝ち越し${winningOpponents.length}人 / 苦手${difficultOpponents.length}人`;
  const peerSummary = locale === "en"
    ? `${formatPersonCount(peerMembers.length, locale)} / shared wall ${formatPersonCount(summary.promotionRaceOpponents.length, locale)}`
    : `${peerMembers.length}人 / 同じ壁${summary.promotionRaceOpponents.length}人`;
  const eraSummary = locale === "en"
    ? `${formatPersonCount(eraStarVMs.length, locale)} / strong opponents ${formatPersonCount(summary.strongestOpponents.length, locale)}`
    : `${eraStarVMs.length}人 / 強い相手${summary.strongestOpponents.length}人`;
  const relationScaleSummary = formatItemCount(rivalVMs.length + peerMembers.length + eraStarVMs.length, locale);

  return (
    <section className={styles.section}>
      <div className={styles.worldPanel}>
        <header className={styles.worldHead}>
          <div>
            <span className={styles.worldKicker}>{locale === "en" ? "Relationships" : "関係性"}</span>
            <h2 className={styles.worldTitle}>{locale === "en" ? "Career World" : "このキャリアの世界"}</h2>
          </div>
          <p className={styles.worldLead}>
            {locale === "en"
              ? "A record of same-generation rikishi, opponents, and upper-rank figures that the banzuke alone cannot show."
              : "番付だけでは見えにくい、同世代・対戦相手・時代の上位力士との関係をまとめます。"}
          </p>
        </header>

        <ChapterSection
          title={locale === "en" ? "Relationship Overview" : "関係の全体像"}
          lead={locale === "en"
            ? "Read the era depth, peer peak, milestones, and career walls first."
            : "時代の厚み、同期の到達点、節目、壁を先に見る。"}
        >
          <div className={styles.insightGrid}>
            <EraPowerMap items={eraPowerItems} label={eraPowerLabel} locale={locale} />
            <PeerDistribution model={peerDistribution} locale={locale} />
            <CareerPositionTimeline events={timelineEvents} locale={locale} />
            <WallNetwork shikona={status.shikona} nodes={wallNetworkNodes} locale={locale} />
          </div>
        </ChapterSection>

        <ChapterSection
          title={locale === "en" ? "Career Position" : "一代の位置づけ"}
          lead={locale === "en"
            ? "First read which rank band and role this career occupied."
            : "まず、この力士がどの階級帯で、どんな役割の一代だったかを読む。"}
        >
          <div className={styles.worldHero}>
            <p className={styles.narrativeCard}>{narrative}</p>

            <div
              className={styles.positionCard}
              aria-label={locale === "en" ? "Career position" : "キャリアの位置づけ"}
            >
              <div className={styles.positionItem}>
                <span className={styles.positionLabel}>{locale === "en" ? "Highest Rank" : "最高位"}</span>
                <span className={styles.positionValue}>{position.highestRankLabel}</span>
              </div>
              <div className={styles.positionItem}>
                <span className={styles.positionLabel}>{locale === "en" ? "Type" : "タイプ"}</span>
                <span className={styles.positionValue}>{position.careerTypeLabel}</span>
              </div>
              <div className={styles.positionItem}>
                <span className={styles.positionLabel}>{locale === "en" ? "Standing" : "位置づけ"}</span>
                <span className={styles.positionValue}>{position.positionText}</span>
              </div>
              <div className={styles.positionItem}>
                <span className={styles.positionLabel}>{locale === "en" ? "Title" : "称号"}</span>
                <span className={styles.positionValue}>{position.title}</span>
              </div>
            </div>
          </div>
        </ChapterSection>

        <div
          className={styles.detailStack}
          aria-label={locale === "en" ? "Detailed relationship records" : "関係性の詳細記録"}
        >
          <DetailChapterSection
            title={locale === "en" ? "Banzuke Hierarchy Guide" : "番付階層の補助図"}
            lead={locale === "en"
              ? "Inspect the opening power map as named banzuke tiers."
              : "初期表示の勢力図を、相手名つきの階層で確認する。"}
            summary={formatItemCount(hierarchyTiers.reduce((sum, tier) => sum + tier.items.length, 0), locale)}
          >
            <div className={styles.overviewLegendRow}>
              <div
                className={styles.tierLegend}
                aria-label={locale === "en" ? "Rank-chip legend" : "段位チップ凡例"}
              >
                {[
                  [rankTierSymbol("yokozuna", locale), rankTierLabel("yokozuna", locale)],
                  [rankTierSymbol("ozeki", locale), rankTierLabel("ozeki", locale)],
                  [rankTierSymbol("sanyaku", locale), rankTierLabel("sanyaku", locale)],
                  [rankTierSymbol("maegashira", locale), rankTierLabel("maegashira", locale)],
                  [rankTierSymbol("juryo", locale), rankTierLabel("juryo", locale)],
                  [rankTierSymbol("makushita", locale), rankTierLabel("makushita", locale)],
                  [rankTierSymbol("lower", locale), rankTierLabel("lower", locale)],
                ].map(([symbol, label]) => (
                  <span key={symbol} className={styles.tierLegendItem}>
                    <span className={styles.tierLegendChip}>{symbol}</span>
                    <span>{label}</span>
                  </span>
                ))}
              </div>
              <div
                className={styles.compareLegend}
                aria-label={locale === "en" ? "Comparison badge meaning" : "比較バッジの意味"}
              >
                <span>{locale === "en" ? "Comparison Badge" : "比較バッジ"}</span>
                <strong>{relativePositionLabel("above", locale)}</strong>
                <strong>{relativePositionLabel("same", locale)}</strong>
                <strong>{relativePositionLabel("below", locale)}</strong>
                <strong>{relativePositionLabel("mixed", locale)}</strong>
              </div>
            </div>
            <WorldHierarchy tiers={hierarchyTiers} locale={locale} />
          </DetailChapterSection>

          <details className={styles.detailChapter}>
            <summary className={styles.detailSummary}>
              <span className={styles.detailSummaryText}>
                <span className={styles.detailTitle}>{locale === "en" ? "Head-To-Head Board" : "星取相関盤"}</span>
                <span className={styles.detailLead}>
                  {locale === "en"
                    ? "Open only when you need the bout record against key opponents."
                    : "必要なときだけ、主な相手との星取を確認する。"}
                </span>
              </span>
              <span className={styles.detailMeta}>
                <span className={styles.detailCount}>{formatPersonCount(relationMapNodes.length, locale)}</span>
                <span className={styles.detailAction} aria-hidden="true" />
              </span>
            </summary>
            <div className={styles.detailBody}>
              <RelationMap
                shikona={status.shikona}
                positionLabel={position.highestRankLabel}
                playerTier={resolveRankTier(position.highestRankLabel, locale)}
                nodes={relationMapNodes}
                locale={locale}
              />
            </div>
          </details>

          <DetailChapterSection
            title={locale === "en" ? "Relationship Span" : "関係の広がり"}
            lead={locale === "en"
              ? "Check how many opponents, peers, and upper-rank figures are attached to this career."
              : "対戦相手・同世代・時代の上位力士の量を確認する。"}
            summary={relationScaleSummary}
          >
            <RelationScaleChart items={relationScaleItems} locale={locale} />
          </DetailChapterSection>

          {keyCards.length > 0 ? (
            <DetailChapterSection
              title={locale === "en" ? "Key Figures" : "中心人物"}
              lead={locale === "en"
                ? "Read the representative figures from the relationship map in prose."
                : "関係図で見えた代表的な相手を、文章で確認する。"}
              summary={keyCardsSummary}
            >
              <div className={styles.keyCardGrid}>
                {keyCards.map((card) => (
                  <article key={`${card.kind}-${card.sourceId}`} className={styles.keyCard}>
                    <span className={styles.keyCardKicker}>{card.heading}</span>
                    <h3 className={styles.keyCardName}>{card.shikona}</h3>
                    <span className={styles.keyCardMeta}>{card.metaLabel}</span>
                    <p className={styles.keyCardDesc}>{card.description}</p>
                  </article>
                ))}
              </div>
            </DetailChapterSection>
          ) : null}

          <DetailChapterSection
            title={locale === "en" ? "Opponents" : "対戦相手"}
            lead={locale === "en"
              ? "Read the head-to-head bar breakdown opponent by opponent."
              : "対戦成績バーの内訳を、相手別に詳しく読む。"}
            summary={opponentSummary}
          >
            <OpponentRecordChart items={opponentRecordItems} locale={locale} />
            <div className={styles.relationGrid}>
              <RelationGroup
                title={locale === "en" ? "Frequent Opponents" : "よく当たった相手"}
                lead={locale === "en" ? "Sorted by bout count and relationship weight" : "対戦回数と関係性が濃い順"}
                count={rivalVMs.length}
                items={frequentOpponentItems}
                emptyCopy={emptyRivalsCopy(isRetired, locale)}
                locale={locale}
              />
              <RelationGroup
                title={locale === "en" ? "Winning Matchups" : "勝ち越した相手"}
                lead={locale === "en" ? "Opponents he led in wins" : "白星が上回った相手"}
                count={winningOpponents.length}
                items={winningOpponentItems}
                emptyCopy={locale === "en"
                  ? "No clearly winning matchup is recorded yet."
                  : "勝ち越しが目立つ相手はまだ確認できない。"}
                locale={locale}
              />
              <RelationGroup
                title={locale === "en" ? "Difficult Opponents" : "苦手だった相手"}
                lead={locale === "en" ? "Opponents who led him in wins" : "黒星が上回った相手"}
                count={difficultOpponents.length}
                items={difficultOpponentItems}
                emptyCopy={locale === "en"
                  ? "No clearly difficult opponent is recorded yet."
                  : "大きく負け越した相手はまだ確認できない。"}
                locale={locale}
              />
            </div>
          </DetailChapterSection>

          <DetailChapterSection
            title={locale === "en" ? "Same Generation" : "同世代"}
            lead={locale === "en"
              ? "Read the rikishi who stood beside him on the same wall in the hierarchy."
              : "階層図の同じ壁に並んだ力士を詳しく読む。"}
            summary={peerSummary}
          >
            <div className={styles.relationGrid}>
              <RelationGroup
                title={locale === "en" ? "Same-Generation Rikishi" : "同じ世代の力士"}
                count={peerMembers.length}
                items={peerItems}
                emptyCopy={emptyPeersCopy(isRetired, locale)}
                locale={locale}
              />
              <RelationGroup
                title={locale === "en" ? "Shared Promotion Wall" : "同じ壁に挑んだ力士"}
                count={summary.promotionRaceOpponents.length}
                items={promotionRaceItems}
                emptyCopy={locale === "en"
                  ? "No strongly overlapping promotion-race opponent is recorded."
                  : "昇進争いで強く重なった相手は確認できない。"}
                locale={locale}
              />
            </div>
          </DetailChapterSection>

          <DetailChapterSection
            title={locale === "en" ? "Era Context" : "時代背景"}
            lead={locale === "en"
              ? "Read the rikishi above him in the hierarchy and the strongest opponents around him."
              : "階層図の上段にいた力士と、強い相手を詳しく読む。"}
            summary={eraSummary}
          >
            <div className={styles.relationGrid}>
              <RelationGroup
                title={locale === "en" ? "Upper-Rank Figures" : "時代の上位力士"}
                count={eraStarVMs.length}
                items={eraStarItems}
                emptyCopy={emptyEraStarsCopy(locale)}
                locale={locale}
              />
              <RelationGroup
                title={locale === "en" ? "Strong Opponents" : "強い対戦相手"}
                count={summary.strongestOpponents.length}
                items={strongOpponentItems}
                emptyCopy={locale === "en"
                  ? "Records for especially strong opponents were limited."
                  : "特に強い対戦相手の記録は限定的だった。"}
                locale={locale}
              />
            </div>
          </DetailChapterSection>
        </div>
      </div>
    </section>
  );
};
