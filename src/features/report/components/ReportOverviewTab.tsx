import React from "react";
import { Award, Gauge, Sparkles, Trophy, Activity } from "lucide-react";
import { CareerClearScoreSummary, resolveCareerRecordBadgeLabel } from "../../../logic/career/clearScore";
import { RikishiStatus } from "../../../logic/models";
import { cn } from "../../../shared/lib/cn";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import { formatRankDisplayName } from "../utils/reportFormatters";
import styles from "./ReportOverviewTab.module.css";

interface ReportOverviewTabProps {
  status: RikishiStatus;
  achievementSummary: string;
  winRate: string;
  clearScore: CareerClearScoreSummary;
  awardsSummary: {
    kinboshi: number;
    totalSansho: number;
  };
}

export const ReportOverviewTab: React.FC<ReportOverviewTabProps> = ({
  status,
  achievementSummary,
  winRate,
  clearScore,
  awardsSummary,
}) => (
  <div className={cn(styles.root, "animate-in fade-in slide-in-from-bottom-2 duration-500")}>
    <div className={styles.heroGrid}>
      <section className={cn(surface.panel, "flex flex-col justify-center space-y-6")}>
        <div className={styles.heroLabelRow}>
          <Sparkles className="h-4 w-4" />
          <span className={cn(typography.label, "text-[10px] uppercase tracking-widest")}>力士総括 - CAREER SUMMARY</span>
        </div>
        <p className={cn(styles.heroSummary, typography.heading, "text-text")}>
          {achievementSummary}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-4">
          <OverviewFact
            label="最高位"
            value={formatRankDisplayName(status.history.maxRank)}
            icon={<Trophy className="w-3.5 h-3.5" />}
          />
          <OverviewFact label="通算勝率" value={`${winRate}%`} icon={<Activity className="w-3.5 h-3.5 text-action" />} />
          <OverviewFact
            label="幕内優勝"
            value={`${status.history.yushoCount.makuuchi}回`}
            icon={<Award className="w-3.5 h-3.5 text-award" />}
          />
          <OverviewFact
            label="金星 / 三賞"
            value={`${awardsSummary.kinboshi} / ${awardsSummary.totalSansho}`}
            icon={<Sparkles className="w-3.5 h-3.5 text-gold" />}
          />
        </div>
      </section>

      <section className={cn(surface.panel, styles.scorePanel, "space-y-4 backdrop-blur-sm")}>
        <div className={cn(styles.scoreHeader, typography.label, "text-[10px] text-gold/60")}>総評点内訳</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <OverviewFact label="総合" value={`${clearScore.clearScore}`} tone="award" />
          <OverviewFact label="競技" value={`${clearScore.competitiveScore}`} />
          <OverviewFact label="記録" value={`${clearScore.recordBonus}`} />
        </div>
        <div className="space-y-2 mt-4">
          <OverviewHint
            icon={<Gauge className="h-4 w-4 text-action/60" />}
            title="殿堂入り基準"
            text={`${formatRankDisplayName(status.history.maxRank)}の到達価値を最重視した絶対評価です。`}
          />
          <OverviewHint
            icon={<Trophy className="h-4 w-4 text-award/60" />}
            title="土俵の実績"
            text="優勝、三賞、金星など、本場所での具体的成果を合算しています。"
          />
          <OverviewHint
            icon={<Award className="h-4 w-4 text-state/60" />}
            title="記録の重み"
            text="図鑑に刻まれる独自の達成項目をボーナスとして加点しました。"
          />
        </div>
      </section>
    </div>

    <section className="space-y-4 pt-4">
      <div className={styles.sectionLabelRow}>
        <Award className="h-4 w-4" />
        <span className={cn(typography.label, "text-[10px] uppercase tracking-widest")}>記録バッジ明細 - BADGE DETAILS</span>
      </div>
      {clearScore.badges.length > 0 ? (
        <div className={styles.badgeGrid}>
          {clearScore.badges.map((badge) => (
            <div key={badge.key} className={cn(surface.card, surface.interactiveCard, styles.badgeCard)}>
              <div className={styles.badgeHeader}>
                <div className={cn(styles.badgeLabel, typography.label, "text-sm text-text")}>{resolveCareerRecordBadgeLabel(badge.key)}</div>
                <div className={cn(typography.metric, "text-xs text-award")}>+{badge.scoreBonus}</div>
              </div>
              <p className="text-xs leading-relaxed text-text-dim italic">{badge.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className={cn(surface.emptyState, "p-8 text-center text-sm italic text-text-dim")}>
          特筆すべき記録バッジはまだありません。今後の精進が期待されます。
        </div>
      )}
    </section>
  </div>
);

const OverviewFact: React.FC<{ label: string; value: string; icon?: React.ReactNode; tone?: string }> = ({
  label,
  value,
  icon,
  tone,
}) => (
  <div className={cn(surface.metric, styles.factCard, "border-gold-muted/10")}>
    <div className={styles.factHeader}>
      <div className={cn(styles.factLabel, typography.label)}>{label}</div>
      {icon && <div className={styles.factIcon}>{icon}</div>}
    </div>
    <div className={cn(styles.factValue, typography.metric, tone === "award" ? "text-award" : "text-text")} data-tone={tone === "award" ? "award" : "default"}>
      {value}
    </div>
  </div>
);

const OverviewHint: React.FC<{
  icon: React.ReactNode;
  title: string;
  text: string;
}> = ({ icon, title, text }) => (
  <div className={cn(surface.card, styles.hintCard, "border-gold/10")}>
    <div className={styles.hintHeader}>
      {icon}
      <span className={cn(typography.label, "text-xs tracking-wider")}>{title}</span>
    </div>
    <p className={cn(styles.hintCopy, "text-xs leading-relaxed text-text-dim italic")}>{text}</p>
  </div>
);
