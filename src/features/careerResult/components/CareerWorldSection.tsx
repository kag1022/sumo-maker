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

interface EraPowerMapProps {
  items: EraPowerItem[];
  label: string;
}

const EraPowerMap: React.FC<EraPowerMapProps> = ({ items, label }) => {
  const maxCount = Math.max(1, ...items.map((item) => item.count));

  return (
    <section className={`${styles.visualBlock} ${styles.eraPowerBlock}`} aria-label="時代の番付勢力図">
      <header className={styles.visualBlockHead}>
        <span className={styles.visualBlockKicker}>時代の番付勢力図</span>
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
}

const PeerDistribution: React.FC<PeerDistributionProps> = ({ model }) => {
  const maxCount = Math.max(1, ...model.bins.map((bin) => bin.count));

  return (
    <section className={styles.visualBlock} aria-label="同期最高位分布">
      <header className={styles.visualBlockHead}>
        <span className={styles.visualBlockKicker}>同期最高位分布</span>
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
              <div className={styles.peerDots} aria-label={`${bin.label} ${bin.count}人`}>
                <span style={{ height }} />
                {bin.isPlayerTier ? <strong aria-label="本人の最高位">◎</strong> : null}
              </div>
              <span className={`${styles.tierChip} ${chipClass}`}>{rankTierSymbol(bin.key)}</span>
              <em>{bin.count}人</em>
            </div>
          );
        })}
      </div>
      <p className={styles.visualBlockNote}>
        ◎は本人の最高到達点。同期の中でどの高さまで届いたかを見る。
      </p>
    </section>
  );
};

interface CareerPositionTimelineProps {
  events: CareerTimelineEvent[];
}

const CareerPositionTimeline: React.FC<CareerPositionTimelineProps> = ({ events }) => (
  <section className={styles.visualBlock} aria-label="キャリア位置タイムライン">
    <header className={styles.visualBlockHead}>
      <span className={styles.visualBlockKicker}>キャリア位置タイムライン</span>
      <strong className={styles.visualBlockTitle}>節目だけで読む一代</strong>
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
}

const WallNetwork: React.FC<WallNetworkProps> = ({ shikona, nodes }) => (
  <section className={styles.visualBlock} aria-label="宿敵・壁ネットワーク">
    <header className={styles.visualBlockHead}>
      <span className={styles.visualBlockKicker}>宿敵・壁ネットワーク</span>
      <strong className={styles.visualBlockTitle}>関係の意味だけを見る</strong>
    </header>
    <div className={styles.wallNetwork}>
      <div className={styles.wallHub}>
        <span>本人</span>
        <strong>{shikona}</strong>
      </div>
      <div className={styles.wallNodes}>
        {nodes.length === 0 ? (
          <div className={styles.compactEmpty}>関係性として強く残る相手はまだ少ない。</div>
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

const ERA_POWER_DEFS: Array<Pick<EraPowerItem, "key" | "label" | "shortLabel">> = [
  { key: "yokozuna", label: "横綱", shortLabel: "横" },
  { key: "ozeki", label: "大関", shortLabel: "大" },
  { key: "sanyaku", label: "三役", shortLabel: "役" },
  { key: "makuuchiTop", label: "幕内上位", shortLabel: "前" },
  { key: "juryoWall", label: "十両壁", shortLabel: "両" },
];

const buildEraPowerItems = (bashoRows: CareerBashoRecordsBySeq[]): EraPowerItem[] => {
  const counts = new Map<EraPowerKey, number>();
  for (const row of bashoRows.flatMap((basho) => basho.rows)) {
    if (row.entityType !== "NPC") continue;
    const key = resolvePowerKey(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const bashoCount = Math.max(1, bashoRows.length);
  return ERA_POWER_DEFS.map((definition) => {
    const count = counts.get(definition.key) ?? 0;
    const average = Math.round((count / bashoCount) * 10) / 10;
    return {
      ...definition,
      count,
      average,
      note: average > 0 ? `平均${average}人` : "記録少",
    };
  });
};

const resolveEraPowerLabel = (
  summary: CareerWorldSummary,
  items: EraPowerItem[],
): string => {
  const yokozunaAvg = items.find((item) => item.key === "yokozuna")?.average ?? 0;
  const ozekiAvg = items.find((item) => item.key === "ozeki")?.average ?? 0;
  const sanyakuAvg = items.find((item) => item.key === "sanyaku")?.average ?? 0;
  const activeTop = summary.eraStars.length;
  if (yokozunaAvg + ozekiAvg >= 2.4 && activeTop <= 4) return "上位固定期";
  if (activeTop >= 6 || sanyakuAvg >= 3.5) return "混戦期";
  if (summary.generationPeers.length + summary.promotionRaceOpponents.length >= 8) return "世代交代期";
  return "標準的な番付環境";
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
): PeerDistributionModel => {
  const peers = uniqueNotables([
    ...summary.generationPeers,
    ...summary.promotionRaceOpponents,
    ...summary.rivals.filter((rival) => rival.rivalryKinds.includes("sameGeneration")),
  ]);
  const playerTier = resolveRankTier(highestRankLabel);
  const counts = new Map<RankTierKey, number>();
  for (const peer of peers) {
    const tier = resolveRankTier(peer.peakRankLabel);
    if (tier.key === "unknown") continue;
    counts.set(tier.key, (counts.get(tier.key) ?? 0) + 1);
  }
  const higherCount = peers.filter((peer) => resolveRankTier(peer.peakRankLabel).level > playerTier.level).length;
  const total = peers.length + 1;
  const rankText =
    total > 1
      ? `同期${total}人中 上から${higherCount + 1}番目`
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
      label: rankTierLabel(key),
      count: counts.get(key) ?? 0,
      isPlayerTier: key === playerTier.key,
    })),
  };
};

const rankTierLabel = (key: RankTierKey): string => {
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

const rankTierSymbol = (key: RankTierKey): string => {
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

const formatAgeAtBasho = (status: RikishiStatus, bashoIndex: number): string =>
  `${status.entryAge + Math.floor(Math.max(0, bashoIndex) / 6)}歳`;

const buildTimelineEvent = (
  key: string,
  label: string,
  record: RikishiStatus["history"]["records"][number],
  index: number,
  status: RikishiStatus,
  context: string,
  tone: CareerTimelineEvent["tone"],
): CareerTimelineEvent => ({
  key,
  label,
  bashoLabel: formatBashoLabel(record.year, record.month),
  ageLabel: formatAgeAtBasho(status, index),
  rankLabel: formatRankDisplayName(record.rank),
  context,
  tone,
});

const buildCareerTimelineEvents = (
  status: RikishiStatus,
  peerDistribution: PeerDistributionModel,
): CareerTimelineEvent[] => {
  const records = status.history.records.filter((record) => record.rank.division !== "Maezumo");
  if (records.length === 0) return [];
  const events: CareerTimelineEvent[] = [];
  const first = records[0];
  events.push(buildTimelineEvent("entry", "入門", first, 0, status, "この一代の観測が始まる。", "entry"));

  const firstJuryoIndex = records.findIndex((record) =>
    record.rank.division === "Juryo" || record.rank.division === "Makuuchi",
  );
  if (firstJuryoIndex >= 0) {
    events.push(
      buildTimelineEvent(
        "juryo",
        "十両到達",
        records[firstJuryoIndex],
        firstJuryoIndex,
        status,
        peerDistribution.rankText,
        "promotion",
      ),
    );
  }

  const firstMakuuchiIndex = records.findIndex((record) => record.rank.division === "Makuuchi");
  if (firstMakuuchiIndex >= 0) {
    events.push(
      buildTimelineEvent(
        "makuuchi",
        "幕内到達",
        records[firstMakuuchiIndex],
        firstMakuuchiIndex,
        status,
        "番付の上位環境に直接触れた節目。",
        "promotion",
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
      "最高位",
      records[highestIndex],
      highestIndex,
      status,
      peerDistribution.rankText,
      "peak",
    ),
  );

  const lastIndex = records.length - 1;
  events.push(
    buildTimelineEvent(
      "last",
      "終幕",
      records[lastIndex],
      lastIndex,
      status,
      "最後に残った番付と記録。",
      "exit",
    ),
  );

  return events.filter((event, index, array) =>
    array.findIndex((candidate) => candidate.key === event.key || candidate.bashoLabel === event.bashoLabel && candidate.label === event.label) === index,
  );
};

const buildWallNetworkNodes = (summary: CareerWorldSummary): WallNetworkNode[] => {
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
      label: "最多対戦",
      name: byMeetings.shikona,
      meta: formatRecordLabel(byMeetings),
      note: "土俵で最も接点が多かった相手。",
      tone: "rival",
    });
  }
  if (nemesis && nemesis.id !== byMeetings?.id) {
    nodes.push({
      key: "wall",
      label: "壁",
      name: nemesis.shikona,
      meta: formatRecordLabel(nemesis),
      note: "黒星が先行し、キャリアの壁として残った相手。",
      tone: "strong",
    });
  }
  if (favorite && favorite.id !== byMeetings?.id && favorite.id !== nemesis?.id) {
    nodes.push({
      key: "favorite",
      label: "得意",
      name: favorite.shikona,
      meta: formatRecordLabel(favorite),
      note: "白星が先行し、上昇を支えた相手。",
      tone: "peer",
    });
  }
  return nodes;
};

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
  const eraPowerItems = buildEraPowerItems(bashoRows);
  const eraPowerLabel = resolveEraPowerLabel(summary, eraPowerItems);
  const peerDistribution = buildPeerDistribution(summary, position.highestRankLabel);
  const timelineEvents = buildCareerTimelineEvents(status, peerDistribution);
  const wallNetworkNodes = buildWallNetworkNodes(summary);
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
          lead="時代の厚み、同期の到達点、節目、壁を先に見る。"
        >
          <div className={styles.insightGrid}>
            <EraPowerMap items={eraPowerItems} label={eraPowerLabel} />
            <PeerDistribution model={peerDistribution} />
            <CareerPositionTimeline events={timelineEvents} />
            <WallNetwork shikona={status.shikona} nodes={wallNetworkNodes} />
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
          <DetailChapterSection
            title="番付階層の補助図"
            lead="初期表示の勢力図を、相手名つきの階層で確認する。"
            summary={`${hierarchyTiers.reduce((sum, tier) => sum + tier.items.length, 0)}件`}
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
          </DetailChapterSection>

          <details className={styles.detailChapter}>
            <summary className={styles.detailSummary}>
              <span className={styles.detailSummaryText}>
                <span className={styles.detailTitle}>星取相関盤</span>
                <span className={styles.detailLead}>必要なときだけ、主な相手との星取を確認する。</span>
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
            <OpponentRecordChart items={opponentRecordItems} />
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
