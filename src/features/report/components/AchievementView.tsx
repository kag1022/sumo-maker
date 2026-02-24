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
        bg: "bg-shuiro/10",
        border: "border-shuiro/40",
        text: "text-shuiro",
        iconBg: "bg-shuiro/15 border-shuiro/30",
        badge: <Star className="w-4 h-4 text-shuiro fill-shuiro" />,
      };
    case "EPIC":
      return {
        bg: "bg-kiniro/10",
        border: "border-kiniro/30",
        text: "text-kiniro",
        iconBg: "bg-kiniro/15 border-kiniro/30",
        badge: <Medal className="w-4 h-4 text-kiniro" />,
      };
    case "RARE":
      return {
        bg: "bg-washi-light",
        border: "border-kiniro-muted/30",
        text: "text-kiniro-muted",
        iconBg: "bg-washi border-kiniro-muted/20",
        badge: <Award className="w-4 h-4 text-kiniro-muted" />,
      };
    case "COMMON":
    default:
      return {
        bg: "bg-washi/60",
        border: "border-kiniro-muted/15",
        text: "text-sumi",
        iconBg: "bg-washi border-kiniro-muted/15",
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
      <div className="flex flex-col items-center justify-center p-12 text-sumi-light game-panel">
        <Award className="w-16 h-16 mb-4 opacity-20" />
        <p>まだ実績はありません</p>
      </div>
    );
  }

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
      <div className="flex items-center justify-between game-panel p-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-shuiro/15 border border-shuiro/30 text-shuiro">
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
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-kiniro/10 border border-kiniro/30 text-kiniro text-sm font-bold animate-pulse-slow">
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
              className={`relative flex items-center p-4 border transition-all hover:-translate-y-0.5 ${style.bg} ${style.border}`}
            >
              <div
                className={`flex flex-col items-center justify-center w-14 h-14 ${style.iconBg} border mr-4 shrink-0`}
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
                <p className="text-sm font-medium text-sumi-light leading-tight">
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
