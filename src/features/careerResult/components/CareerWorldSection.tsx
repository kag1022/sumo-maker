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

interface RelationMapNode {
  id: string;
  role: string;
  name: string;
  meta: string;
  tone: RelationNodeTone;
  slot: RelationNodeSlot;
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
}

interface HierarchyTier {
  key: string;
  label: string;
  note: string;
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
        <span className={styles.openText}>開く</span>
        <span className={styles.closeText}>閉じる</span>
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
  nodes: RelationMapNode[];
}

const RelationMap: React.FC<RelationMapProps> = ({ shikona, positionLabel, nodes }) => (
  <div className={styles.relationMap} aria-label="このキャリアの関係図">
    <div className={styles.mapCenter}>
      <span className={styles.mapCenterLabel}>本人</span>
      <strong className={styles.mapCenterName}>{shikona}</strong>
      <span className={styles.mapCenterMeta}>{positionLabel}</span>
    </div>
    {nodes.length === 0 ? (
      <div className={styles.mapEmpty}>関係図に出せる相手の記録はまだ少ない。</div>
    ) : (
      nodes.map((node) => (
        <article
          key={`${node.tone}-${node.id}`}
          className={`${styles.mapNode} ${styles[node.slot]} ${resolveMapToneClass(node.tone)}`}
        >
          <span className={styles.mapNodeRole}>{node.role}</span>
          <strong className={styles.mapNodeName}>{node.name}</strong>
          <span className={styles.mapNodeMeta}>{node.meta}</span>
        </article>
      ))
    )}
  </div>
);

interface WorldHierarchyProps {
  tiers: HierarchyTier[];
}

const WorldHierarchy: React.FC<WorldHierarchyProps> = ({ tiers }) => (
  <div className={styles.hierarchyDiagram} aria-label="番付と関係の階層図">
    {tiers.map((tier) => (
      <section key={tier.key} className={styles.hierarchyTier}>
        <header className={styles.hierarchyTierHead}>
          <span className={styles.hierarchyTierLabel}>{tier.label}</span>
          <span className={styles.hierarchyTierNote}>{tier.note}</span>
        </header>
        <div className={styles.hierarchyItems}>
          {tier.items.length === 0 ? (
            <span className={styles.hierarchyEmpty}>該当する記録なし</span>
          ) : (
            tier.items.map((item) => (
              <span
                key={item.id}
                className={`${styles.hierarchyItem} ${item.isPlayer ? styles.hierarchyPlayer : ""}`}
              >
                <strong className={styles.hierarchyName}>{item.name}</strong>
                <span className={styles.hierarchyMeta}>{item.meta}</span>
              </span>
            ))
          )}
        </div>
      </section>
    ))}
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
  meta: `${formatPeakMeta(n)} / ${formatRecordLabel(n)}`,
});

const toHierarchyEraStar = (s: EraStarNpcSummary): HierarchyItem => ({
  id: s.id,
  name: s.shikona,
  meta: `${s.peakRankLabel}${formatEraStarYushoNote(s) ? ` / ${formatEraStarYushoNote(s)}` : ""}`,
});

const buildWorldHierarchyTiers = (
  shikona: string,
  position: ReturnType<typeof formatCareerPosition>,
  summary: CareerWorldSummary,
): HierarchyTier[] => {
  const sameWall = summary.promotionRaceOpponents.length > 0
    ? summary.promotionRaceOpponents
    : summary.generationPeers;

  return [
    {
      key: "eraTop",
      label: "時代の上位",
      note: "本人の上にいた物差し",
      items: summary.eraStars.slice(0, 4).map(toHierarchyEraStar),
    },
    {
      key: "player",
      label: "本人の到達点",
      note: "この一代の最高到達点",
      items: [
        {
          id: "player",
          name: shikona,
          meta: `${position.highestRankLabel} / ${position.careerTypeLabel}`,
          isPlayer: true,
        },
      ],
    },
    {
      key: "sameWall",
      label: "同じ壁",
      note: "同世代・昇進争いで重なった相手",
      items: sameWall.slice(0, 4).map(toHierarchyOpponent),
    },
    {
      key: "direct",
      label: "直接対戦",
      note: "土俵で関係が濃かった相手",
      items: summary.rivals.slice(0, 5).map(toHierarchyOpponent),
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
          <WorldHierarchy tiers={hierarchyTiers} />
          <div className={styles.visualOverview}>
            <RelationMap
              shikona={status.shikona}
              positionLabel={position.highestRankLabel}
              nodes={relationMapNodes}
            />
            <div className={styles.visualCharts}>
              <RelationScaleChart items={relationScaleItems} />
              <OpponentRecordChart items={opponentRecordItems} />
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
