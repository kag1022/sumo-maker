import React from "react";
import { Award, Trophy } from "lucide-react";
import { RikishiStatus } from "../../../logic/models";
import { AchievementView } from "./AchievementView";
import { formatRankDisplayName } from "../utils/reportFormatters";

interface ReportAchievementsTabProps {
  status: RikishiStatus;
  achievementSummary: string;
  winRate: string;
  awardsSummary: {
    kinboshi: number;
    totalSansho: number;
  };
}

export const ReportAchievementsTab: React.FC<ReportAchievementsTabProps> = ({
  status,
  achievementSummary,
  winRate,
  awardsSummary,
}) => (
  <div className="space-y-4 animate-in">
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] gap-4">
      <div className="report-detail-card p-4 sm:p-5">
        <h3 className="section-header mb-2">
          <Award className="w-4 h-4 text-brand-line" /> 何を成し遂げた力士か
        </h3>
        <p className="text-sm text-text leading-relaxed">{achievementSummary}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <AchievementFact label="最高位" value={formatRankDisplayName(status.history.maxRank)} />
          <AchievementFact label="通算勝率" value={`${winRate}%`} />
          <AchievementFact label="幕内優勝" value={`${status.history.yushoCount.makuuchi}回`} />
          <AchievementFact label="金星 / 三賞" value={`${awardsSummary.kinboshi} / ${awardsSummary.totalSansho}`} />
        </div>
      </div>

      <div className="report-detail-card p-4 sm:p-5">
        <h3 className="section-header mb-2">
          <Trophy className="w-4 h-4 text-action" /> 記録の読みどころ
        </h3>
        <ul className="space-y-2 text-sm text-text-dim list-disc list-inside">
          <li>英雄型なら優勝と表彰が先に立つ構成です。</li>
          <li>下位で終わった力士でも、最高位と転機で物語が読めます。</li>
          <li>記録が少ない場合は、ゼロ件を隠さず静かなキャリアとして見せます。</li>
        </ul>
      </div>
    </div>

    <AchievementView status={status} />
  </div>
);

const AchievementFact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border border-brand-muted/60 bg-surface-base/80 p-3">
    <div className="text-text-dim mb-1">{label}</div>
    <div className="text-text ui-text-label break-words">{value}</div>
  </div>
);
