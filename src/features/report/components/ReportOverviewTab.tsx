import React from "react";
import { Award, ScrollText, Sparkles, Trophy } from "lucide-react";
import { RikishiStatus } from "../../../logic/models";
import { formatRankDisplayName } from "../utils/reportCareer";

interface ReportOverviewTabProps {
  status: RikishiStatus;
  achievementSummary: string;
  winRate: string;
  awardsSummary: {
    kinboshi: number;
    totalSansho: number;
  };
}

export const ReportOverviewTab: React.FC<ReportOverviewTabProps> = ({
  status,
  achievementSummary,
  winRate,
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
        <div className="panel-title">読み始める順番</div>
        <div className="space-y-2 text-sm leading-relaxed text-text-dim">
          <OverviewHint
            icon={<ScrollText className="h-4 w-4 text-action" />}
            title="場所史"
            text="場所ごとの転機と星取を見て、どこで流れが変わったかを読む。"
          />
          <OverviewHint
            icon={<Trophy className="h-4 w-4 text-award" />}
            title="宿敵と判断"
            text="優勝を阻んだ相手や、説明が必要だった番付判断だけを追う。"
          />
          <OverviewHint
            icon={<Award className="h-4 w-4 text-state" />}
            title="能力と型"
            text="体格、決まり手、怪我、素質設計からどんな力士だったかを掴む。"
          />
        </div>
      </section>
    </div>
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
