import React from "react";
import { type RikishiStatus } from "../../../../logic/models";
import { useLocale } from "../../../../shared/hooks/useLocale";
import { RankBadge } from "../../../../shared/ui/RankBadge";
import { RikishiPortrait } from "../../../../shared/ui/RikishiPortrait";
import type { CareerOverviewModel } from "../../utils/careerResultModel";
import { BracketFrame } from "./BracketFrame";
import { DataSheet, type DataSheetRow } from "./DataSheet";
import { ModuleHeader } from "./ModuleHeader";
import { SignalLed } from "./SignalLed";
import styles from "./SubjectCard.module.css";

interface SubjectCardProps {
  status: RikishiStatus;
  overview: CareerOverviewModel;
  highestRankLabel: string;
  observationPointsAwarded?: number;
  coverSummaryLine: string;
  coverReadingLine: string;
  profileRows: DataSheetRow[];
  subjectId: string;
  isSaved: boolean;
  detailReady: boolean;
}

const BODY_LABELS: Record<RikishiStatus["bodyType"], string> = {
  NORMAL: "均整型",
  SOPPU: "ソップ型",
  ANKO: "アンコ型",
  MUSCULAR: "筋骨型",
};

const BODY_LABELS_EN: Record<RikishiStatus["bodyType"], string> = {
  NORMAL: "Balanced",
  SOPPU: "Lean",
  ANKO: "Heavy",
  MUSCULAR: "Muscular",
};

const computeGaugeFill = (winRate: string): number => {
  const match = winRate.match(/([\d.]+)%/);
  if (!match) return 0.5;
  const pct = Number.parseFloat(match[1]);
  if (Number.isNaN(pct)) return 0.5;
  return Math.min(1, Math.max(0, pct / 100));
};

export const SubjectCard: React.FC<SubjectCardProps> = ({
  status,
  overview,
  highestRankLabel,
  observationPointsAwarded,
  coverSummaryLine,
  coverReadingLine,
  profileRows,
}) => {
  const { locale } = useLocale();
  const winRateFill = computeGaugeFill(overview.winRateLabel);
  const observationCount = observationPointsAwarded ?? 0;
  const observationFill = Math.min(1, observationCount / 100);
  const bodyLabel = locale === "en"
    ? BODY_LABELS_EN[status.bodyType] ?? status.bodyType
    : BODY_LABELS[status.bodyType] ?? status.bodyType;

  return (
    <BracketFrame variant="subject" padding="zero" bodyClassName={styles.card}>
      <div className={styles.top}>
        <div className={styles.portraitCol}>
          <div className={styles.colLabel}>
            <span>{locale === "en" ? "Rikishi Form" : "力士の姿"}</span>
            <em>{bodyLabel}</em>
          </div>
          <div className={styles.portraitStage}>
            <span className={styles.reticleCorner} data-corner="tl" aria-hidden="true" />
            <span className={styles.reticleCorner} data-corner="tr" aria-hidden="true" />
            <span className={styles.reticleCorner} data-corner="bl" aria-hidden="true" />
            <span className={styles.reticleCorner} data-corner="br" aria-hidden="true" />
            <RikishiPortrait
              bodyType={status.bodyType}
              bodyMetrics={status.bodyMetrics}
              rank={status.history.maxRank}
              className={styles.portrait}
              innerClassName={styles.portraitInner}
              presentation="blend"
            />
          </div>
        </div>

        <div className={styles.coverCol}>
          <div className={styles.coverHeader}>
            <div className={styles.coverKicker}>
              <SignalLed state="locked" size="sm" />
              <span>{locale === "en" ? "Career Record" : "力士名鑑"}</span>
            </div>
            <h1 className={styles.shikona}>{status.shikona}</h1>
            <div className={styles.rankLine}>
              <RankBadge division={status.history.maxRank.division} name={highestRankLabel} size="sm" />
              <span>{overview.birthplace} ／ {overview.stableName}</span>
            </div>
          </div>

          <div className={styles.statementBlock}>
            <p className={styles.statement}>{coverSummaryLine}</p>
            <div className={styles.note}>
              <span>{locale === "en" ? "Entry Premise" : "入口条件"}</span>
              <strong>{coverReadingLine}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.gaugeStrip}>
        <article className={styles.gauge} data-tone="primary">
          <div className={styles.gaugeLabel}>
            <SignalLed state="locked" size="sm" />
            <span>{locale === "en" ? "Career" : "通算"}</span>
          </div>
          <div className={styles.gaugeValue}>
            <strong>{overview.totalRecordLabel}</strong>
          </div>
          <div className={styles.gaugeBar} aria-hidden="true">
            <span style={{ width: "100%" }} />
          </div>
        </article>
        <article className={styles.gauge} data-tone="state">
          <div className={styles.gaugeLabel}>
            <SignalLed state="active" size="sm" />
            <span>{locale === "en" ? "Win Rate" : "勝率"}</span>
          </div>
          <div className={styles.gaugeValue}>
            <strong>{overview.winRateLabel}</strong>
          </div>
          <div className={styles.gaugeBar} aria-hidden="true">
            <span style={{ width: `${Math.round(winRateFill * 100)}%` }} />
          </div>
        </article>
        <article className={styles.gauge}>
          <div className={styles.gaugeLabel}>
            <span>{locale === "en" ? "Span" : "在位"}</span>
          </div>
          <div className={styles.gaugeValue}>
            <strong>{overview.careerPeriodLabel}</strong>
          </div>
          <div className={styles.gaugeBar} aria-hidden="true">
            <span style={{ width: "82%" }} />
          </div>
        </article>
        <article className={styles.gauge} data-tone="primary">
          <div className={styles.gaugeLabel}>
            <SignalLed state="locked" size="sm" />
            <span>{locale === "en" ? "Observation" : "観測点"}</span>
          </div>
          <div className={styles.gaugeValue}>
            <strong>{observationCount}</strong>
            <small>{locale === "en" ? "OP" : "点"}</small>
          </div>
          <div className={styles.gaugeBar} aria-hidden="true">
            <span style={{ width: `${Math.round(observationFill * 100)}%` }} />
          </div>
        </article>
      </div>

      <div className={styles.profileRow}>
        <div className={styles.profileHead}>
          <ModuleHeader
            kicker={locale === "en" ? "Basic Info" : "基本情報"}
            title={locale === "en" ? "Profile" : "プロフィール"}
            size="sm"
            density="compact"
          />
        </div>
        <DataSheet rows={profileRows} layout="grid" mono />
      </div>
    </BracketFrame>
  );
};
