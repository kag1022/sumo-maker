import React from "react";
import { Award, Gauge, Sparkles, Trophy } from "lucide-react";
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
  <div className="space-y-4 animate-in">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
      <section className="surface-panel space-y-4">
        <div className="flex items-center gap-2 text-brand">
          <Sparkles className="h-4 w-4" />
          <span className="ui-text-label text-sm">この力士の総括</span>
        </div>
        <p className="text-base leading-relaxed text-text sm:text-lg">
          {achievementSummary}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewFact
            label="最高位"
            value={formatRankDisplayName(status.history.maxRank)}
          />
          <OverviewFact label="通算勝率" value={`${winRate}%`} />
          <OverviewFact
            label="幕内優勝"
            value={`${status.history.yushoCount.makuuchi}回`}
          />
          <OverviewFact
            label="金星 / 三賞"
            value={`${awardsSummary.kinboshi} / ${awardsSummary.totalSansho}`}
          />
        </div>
      </section>

      <section className="surface-panel space-y-3">
        <div className="panel-title">総評点内訳</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <OverviewFact label="総合点" value={`${clearScore.clearScore}`} />
          <OverviewFact label="競技スコア" value={`${clearScore.competitiveScore}`} />
          <OverviewFact label="記録ボーナス" value={`${clearScore.recordBonus}`} />
        </div>
        <div className="space-y-2 text-sm leading-relaxed text-text-dim">
          <OverviewHint
            icon={<Gauge className="h-4 w-4 text-action" />}
            title="最高位"
            text={`最高位の比重が最も大きく、${formatRankDisplayName(status.history.maxRank)}まで到達した価値を強く見ます。`}
          />
          <OverviewHint
            icon={<Trophy className="h-4 w-4 text-award" />}
            title="競技実績"
            text="優勝、三賞、金星、幕内在位、通算勝率などの競技成績を加点します。"
          />
          <OverviewHint
            icon={<Award className="h-4 w-4 text-state" />}
            title="記録バッジ"
            text="保存すると記録図鑑に残る、事実ベースの達成項目をまとめています。"
          />
        </div>
      </section>
    </div>

    <section className="surface-panel space-y-4">
      <div className="flex items-center gap-2 text-brand">
        <Sparkles className="h-4 w-4" />
        <span className="ui-text-label text-sm">記録バッジ一覧</span>
      </div>
      {clearScore.badges.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {clearScore.badges.map((badge) => (
            <div key={badge.key} className="rounded-none border border-line bg-surface px-3 py-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="ui-text-label text-sm text-text">{resolveCareerRecordBadgeLabel(badge.key)}</div>
                <div className="text-xs text-award">+{badge.scoreBonus}</div>
              </div>
              <p className="text-sm leading-relaxed text-text-dim">{badge.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-none border border-line bg-surface px-3 py-4 text-sm text-text-dim">
          まだ記録バッジはありません。最高位や主要実績ができるとここに追加されます。
        </div>
      )}
    </section>
  </div>
);

const OverviewFact: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="metric-card">
    <div className="metric-label">{label}</div>
    <div className="metric-value text-base sm:text-lg">{value}</div>
  </div>
);

const OverviewHint: React.FC<{
  icon: React.ReactNode;
  title: string;
  text: string;
}> = ({ icon, title, text }) => (
  <div className="rounded-none border border-line bg-surface px-3 py-3">
    <div className="mb-1 flex items-center gap-2 text-text">
      {icon}
      <span className="ui-text-label text-sm">{title}</span>
    </div>
    <p className="text-sm leading-relaxed text-text-dim">{text}</p>
  </div>
);
