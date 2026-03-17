import React from "react";
import { Award, Gauge, Sparkles, Trophy, Activity } from "lucide-react";
import { CareerClearScoreSummary, resolveCareerRecordBadgeLabel } from "../../../logic/career/clearScore";
import { RikishiStatus } from "../../../logic/models";
import { formatRankDisplayName } from "../utils/reportFormatters";

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
  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
      <section className="surface-panel space-y-6 flex flex-col justify-center">
        <div className="flex items-center gap-2 text-gold/70">
          <Sparkles className="h-4 w-4" />
          <span className="ui-text-label text-[10px] uppercase tracking-widest">力士総括 - CAREER SUMMARY</span>
        </div>
        <p className="text-lg leading-relaxed text-text sm:text-2xl ui-text-heading tracking-tight border-l-4 border-gold/20 pl-6 py-2 bg-gradient-to-r from-gold/5 to-transparent">
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

      <section className="surface-panel space-y-4 border-gold/10 bg-bg-panel/30 backdrop-blur-sm">
        <div className="panel-title text-[10px] ui-text-label text-gold/60 border-b border-gold/10 pb-2">総評点内訳</div>
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
      <div className="flex items-center gap-2 text-gold/70">
        <Award className="h-4 w-4" />
        <span className="ui-text-label text-[10px] uppercase tracking-widest">記録バッジ明細 - BADGE DETAILS</span>
      </div>
      {clearScore.badges.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clearScore.badges.map((badge) => (
            <div key={badge.key} className="surface-card p-4 border-gold/10 hover:border-gold/40 group transition-all duration-300">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="ui-text-label text-sm text-text group-hover:text-gold transition-colors">{resolveCareerRecordBadgeLabel(badge.key)}</div>
                <div className="text-xs ui-text-metric text-award">+{badge.scoreBonus}</div>
              </div>
              <p className="text-xs leading-relaxed text-text-dim group-hover:text-text transition-colors italic">{badge.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="surface-panel p-8 text-center text-text-dim text-sm italic border-dashed border-gold-muted/20">
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
  <div className="metric-card border-gold-muted/10 group hover:border-gold/30 transition-all flex flex-col justify-between min-h-[80px]">
    <div className="flex items-center justify-between mb-1">
      <div className="text-[10px] ui-text-label text-text-dim group-hover:text-gold/70 transition-colors uppercase">{label}</div>
      {icon && <div className="opacity-40 group-hover:opacity-100 transition-opacity">{icon}</div>}
    </div>
    <div className={`text-xl ui-text-metric leading-tight break-words ${tone === "award" ? "text-award drop-shadow-[0_0_8px_rgba(196,154,77,0.3)]" : "text-text"}`}>
      {value}
    </div>
  </div>
);

const OverviewHint: React.FC<{
  icon: React.ReactNode;
  title: string;
  text: string;
}> = ({ icon, title, text }) => (
  <div className="surface-card p-4 border-gold/10 bg-bg/20 backdrop-blur-sm">
    <div className="mb-2 flex items-center gap-2 text-text">
      {icon}
      <span className="ui-text-label text-xs tracking-wider">{title}</span>
    </div>
    <p className="text-xs leading-relaxed text-text-dim italic border-l border-gold/20 pl-3">{text}</p>
  </div>
);
