import React from "react";
import type { RikishiStatus } from "../../../logic/models";
import { listCareerPlayerBoutsByBasho } from "../../../logic/persistence/careerHistory";
import type {
  CareerBashoRecordsBySeq,
  CareerPlayerBoutsByBasho,
} from "../../../logic/persistence/shared";
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

const emptyRivalsCopy = (isRetired: boolean): string =>
  isRetired
    ? "記録上、強く印象に残る対戦相手は確認できなかった。"
    : "このキャリアでは、強く印象に残る対戦相手はまだ現れていない。";

const emptyPeersCopy = (isRetired: boolean): string =>
  isRetired
    ? "記録上、強く印象に残る同世代の力士は確認できなかった。"
    : "同世代力士の記録は少ないが、今後のキャリアで関係性が生まれる可能性がある。";

const emptyEraStarsCopy = (): string =>
  "このキャリア期間中、上位番付で目立った力士の記録は限定的だった。";

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

const RANK_TIER_FALLBACK: RankTierMeta = {
  key: "unknown",
  level: -1,
  symbol: "?",
  shortLabel: "不明",
};

const resolveRankTier = (label?: string | null): RankTierMeta => {
  if (!label) return RANK_TIER_FALLBACK;
  if (label.startsWith("横綱")) return { key: "yokozuna", level: 6, symbol: "横", shortLabel: "横綱" };
  if (label.startsWith("大関")) return { key: "ozeki", level: 5, symbol: "大", shortLabel: "大関" };
  if (label.startsWith("関脇")) return { key: "sanyaku", level: 4, symbol: "役", shortLabel: "三役" };
  if (label.startsWith("小結")) return { key: "sanyaku", level: 4, symbol: "役", shortLabel: "三役" };
  if (label.startsWith("前頭")) return { key: "maegashira", level: 3, symbol: "前", shortLabel: "前頭" };
  if (label.startsWith("十両")) return { key: "juryo", level: 2, symbol: "両", shortLabel: "十両" };
  if (label.startsWith("幕下")) return { key: "makushita", level: 1, symbol: "幕", shortLabel: "幕下" };
  if (label.startsWith("三段目")) return { key: "lower", level: 0, symbol: "下", shortLabel: "下位" };
  if (label.startsWith("序二段")) return { key: "lower", level: 0, symbol: "下", shortLabel: "下位" };
  if (label.startsWith("序")) return { key: "lower", level: 0, symbol: "下", shortLabel: "下位" };
  return RANK_TIER_FALLBACK;
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

const positionLabelMap: Record<RelativePosition, string> = {
  above: "上位多め",
  same: "同格中心",
  below: "下位多め",
  mixed: "上下混在",
  unknown: "比較なし",
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

const RelationGroup: React.FC<RelationGroupProps> = ({ title, lead, count, items, emptyCopy }) => {
  const hiddenCount = Math.max(0, count - items.length);

  return (
    <section className={styles.relationGroup}>
      <header className={styles.relationHead}>
        <div className={styles.relationLabelStack}>
          <span className={styles.relationTitle}>{title}</span>
          {lead ? <span className={styles.relationLead}>{lead}</span> : null}
        </div>
        <span className={styles.relationCount}>{count}人</span>
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
      {hiddenCount > 0 ? <div className={styles.moreCount}>ほか {hiddenCount}人</div> : null}
    </section>
  );
};

interface RelationMapProps {
  shikona: string;
  positionLabel: string;
  playerTier: RankTierMeta;
  nodes: RelationMapNode[];
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

const formatRelationBoardRecord = (record?: RelationNodeRecord): string =>
  record && record.meetings > 0 ? `${record.meetings}戦${record.wins}勝${record.losses}敗` : "番付上の関係";

const formatRelationBoardMeta = (node: RelationMapNode): string | null => {
  if (node.record && node.meta === formatRelationBoardRecord(node.record)) return null;
  return node.meta;
};

const RelationMap: React.FC<RelationMapProps> = ({ shikona, positionLabel, playerTier, nodes }) => {
  const rows = nodes.slice(0, 8);

  return (
    <div className={styles.relationMap} aria-label="星取相関盤">
      <header className={styles.relationBoardHead}>
        <div className={styles.relationBoardSubject}>
          {playerTier.key !== "unknown" ? (
            <span
              className={`${styles.tierChip} ${styles.tierChipLg} ${rankTierClassMap[playerTier.key]}`}
              title={playerTier.shortLabel}
              aria-label={`最高位 ${playerTier.shortLabel}`}
            >
              {playerTier.symbol}
            </span>
          ) : null}
          <span className={styles.relationBoardSubjectText}>
            <span className={styles.mapCenterLabel}>本人</span>
            <strong className={styles.mapCenterName}>{shikona}</strong>
            <span className={styles.mapCenterMeta}>{positionLabel}</span>
          </span>
        </div>
        <div className={styles.relationBoardLegend} aria-label="星取凡例">
          <span><span className={styles.starWin} />白星</span>
          <span><span className={styles.starLoss} />黒星</span>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className={styles.mapEmpty}>相関盤に出せる相手の記録はまだ少ない。</div>
      ) : (
        <div className={styles.relationBoardTable}>
          <div className={styles.relationBoardHeader} aria-hidden="true">
            <span>関係</span>
            <span>相手</span>
            <span>最高位</span>
            <span>対戦</span>
            <span>星取</span>
          </div>
          {rows.map((node) => {
            const marks = buildStarMarks(node.record);
            const boardMeta = formatRelationBoardMeta(node);
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
                      aria-label={`最高位 ${node.tier.shortLabel}`}
                    >
                      {node.tier.symbol}
                    </span>
                  ) : (
                    <span className={`${styles.tierChip} ${styles.tierChipEmpty}`} aria-hidden="true" />
                  )}
                  <span>{node.tier.shortLabel}</span>
                </span>
                <span className={styles.relationRecordText}>{formatRelationBoardRecord(node.record)}</span>
                <span className={styles.starStrip} aria-label={formatRelationBoardRecord(node.record)}>
                  {marks.length > 0 ? (
                    marks.map((mark, index) => (
                      <span
                        key={`${node.id}-${mark}-${index}`}
                        className={mark === "win" ? styles.starWin : styles.starLoss}
                      />
                    ))
                  ) : (
                    <span className={styles.starNoRecord}>番付</span>
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
}

const WorldHierarchy: React.FC<WorldHierarchyProps> = ({ tiers }) => (
  <div className={styles.hierarchyDiagram} aria-label="番付と関係の階層図">
    <aside className={styles.hierarchyAxis} aria-hidden="true">
      <span className={styles.hierarchyAxisCap}>上位</span>
      <span className={styles.hierarchyAxisLine} />
      <span className={styles.hierarchyAxisCap}>下位</span>
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
                  {positionLabelMap[tier.positionBadge]}
                </span>
              ) : null}
            </div>
            <span className={styles.hierarchyTierNote}>{tier.note}</span>
          </header>
          <div className={styles.hierarchyItems}>
            {tier.items.length === 0 ? (
              <span className={styles.hierarchyEmpty}>該当する記録なし</span>
            ) : (
              tier.items.map((item) => {
                const itemTier = item.tier ?? RANK_TIER_FALLBACK;
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
                        aria-label={`最高位 ${itemTier.shortLabel}`}
                      >
                        {itemTier.symbol}
                      </span>
                    ) : (
                      <span className={`${styles.tierChip} ${styles.tierChipEmpty}`} aria-hidden="true" />
                    )}
                    <span className={styles.hierarchyItemBody}>
                      <strong className={styles.hierarchyName}>
                        {item.isPlayer ? <span className={styles.hierarchyPlayerMark}>本</span> : null}
                        {item.name}
                      </strong>
                      <span className={styles.hierarchyMeta}>{item.meta}</span>
                      {winRatio !== null && item.record ? (
                        <span
                          className={styles.hierarchyItemRecord}
                          aria-label={`${item.record.wins}勝${item.record.losses}敗`}
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
}

const RelationScaleChart: React.FC<RelationScaleChartProps> = ({ items }) => {
  const maxCount = Math.max(1, ...items.map((item) => item.count));

  return (
    <div className={styles.scaleChart} aria-label="関係カテゴリの件数">
      <header className={styles.visualCardHead}>
        <span className={styles.visualCardTitle}>関係の広がり</span>
        <span className={styles.visualCardNote}>多い項目ほど線が長い</span>
      </header>
      <div className={styles.scaleList}>
        {items.map((item) => {
          const width = item.count > 0 ? `${Math.max(6, (item.count / maxCount) * 100)}%` : "0%";
          return (
            <div key={item.key} className={styles.scaleRow}>
              <div className={styles.scaleLabelLine}>
                <span className={styles.scaleLabel}>{item.label}</span>
                <span className={styles.scaleCount}>{item.count}人</span>
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
}

const OpponentRecordChart: React.FC<OpponentRecordChartProps> = ({ items }) => (
  <div className={styles.recordChart} aria-label="主な対戦相手との勝敗">
    <header className={styles.visualCardHead}>
      <span className={styles.visualCardTitle}>対戦成績の偏り</span>
      <span className={styles.visualCardNote}>白星 / 黒星</span>
    </header>
    <div className={styles.recordList}>
      {items.length === 0 ? (
        <div className={styles.compactEmpty}>2戦以上の対戦相手がまだいない。</div>
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

const formatRecordLabel = (n: NotableNpcSummary): string =>
  n.meetings > 0 ? `${n.meetings}戦${n.playerWins}勝${n.npcWins}敗` : "対戦記録なし";

const toOpponentItem = (n: NotableNpcSummary): RelationItem => ({
  id: n.id,
  name: n.shikona,
  meta: `${n.peakRankLabel ? `最高位 ${n.peakRankLabel} / ` : ""}${formatRecordLabel(n)}`,
  description: formatRivalDescription(n),
});

const toEraStarItem = (s: EraStarNpcSummary): RelationItem => ({
  id: s.id,
  name: s.shikona,
  meta: `${s.peakRankLabel}${formatEraStarYushoNote(s) ? ` / ${formatEraStarYushoNote(s)}` : ""}`,
  description: formatDominanceLabel(s),
});

const formatPeakMeta = (n: NotableNpcSummary): string =>
  n.peakRankLabel ? `最高位 ${n.peakRankLabel}` : "番付記録あり";

const toNpcRecord = (n: NotableNpcSummary): RelationNodeRecord | undefined =>
  n.meetings > 0
    ? { wins: n.playerWins, losses: n.npcWins, meetings: n.meetings }
    : undefined;

const buildRelationMapNodes = (summary: CareerWorldSummary): RelationMapNode[] => {
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
        role: "対戦の中心",
        name: mainRival.shikona,
        meta: formatRecordLabel(mainRival),
        tone: "rival",
        tier: resolveRankTier(mainRival.peakRankLabel),
        record: toNpcRecord(mainRival),
      }
      : null,
  );

  const raceOpponent = summary.promotionRaceOpponents[0];
  addNode(
    raceOpponent
      ? {
        id: raceOpponent.id,
        role: "昇進争い",
        name: raceOpponent.shikona,
        meta: `${formatPeakMeta(raceOpponent)} / ${formatRecordLabel(raceOpponent)}`,
        tone: "race",
        tier: resolveRankTier(raceOpponent.peakRankLabel),
        record: toNpcRecord(raceOpponent),
      }
      : null,
  );

  const peer = summary.generationPeers[0];
  addNode(
    peer
      ? {
        id: peer.id,
        role: "同世代",
        name: peer.shikona,
        meta: formatPeakMeta(peer),
        tone: "peer",
        tier: resolveRankTier(peer.peakRankLabel),
        record: toNpcRecord(peer),
      }
      : null,
  );

  const eraStar = summary.eraStars[0];
  addNode(
    eraStar
      ? {
        id: eraStar.id,
        role: "時代の上位",
        name: eraStar.shikona,
        meta: `${eraStar.peakRankLabel}${formatEraStarYushoNote(eraStar) ? ` / ${formatEraStarYushoNote(eraStar)}` : ""}`,
        tone: "era",
        tier: resolveRankTier(eraStar.peakRankLabel),
      }
      : null,
  );

  const strongOpponent = summary.strongestOpponents[0];
  addNode(
    strongOpponent
      ? {
        id: strongOpponent.id,
        role: "強い相手",
        name: strongOpponent.shikona,
        meta: `${formatPeakMeta(strongOpponent)} / ${formatRecordLabel(strongOpponent)}`,
        tone: "strong",
        tier: resolveRankTier(strongOpponent.peakRankLabel),
        record: toNpcRecord(strongOpponent),
      }
      : null,
  );

  return nodes.map((node, index) => ({
    ...node,
    slot: RELATION_NODE_SLOTS[index],
  }));
};

const toHierarchyOpponent = (n: NotableNpcSummary): HierarchyItem => ({
  id: n.id,
  name: n.shikona,
  meta: formatPeakMeta(n),
  tier: resolveRankTier(n.peakRankLabel),
  record: toNpcRecord(n),
});

const toHierarchyEraStar = (s: EraStarNpcSummary): HierarchyItem => ({
  id: s.id,
  name: s.shikona,
  meta: `${s.peakRankLabel}${formatEraStarYushoNote(s) ? ` / ${formatEraStarYushoNote(s)}` : ""}`,
  tier: resolveRankTier(s.peakRankLabel),
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
): HierarchyTier[] => {
  const sameWall = summary.promotionRaceOpponents.length > 0
    ? summary.promotionRaceOpponents
    : summary.generationPeers;
  const playerTier = resolveRankTier(position.highestRankLabel);
  const eraStarItems = summary.eraStars.slice(0, 3).map(toHierarchyEraStar);
  const sameWallItems = sameWall.slice(0, 3).map(toHierarchyOpponent);
  const rivalItems = summary.rivals.slice(0, 3).map(toHierarchyOpponent);

  return [
    {
      key: "eraTop",
      label: "時代の上位",
      note: "本人の上にいた物差し",
      positionBadge: eraStarItems.length > 0 ? aggregateTierPosition(eraStarItems, playerTier) : "above",
      items: eraStarItems,
    },
    {
      key: "player",
      label: "本人の到達点",
      note: "この一代の最高到達点",
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
      label: "同じ壁",
      note: "同世代・昇進争いで重なった相手",
      positionBadge: sameWallItems.length > 0 ? aggregateTierPosition(sameWallItems, playerTier) : "same",
      items: sameWallItems,
    },
    {
      key: "direct",
      label: "直接対戦",
      note: "土俵で関係が濃かった相手",
      positionBadge: rivalItems.length > 0 ? aggregateTierPosition(rivalItems, playerTier) : undefined,
      items: rivalItems,
    },
  ];
};

export const CareerWorldSection: React.FC<CareerWorldSectionProps> = ({
  status,
  careerId,
  bashoRows,
  isRetired = false,
}) => {
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
              <span className={styles.worldKicker}>関係性</span>
              <h2 className={styles.worldTitle}>このキャリアの世界</h2>
            </div>
            <p className={styles.worldLead}>対戦相手と同世代の記録を読み込んでいます。</p>
          </header>
          <div className={styles.loadingState}>読み込み中...</div>
        </div>
      </section>
    );
  }

  const narrative = buildCareerWorldNarrative(summary, summary.rarity);
  const position = formatCareerPosition(summary.rarity);
  const keyCards = selectKeyNpcCards(summary);
  const rivalVMs = buildRivalViewModels(summary);
  const peerSections = buildPeerSections(summary);
  const eraStarVMs = buildEraStarViewModels(summary);
  const frequentOpponentItems = summary.rivals.slice(0, RELATION_PREVIEW_LIMIT).map(toOpponentItem);
  const winningOpponents = summary.rivals.filter((r) => r.meetings > 0 && r.playerWins > r.npcWins);
  const difficultOpponents = summary.rivals.filter((r) => r.meetings > 0 && r.npcWins > r.playerWins);
  const winningOpponentItems = winningOpponents.slice(0, SECONDARY_PREVIEW_LIMIT).map(toOpponentItem);
  const difficultOpponentItems = difficultOpponents.slice(0, SECONDARY_PREVIEW_LIMIT).map(toOpponentItem);
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
  const promotionRaceItems = summary.promotionRaceOpponents.slice(0, SECONDARY_PREVIEW_LIMIT).map(toOpponentItem);
  const eraStarItems = summary.eraStars.slice(0, RELATION_PREVIEW_LIMIT).map(toEraStarItem);
  const strongOpponentItems = summary.strongestOpponents.slice(0, SECONDARY_PREVIEW_LIMIT).map(toOpponentItem);
  const relationMapNodes = buildRelationMapNodes(summary);
  const hierarchyTiers = buildWorldHierarchyTiers(status.shikona, position, summary);
  const relationScaleItems: RelationScaleItem[] = [
    {
      key: "rivals",
      label: "対戦相手",
      count: rivalVMs.length,
      note: "2戦以上の相手",
    },
    {
      key: "winning",
      label: "勝ち越し",
      count: winningOpponents.length,
      note: "白星が上回った相手",
    },
    {
      key: "difficult",
      label: "苦手",
      count: difficultOpponents.length,
      note: "黒星が上回った相手",
    },
    {
      key: "peers",
      label: "同世代",
      count: peerMembers.length,
      note: "同じ時期に番付を進んだ力士",
    },
    {
      key: "era",
      label: "上位力士",
      count: eraStarVMs.length,
      note: "時代を作った上位陣",
    },
  ];
  const opponentRecordItems: OpponentRecordItem[] = summary.rivals
    .filter((rival) => rival.meetings > 0)
    .slice(0, RELATION_PREVIEW_LIMIT)
    .map((rival) => ({
      id: rival.id,
      name: rival.shikona,
      recordLabel: formatRecordLabel(rival),
      wins: rival.playerWins,
      losses: rival.npcWins,
      meetings: rival.meetings,
    }));
  const keyCardsSummary = `${keyCards.length}人`;
  const opponentSummary = `${rivalVMs.length}人 / 勝ち越し${winningOpponents.length}人 / 苦手${difficultOpponents.length}人`;
  const peerSummary = `${peerMembers.length}人 / 同じ壁${summary.promotionRaceOpponents.length}人`;
  const eraSummary = `${eraStarVMs.length}人 / 強い相手${summary.strongestOpponents.length}人`;
  const relationScaleSummary = `${rivalVMs.length + peerMembers.length + eraStarVMs.length}件`;

  return (
    <section className={styles.section}>
      <div className={styles.worldPanel}>
        <header className={styles.worldHead}>
          <div>
            <span className={styles.worldKicker}>関係性</span>
            <h2 className={styles.worldTitle}>このキャリアの世界</h2>
          </div>
          <p className={styles.worldLead}>
            番付だけでは見えにくい、同世代・対戦相手・時代の上位力士との関係をまとめます。
          </p>
        </header>

        <ChapterSection
          title="関係の全体像"
          lead="本人を中心に、相手との距離感と関係の量を先に見る。"
        >
          <div className={styles.overviewLegendRow}>
            <div className={styles.tierLegend} aria-label="段位チップ凡例">
              {[
                ["横", "横綱"],
                ["大", "大関"],
                ["役", "三役"],
                ["前", "前頭"],
                ["両", "十両"],
                ["幕", "幕下"],
                ["下", "下位"],
              ].map(([symbol, label]) => (
                <span key={symbol} className={styles.tierLegendItem}>
                  <span className={styles.tierLegendChip}>{symbol}</span>
                  <span>{label}</span>
                </span>
              ))}
            </div>
            <div className={styles.compareLegend} aria-label="比較バッジの意味">
              <span>比較バッジ</span>
              <strong>上位多め</strong>
              <strong>同格中心</strong>
              <strong>下位多め</strong>
              <strong>上下混在</strong>
            </div>
          </div>
          <WorldHierarchy tiers={hierarchyTiers} />
          <div className={styles.visualOverview}>
            <OpponentRecordChart items={opponentRecordItems} />
            <div className={styles.desktopRelationBoard}>
              <RelationMap
                shikona={status.shikona}
                positionLabel={position.highestRankLabel}
                playerTier={resolveRankTier(position.highestRankLabel)}
                nodes={relationMapNodes}
              />
            </div>
          </div>
        </ChapterSection>

        <ChapterSection
          title="一代の位置づけ"
          lead="まず、この力士がどの階級帯で、どんな役割の一代だったかを読む。"
        >
          <div className={styles.worldHero}>
            <p className={styles.narrativeCard}>{narrative}</p>

            <div className={styles.positionCard} aria-label="キャリアの位置づけ">
              <div className={styles.positionItem}>
                <span className={styles.positionLabel}>最高位</span>
                <span className={styles.positionValue}>{position.highestRankLabel}</span>
              </div>
              <div className={styles.positionItem}>
                <span className={styles.positionLabel}>タイプ</span>
                <span className={styles.positionValue}>{position.careerTypeLabel}</span>
              </div>
              <div className={styles.positionItem}>
                <span className={styles.positionLabel}>位置づけ</span>
                <span className={styles.positionValue}>{position.positionText}</span>
              </div>
              <div className={styles.positionItem}>
                <span className={styles.positionLabel}>称号</span>
                <span className={styles.positionValue}>{position.title}</span>
              </div>
            </div>
          </div>
        </ChapterSection>

        <div className={styles.detailStack} aria-label="関係性の詳細記録">
          <details className={styles.mobileRelationDetails}>
            <summary className={styles.detailSummary}>
              <span className={styles.detailSummaryText}>
                <span className={styles.detailTitle}>星取相関盤</span>
                <span className={styles.detailLead}>主な相手との関係を星取表風に見る。</span>
              </span>
              <span className={styles.detailMeta}>
                <span className={styles.detailCount}>{relationMapNodes.length}人</span>
                <span className={styles.detailAction} aria-hidden="true" />
              </span>
            </summary>
            <div className={styles.detailBody}>
              <RelationMap
                shikona={status.shikona}
                positionLabel={position.highestRankLabel}
                playerTier={resolveRankTier(position.highestRankLabel)}
                nodes={relationMapNodes}
              />
            </div>
          </details>

          <DetailChapterSection
            title="関係の広がり"
            lead="対戦相手・同世代・時代の上位力士の量を確認する。"
            summary={relationScaleSummary}
          >
            <RelationScaleChart items={relationScaleItems} />
          </DetailChapterSection>

          {keyCards.length > 0 ? (
            <DetailChapterSection
              title="中心人物"
              lead="関係図で見えた代表的な相手を、文章で確認する。"
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
            title="対戦相手"
            lead="対戦成績バーの内訳を、相手別に詳しく読む。"
            summary={opponentSummary}
          >
            <div className={styles.relationGrid}>
              <RelationGroup
                title="よく当たった相手"
                lead="対戦回数と関係性が濃い順"
                count={rivalVMs.length}
                items={frequentOpponentItems}
                emptyCopy={emptyRivalsCopy(isRetired)}
              />
              <RelationGroup
                title="勝ち越した相手"
                lead="白星が上回った相手"
                count={winningOpponents.length}
                items={winningOpponentItems}
                emptyCopy="勝ち越しが目立つ相手はまだ確認できない。"
              />
              <RelationGroup
                title="苦手だった相手"
                lead="黒星が上回った相手"
                count={difficultOpponents.length}
                items={difficultOpponentItems}
                emptyCopy="大きく負け越した相手はまだ確認できない。"
              />
            </div>
          </DetailChapterSection>

          <DetailChapterSection
            title="同世代"
            lead="階層図の同じ壁に並んだ力士を詳しく読む。"
            summary={peerSummary}
          >
            <div className={styles.relationGrid}>
              <RelationGroup
                title="同じ世代の力士"
                count={peerMembers.length}
                items={peerItems}
                emptyCopy={emptyPeersCopy(isRetired)}
              />
              <RelationGroup
                title="同じ壁に挑んだ力士"
                count={summary.promotionRaceOpponents.length}
                items={promotionRaceItems}
                emptyCopy="昇進争いで強く重なった相手は確認できない。"
              />
            </div>
          </DetailChapterSection>

          <DetailChapterSection
            title="時代背景"
            lead="階層図の上段にいた力士と、強い相手を詳しく読む。"
            summary={eraSummary}
          >
            <div className={styles.relationGrid}>
              <RelationGroup
                title="時代の上位力士"
                count={eraStarVMs.length}
                items={eraStarItems}
                emptyCopy={emptyEraStarsCopy()}
              />
              <RelationGroup
                title="強い対戦相手"
                count={summary.strongestOpponents.length}
                items={strongOpponentItems}
                emptyCopy="特に強い対戦相手の記録は限定的だった。"
              />
            </div>
          </DetailChapterSection>
        </div>
      </div>
    </section>
  );
};
