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

interface ChapterSectionProps {
  title: string;
  lead: string;
  children: React.ReactNode;
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

const ChapterSection: React.FC<ChapterSectionProps> = ({ title, lead, children }) => (
  <section className={styles.chapterSection}>
    <header className={styles.chapterHead}>
      <h3 className={styles.chapterTitle}>{title}</h3>
      <p className={styles.chapterLead}>{lead}</p>
    </header>
    {children}
  </section>
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

        {keyCards.length > 0 ? (
          <ChapterSection
            title="中心人物"
            lead="この一代を読むときに、最初に押さえておきたい相手。"
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
          </ChapterSection>
        ) : null}

        <ChapterSection
          title="対戦相手"
          lead="対戦数、勝ち越し、苦手だった相手を分けて読む。"
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
        </ChapterSection>

        <ChapterSection
          title="同世代"
          lead="同じ時期に番付を進んだ力士と、昇進争いで重なった相手。"
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
        </ChapterSection>

        <ChapterSection
          title="時代背景"
          lead="本人の番付だけでなく、その時代の上位陣と強い対戦相手から読む。"
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
        </ChapterSection>
      </div>
    </section>
  );
};
