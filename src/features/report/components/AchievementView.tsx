import React from "react";
import { RikishiStatus } from "../../../logic/models";
import { Achievement, evaluateAchievements } from "../../../logic/achievements";
import { Award, Star, Medal, Sparkles } from "lucide-react";

interface AchievementViewProps {
  status: RikishiStatus;
}

const getAchievementStyle = (rarity: Achievement["rarity"]) => {
  switch (rarity) {
    case "LEGENDARY":
      return {
        bg: "bg-washi-dark",
        border: "border-shuiro",
        text: "text-shuiro",
        iconBg: "bg-washi border-sumi/60",
        shadow: "shadow-[4px_4px_0px_0px_#2b2b2b]",
        badge: <Star className="w-4 h-4 text-shuiro fill-shuiro" />,
      };
    case "EPIC":
      return {
        bg: "bg-washi",
        border: "border-kuroboshi",
        text: "text-kuroboshi",
        iconBg: "bg-washi border-sumi/60",
        shadow: "shadow-[4px_4px_0px_0px_#2b2b2b]",
        badge: <Medal className="w-4 h-4 text-kuroboshi" />,
      };
    case "RARE":
      return {
        bg: "bg-washi",
        border: "border-kassairo",
        text: "text-kassairo",
        iconBg: "bg-washi border-sumi/60",
        shadow: "shadow-[2px_2px_0px_0px_#2b2b2b]",
        badge: <Award className="w-4 h-4 text-kassairo" />,
      };
    case "COMMON":
    default:
      return {
        bg: "bg-washi border-sumi",
        border: "border-sumi",
        text: "text-sumi",
        iconBg: "bg-washi",
        shadow: "shadow-[2px_2px_0px_0px_#2b2b2b]",
        badge: null,
      };
  }
};

export const AchievementView: React.FC<AchievementViewProps> = ({ status }) => {
  const achievements = React.useMemo(
    () => evaluateAchievements(status),
    [status],
  );

  if (achievements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-sumi-light bg-washi border-sumi rounded-none border border-sumi">
        <Award className="w-16 h-16 mb-4 opacity-20" />
        <p>まだ実績はありません</p>
      </div>
    );
  }

  // Group by rarity for sorting (Legendary first)
  const order: Record<Achievement["rarity"], number> = {
    LEGENDARY: 0,
    EPIC: 1,
    RARE: 2,
    COMMON: 3,
  };

  const sortedAchievements = [...achievements].sort(
    (a, b) => order[a.rarity] - order[b.rarity],
  );

  const legendaryCount = sortedAchievements.filter(
    (a) => a.rarity === "LEGENDARY",
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-washi border-sumi rounded-none p-4 border border-sumi shadow-[2px_2px_0px_0px_#2b2b2b]">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-washi border border-shuiro text-shuiro rounded-none">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-sumi">獲得実績</h3>
            <p className="text-sm text-sumi-light">
              全 {achievements.length} 個のアチーブメントを達成
            </p>
          </div>
        </div>
        {legendaryCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-none text-amber-700 text-sm font-bold animate-pulse">
            <Sparkles className="w-4 h-4" />
            殿堂入り級の活躍！
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sortedAchievements.map((achievement) => {
          const style = getAchievementStyle(achievement.rarity);
          return (
            <div
              key={achievement.id}
              className={`relative flex items-center p-4 rounded-none border-2 transition-none hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#2b2b2b] ${style.bg} ${style.border} ${style.shadow}`}
            >
              <div
                className={`flex flex-col items-center justify-center w-14 h-14 rounded-none ${style.iconBg} border border-black/5 mr-4 shrink-0 shadow-none border border-sumi`}
              >
                <span className="text-2xl leading-none">
                  {achievement.icon}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className={`font-black text-lg ${style.text}`}>
                    {achievement.name}
                  </h4>
                  {style.badge && (
                    <span className="shrink-0">{style.badge}</span>
                  )}
                </div>
                <p className="text-sm font-medium opacity-80 leading-tight">
                  {achievement.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
