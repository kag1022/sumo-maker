import React from "react";
import { Award, Trophy } from "lucide-react";
import { RikishiStatus } from "../../../logic/models";
import { useLocale } from "../../../shared/hooks/useLocale";
import { cn } from "../../../shared/lib/cn";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import { AchievementView } from "./AchievementView";
import {
  buildEnglishAchievementSummary,
  formatReportHighestRankLabel,
  textForLocale,
} from "../utils/reportLocale";

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
}) => {
  const { locale } = useLocale();
  const summaryText = locale === "en"
    ? buildEnglishAchievementSummary(status)
    : achievementSummary;

  return (
    <div className="space-y-4 animate-in">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] gap-4">
        <div className={cn(surface.detailCard, "p-4 sm:p-5")}>
          <h3 className={cn(typography.sectionHeader, "mb-2")}>
            <Award className="w-4 h-4 text-brand-line" /> {locale === "en" ? "Career Achievement" : "何を成し遂げた力士か"}
          </h3>
          <p className="text-sm text-text leading-relaxed">{textForLocale(locale, summaryText, buildEnglishAchievementSummary(status))}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <AchievementFact label={locale === "en" ? "Peak Rank" : "最高位"} value={formatReportHighestRankLabel(status.history.maxRank, locale)} />
            <AchievementFact label={locale === "en" ? "Career Win Rate" : "通算勝率"} value={`${winRate}%`} />
            <AchievementFact label={locale === "en" ? "Makuuchi Yusho" : "幕内優勝"} value={locale === "en" ? `${status.history.yushoCount.makuuchi}` : `${status.history.yushoCount.makuuchi}回`} />
            <AchievementFact label={locale === "en" ? "Kinboshi / Sansho" : "金星 / 三賞"} value={`${awardsSummary.kinboshi} / ${awardsSummary.totalSansho}`} />
          </div>
        </div>

        <div className={cn(surface.detailCard, "p-4 sm:p-5")}>
          <h3 className={cn(typography.sectionHeader, "mb-2")}>
            <Trophy className="w-4 h-4 text-action" /> {locale === "en" ? "How To Read This Record" : "記録の読みどころ"}
          </h3>
          <ul className="space-y-2 text-sm text-text-dim list-disc list-inside">
            <li>{locale === "en" ? "High-end careers are read first through yusho and prizes." : "英雄型なら優勝と表彰が先に立つ構成です。"}</li>
            <li>{locale === "en" ? "Lower-rank careers still carry meaning through peak rank and turning points." : "下位で終わった力士でも、最高位と転機で物語が読めます。"}</li>
            <li>{locale === "en" ? "Quiet records are shown as quiet careers, without hiding empty counts." : "記録が少ない場合は、ゼロ件を隠さず静かなキャリアとして見せます。"}</li>
          </ul>
        </div>
      </div>

      <AchievementView status={status} />
    </div>
  );
};

const AchievementFact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border border-brand-muted/60 bg-surface-base/80 p-3">
    <div className="text-text-dim mb-1">{label}</div>
    <div className={cn(typography.label, "break-words text-text")}>{value}</div>
  </div>
);
