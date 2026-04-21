import React from "react";
import { BookUser, Save, Sparkles, Star, Swords, Trophy } from "lucide-react";
import { CONSTANTS } from "../../../logic/constants";
import { type RikishiStatus } from "../../../logic/models";
import {
  ensureStyleIdentityProfile,
  resolveDisplayedStrengthStyles,
  resolveDisplayedWeakStyles,
  resolveStyleLabelsOrFallback,
} from "../../../logic/style/identity";
import { TRAIT_CATEGORY_LABELS, formatTraitAcquisitionLabel } from "../../../logic/traits";
import { Button } from "../../../shared/ui/Button";
import { RikishiPortrait } from "../../../shared/ui/RikishiPortrait";
import { StatCard } from "../../../shared/ui/StatCard";
import { RankBadge } from "../../../shared/ui/RankBadge";
import type { CareerLedgerPoint, CareerOverviewModel } from "../utils/careerResultModel";
import type { DetailBuildProgress } from "../../../logic/simulation/workerProtocol";
import { WinRateTrendChart } from "./WinRateTrendChart";
import { BodyWeightChart } from "./BodyWeightChart";
import { TraitTimeline } from "./TraitTimeline";
import styles from "./CareerEncyclopediaChapter.module.css";

interface CareerEncyclopediaChapterProps {
  status: RikishiStatus;
  overview: CareerOverviewModel;
  highestRankLabel: string;
  ledgerPoints?: CareerLedgerPoint[];
  isSaved: boolean;
  detailState: "idle" | "building" | "ready" | "error";
  detailBuildProgress: DetailBuildProgress | null;
  onSave: () => void | Promise<void>;
  onReturnToScout: () => void;
}

const BODY_LABELS: Record<RikishiStatus["bodyType"], string> = {
  NORMAL: "均整型",
  SOPPU: "ソップ型",
  ANKO: "アンコ型",
  MUSCULAR: "筋骨型",
};

const toBodyTypeLabel = (raw: string | undefined, fallback: RikishiStatus["bodyType"]): string => {
  if (raw && BODY_LABELS[raw as keyof typeof BODY_LABELS]) {
    return BODY_LABELS[raw as keyof typeof BODY_LABELS];
  }
  if (raw && raw.length > 0) return raw;
  return BODY_LABELS[fallback];
};

const formatRecordText = (wins: number, losses: number, absent: number): string =>
  `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`;

const formatWinRate = (wins: number, losses: number): string => {
  const total = wins + losses;
  if (total <= 0) return "-";
  return `${((wins / total) * 100).toFixed(1)}%`;
};

const InfoCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <section className={styles.card}>
    <div className={styles.cardHead}>
      <span className={styles.cardIcon}>{icon}</span>
      <div className={styles.cardTitle}>{title}</div>
    </div>
    {children}
  </section>
);

const KeyValueGrid: React.FC<{
  rows: Array<{ label: string; value: string }>;
}> = ({ rows }) => (
  <div className={styles.grid}>
    {rows.map((row) => (
      <div key={row.label} className={styles.gridItem}>
        <span className={styles.gridItemLabel}>{row.label}</span>
        <strong className={styles.gridItemValue}>{row.value}</strong>
      </div>
    ))}
  </div>
);

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <div className={styles.sectionHead}>
    <span className={styles.sectionMark} />
    <span className={styles.sectionTitle}>{title}</span>
    <span className={styles.sectionRule} />
  </div>
);

export const CareerEncyclopediaChapter: React.FC<CareerEncyclopediaChapterProps> = ({
  status,
  overview,
  highestRankLabel,
  ledgerPoints,
  isSaved,
  detailState,
  detailBuildProgress,
  onSave,
  onReturnToScout,
}) => {
  const initial = status.buildSummary?.initialConditionSummary;
  const growth = status.buildSummary?.growthSummary;
  const narrative = status.careerNarrative;
  const learnedTraits = React.useMemo(
    () =>
      (status.traitJourney ?? [])
        .filter((entry) => entry.state === "LEARNED")
        .map((entry) => ({
          ...entry,
          data: CONSTANTS.TRAIT_DATA[entry.trait],
        })),
    [status.traitJourney],
  );
  const profileRows = React.useMemo(
    () =>
      [
        { label: "最高位", value: highestRankLabel },
        { label: "所属部屋", value: initial?.stableName ?? overview.stableName },
        { label: "出身地", value: initial?.birthplace ?? status.profile.birthplace },
        { label: "入門年齢", value: `${initial?.entryAge ?? status.entryAge}歳` },
        { label: "現在体格", value: `${Math.round(status.bodyMetrics.heightCm)}cm / ${Math.round(status.bodyMetrics.weightKg)}kg` },
        { label: "引退年齢", value: `${status.age}歳` },
      ].filter((row) => Boolean(row.value)),
    [highestRankLabel, initial?.birthplace, initial?.entryAge, initial?.stableName, overview.stableName, status.age, status.bodyMetrics.heightCm, status.bodyMetrics.weightKg, status.entryAge, status.profile.birthplace],
  );
  const subProfileRows = React.useMemo(
    () =>
      [
        initial?.entryPathLabel ? { label: "入門経路", value: initial.entryPathLabel } : null,
        initial?.temperamentLabel ? { label: "気質", value: initial.temperamentLabel } : null,
        initial?.bodySeedLabel ? { label: "身体の素地", value: initial.bodySeedLabel } : null,
        { label: "体型", value: toBodyTypeLabel(growth?.bodyTypeLabel, status.bodyType) },
      ].filter((row): row is { label: string; value: string } => Boolean(row)),
    [growth?.bodyTypeLabel, initial, status.bodyType],
  );
  const totalSansho = React.useMemo(
    () => status.history.records.reduce((sum, record) => sum + (record.specialPrizes?.length ?? 0), 0),
    [status.history.records],
  );
  const topMoves = React.useMemo(
    () =>
      Object.entries(status.history.kimariteTotal ?? {})
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([move]) => move),
    [status.history.kimariteTotal],
  );
  const styleIdentity = React.useMemo(
    () => ensureStyleIdentityProfile(status).styleIdentityProfile,
    [status],
  );
  const strengthLabel = React.useMemo(
    () => resolveStyleLabelsOrFallback(resolveDisplayedStrengthStyles(styleIdentity)),
    [styleIdentity],
  );
  const weaknessLabel = React.useMemo(
    () => resolveStyleLabelsOrFallback(resolveDisplayedWeakStyles(styleIdentity)),
    [styleIdentity],
  );
  const signatureLines = React.useMemo(() => {
    const lines: Array<{ label: string; value: string }> = [];
    lines.push({
      label: "得意な型",
      value: strengthLabel,
    });
    lines.push({
      label: "苦手な型",
      value: weaknessLabel,
    });
    const representativeMoves = [...new Set([...status.signatureMoves, ...topMoves].filter(Boolean))].slice(0, 3);
    if (representativeMoves.length > 0) {
      lines.push({
        label: "代表技",
        value: representativeMoves.join(" / "),
      });
    }
    return lines;
  }, [status.signatureMoves, strengthLabel, topMoves, weaknessLabel]);
  const recordRows = React.useMemo(
    () =>
      [
        { label: "通算成績", value: formatRecordText(status.history.totalWins, status.history.totalLosses, status.history.totalAbsent) },
        { label: "勝率", value: formatWinRate(status.history.totalWins, status.history.totalLosses) },
        { label: "幕内優勝", value: `${status.history.yushoCount.makuuchi}回` },
        totalSansho > 0 ? { label: "三賞", value: `${totalSansho}回` } : null,
        (status.history.records.some((record) => (record.kinboshi ?? 0) > 0))
          ? {
            label: "金星",
            value: `${status.history.records.reduce((sum, record) => sum + (record.kinboshi ?? 0), 0)}個`,
          }
          : null,
      ].filter((row): row is { label: string; value: string } => Boolean(row)),
    [status.history.records, status.history.totalAbsent, status.history.totalLosses, status.history.totalWins, status.history.yushoCount.makuuchi, totalSansho],
  );
  const memoLines = React.useMemo(
    () =>
      [
        narrative?.initialConditions,
        narrative?.careerIdentity,
        narrative?.growthArc,
        narrative?.retirementDigest,
      ].filter((line): line is string => Boolean(line)).slice(0, 3),
    [narrative?.careerIdentity, narrative?.growthArc, narrative?.initialConditions, narrative?.retirementDigest],
  );
  const saveDisabled = detailState !== "ready";
  const saveCopy = saveDisabled
    ? `記録整理中 ${detailBuildProgress?.flushedBashoCount ?? 0}/${detailBuildProgress?.totalBashoCount ?? status.history.records.length}。保存は整理完了後に開きます。`
    : "名鑑の内容を確認したうえで、この人生を残すか決められます。";

  const kpiStats = React.useMemo(() => {
    const nonMaezumoRecords = status.history.records.filter((r) => r.rank.division !== "Maezumo");
    const makuuchiBasho = nonMaezumoRecords.filter((r) => r.rank.division === "Makuuchi").length;
    const totalBasho = nonMaezumoRecords.length;
    const totalDecisions = status.history.totalWins + status.history.totalLosses;
    const winRate = totalDecisions > 0 ? ((status.history.totalWins / totalDecisions) * 100).toFixed(1) : "-";
    const yusho = status.history.yushoCount.makuuchi + status.history.yushoCount.juryo;
    const kinboshi = nonMaezumoRecords.reduce((sum, r) => sum + (r.kinboshi ?? 0), 0);
    return { makuuchiBasho, totalBasho, winRate, yusho, kinboshi };
  }, [status.history]);

  const bodyTimeline = status.history.bodyTimeline ?? [];
  const entryWeight = bodyTimeline.length > 0 ? bodyTimeline[0].weightKg : undefined;
  const peakWeight = bodyTimeline.length > 0 ? Math.max(...bodyTimeline.map((b) => b.weightKg)) : undefined;
  const traitAwakenings = status.history.traitAwakenings ?? [];
  const totalBashoForTimeline = status.history.records.filter((r) => r.rank.division !== "Maezumo").length;

  return (
    <section className={styles.shell}>
      <div className={styles.hero}>
        <div className={styles.copy}>
          <p className={styles.label}>力士名鑑</p>
          <h1 className={styles.name}>{status.shikona}</h1>
          <div className={styles.rank}>{highestRankLabel}</div>
          <div className={styles.origin}>
            {initial?.birthplace ?? overview.birthplace} / {initial?.stableName ?? overview.stableName}
          </div>
          <p className={styles.summary}>
            {memoLines[0] ?? overview.lifeSummary}
          </p>
          <div className={styles.summaryRow}>
            <div className={styles.summaryMetric}>
              <span className={styles.summaryMetricLabel}>通算</span>
              <strong className={styles.summaryMetricValue}>{overview.totalRecordLabel}</strong>
            </div>
            <div className={styles.summaryMetric}>
              <span className={styles.summaryMetricLabel}>勝率</span>
              <strong className={styles.summaryMetricValue}>{overview.winRateLabel}</strong>
            </div>
            <div className={styles.summaryMetric}>
              <span className={styles.summaryMetricLabel}>在位</span>
              <strong className={styles.summaryMetricValue}>{overview.careerPeriodLabel}</strong>
            </div>
          </div>
        </div>

        <div className={styles.portraitDock}>
          <RikishiPortrait
            bodyType={status.bodyType}
            className={styles.portrait}
            innerClassName={styles.portraitInner}
            presentation="blend"
          />
        </div>
      </div>

      <div className={styles.actions}>
        {!isSaved ? (
          <>
            <div className={styles.actionCopy}>
              <div className={styles.label}>保存判断</div>
              <div className={styles.text}>{saveCopy}</div>
            </div>
            <div className={styles.actionButtons}>
              <Button size="lg" disabled={saveDisabled} onClick={() => void onSave()}>
                <Save className="mr-2 h-4 w-4" />
                {saveDisabled ? "記録整理中" : "この人生を保存する"}
              </Button>
              <Button variant="outline" onClick={onReturnToScout}>
                保存せず次の新弟子へ
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.actionCopy}>
              <div className={styles.label}>保存済み</div>
              <div className={styles.text}>力士名鑑を起点に、番付推移と場所別でこの人生を掘り下げていきます。</div>
            </div>
            <Button variant="ghost" size="sm" onClick={onReturnToScout}>
              新弟子設計へ戻る
            </Button>
          </>
        )}
      </div>

      <div className={styles.section}>
        <SectionHeading title="名跡要覧" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="在位場所数"
            value={kpiStats.totalBasho}
            subtext={kpiStats.makuuchiBasho > 0 ? `幕内 ${kpiStats.makuuchiBasho}場所` : undefined}
          />
          <StatCard
            label="通算勝率"
            value={`${kpiStats.winRate}%`}
            subtext={`${status.history.totalWins}勝${status.history.totalLosses}敗`}
            tone="win"
          />
          <StatCard
            label="最高位"
            value={(
              <RankBadge
                division={status.history.maxRank.division}
                name={highestRankLabel}
                size="sm"
              />
            )}
          />
          <StatCard
            label="幕内場所"
            value={kpiStats.makuuchiBasho}
            subtext="幕内在位"
            tone="gold"
          />
          <StatCard
            label="優勝"
            value={`${kpiStats.yusho}回`}
            subtext={status.history.yushoCount.makuuchi > 0 ? `幕内 ${status.history.yushoCount.makuuchi}回` : undefined}
            tone={kpiStats.yusho > 0 ? "gold" : "default"}
          />
          <StatCard
            label="金星"
            value={`${kpiStats.kinboshi}個`}
            tone={kpiStats.kinboshi > 0 ? "action" : "default"}
          />
        </div>
      </div>

      {(ledgerPoints && ledgerPoints.length > 4) || bodyTimeline.length > 4 ? (
        <div className={styles.section}>
          <SectionHeading title="軌跡図譜" />
          <div className={styles.chartGrid}>
            {ledgerPoints && ledgerPoints.length > 4 ? (
              <WinRateTrendChart points={ledgerPoints} />
            ) : null}
            {bodyTimeline.length > 4 ? (
              <BodyWeightChart
                bodyTimeline={bodyTimeline}
                entryWeight={entryWeight}
                peakWeight={peakWeight}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={styles.section}>
        <SectionHeading title="基本帳面" />
        <div className={styles.layout}>
          <InfoCard title="基本データ票" icon={<BookUser className="h-4 w-4" />}>
            <KeyValueGrid rows={profileRows} />
            {subProfileRows.length > 0 ? (
              <>
                <div className={styles.subtitle}>補足</div>
                <KeyValueGrid rows={subProfileRows} />
              </>
            ) : null}
          </InfoCard>

          <InfoCard title="力士像の補足" icon={<Swords className="h-4 w-4" />}>
            {signatureLines.length > 0 ? (
              <div className={styles.stack}>
                {signatureLines.map((line) => (
                  <div key={line.label} className={styles.note}>
                    <span className={styles.noteLabel}>{line.label}</span>
                    <strong className={styles.noteValue}>{line.value}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>得意な技はまだ定まっていません。</div>
            )}

            <div className={styles.subtitle}>人物メモ</div>
            <div className={styles.stack}>
              {(memoLines.length > 1 ? memoLines.slice(1) : [overview.lifeSummary]).map((line) => (
                <p key={line} className={styles.copyLine}>{line}</p>
              ))}
            </div>

            <div className={styles.subtitle}>特性</div>
            {learnedTraits.length > 0 ? (
              <div className={styles.traits}>
                {learnedTraits.map((entry) => (
                  <article key={`${entry.trait}-${entry.learnedAtBashoSeq ?? "legacy"}`} className={styles.trait}>
                    <div className={styles.traitHead}>
                      <strong className={styles.traitTitle}>{entry.data?.name ?? entry.trait}</strong>
                      <span className={styles.traitMeta}>
                        {TRAIT_CATEGORY_LABELS[entry.data?.category ?? ""] ?? "特性"} / {formatTraitAcquisitionLabel(entry)}
                      </span>
                    </div>
                    <p className={styles.traitBody}>{entry.data?.description ?? entry.triggerDetail ?? "特性の説明は記録されていません。"}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>記録された特性はありません。</div>
            )}
          </InfoCard>

          <InfoCard title="主要実績" icon={<Trophy className="h-4 w-4" />}>
            <KeyValueGrid rows={recordRows} />
            {topMoves.length > 0 ? (
              <div className={styles.recordNote}>
                <Star className="h-3.5 w-3.5" />
                <span className={styles.text}>勝ち筋に多かった決まり手: {topMoves.join(" / ")}</span>
              </div>
            ) : null}
            {memoLines.length > 0 ? (
              <div className={styles.recordNote}>
                <Sparkles className="h-3.5 w-3.5" />
                <span className={styles.text}>{memoLines[0]}</span>
              </div>
            ) : null}
          </InfoCard>
        </div>
      </div>

      {traitAwakenings.length > 0 ? (
        <div className={styles.section}>
          <SectionHeading title="特性年譜" />
          <TraitTimeline traitAwakenings={traitAwakenings} totalBasho={totalBashoForTimeline} />
        </div>
      ) : null}
    </section>
  );
};
