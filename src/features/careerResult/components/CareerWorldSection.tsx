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
  selectKeyNpcCards,
  buildRivalViewModels,
  buildPeerSections,
  buildEraStarViewModels,
  type CareerWorldSummary,
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

interface RelationColumnProps {
  title: string;
  count: number;
  items: RelationItem[];
  emptyCopy: string;
}

const RELATION_PREVIEW_LIMIT = 5;

const RelationColumn: React.FC<RelationColumnProps> = ({ title, count, items, emptyCopy }) => {
  const hiddenCount = Math.max(0, count - items.length);

  return (
    <section className={styles.relationColumn}>
      <header className={styles.relationHead}>
        <span className={styles.relationTitle}>{title}</span>
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
  const rivalItems: RelationItem[] = rivalVMs.slice(0, RELATION_PREVIEW_LIMIT).map((r) => ({
    id: r.id,
    name: r.shikona,
    meta: `${r.peakRankLabel ? `最高位 ${r.peakRankLabel} / ` : ""}${r.recordLabel}`,
    description: r.description,
  }));
  const peerMembers = peerSections.flatMap((section) =>
    section.members.map((member) => ({
      sectionTitle: section.heading,
      member,
    })),
  );
  const peerItems: RelationItem[] = peerMembers.slice(0, RELATION_PREVIEW_LIMIT).map(({ sectionTitle, member }) => ({
    id: member.id,
    name: member.shikona,
    meta: `${sectionTitle} / ${member.metaLabel}`,
    description: member.description,
  }));
  const eraStarItems: RelationItem[] = eraStarVMs.slice(0, RELATION_PREVIEW_LIMIT).map((s) => ({
    id: s.id,
    name: s.shikona,
    meta: `${s.peakRankLabel}${s.yushoNote ? ` / ${s.yushoNote}` : ""}`,
    description: s.description,
  }));

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

        {keyCards.length > 0 ? (
          <section className={styles.keyPeople}>
            <header className={styles.keyPeopleHead}>
              <span className={styles.keyPeopleTitle}>中心人物</span>
              <span className={styles.keyPeopleCopy}>この一代を読むときに軸になる相手</span>
            </header>
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
          </section>
        ) : null}

        <div className={styles.relationGrid}>
          <RelationColumn
            title="よく当たった相手"
            count={rivalVMs.length}
            items={rivalItems}
            emptyCopy={emptyRivalsCopy(isRetired)}
          />
          <RelationColumn
            title="同世代"
            count={peerMembers.length}
            items={peerItems}
            emptyCopy={emptyPeersCopy(isRetired)}
          />
          <RelationColumn
            title="時代の上位力士"
            count={eraStarVMs.length}
            items={eraStarItems}
            emptyCopy={emptyEraStarsCopy()}
          />
        </div>
      </div>
    </section>
  );
};
