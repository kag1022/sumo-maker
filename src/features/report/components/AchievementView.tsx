import React from "react";
import { RikishiStatus } from "../../../logic/models";
import { Achievement, evaluateAchievements } from "../../../logic/achievements";
import { Award, Star, Medal, Sparkles, Trophy, Swords, Activity, Sun, TrendingUp, BarChart3, Shield } from "lucide-react";
import { BodyText, Heading, LabelText } from "../../../shared/ui/Typography";

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

  const getAchievementIcon = (achievement: Achievement) => {
    const className = `w-6 h-6 ${getAchievementStyle(achievement.rarity).text}`;
    switch (achievement.iconKey) {
      case "trophy":
        return <Trophy className={className} />;
      case "sparkles":
        return <Sparkles className={className} />;
      case "swords":
        return <Swords className={className} />;
      case "timer":
        return <Activity className={className} />;
      case "sun":
        return <Sun className={className} />;
      case "rocket":
        return <TrendingUp className={className} />;
      case "medal":
        return <Medal className={className} />;
      case "ladder":
        return <BarChart3 className={className} />;
      case "star":
        return <Star className={className} />;
      case "shield":
        return <Shield className={className} />;
      case "seedling":
      default:
        return <Award className={className} />;
    }
  };

  if (achievements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-sumi-light game-panel">
        <Award className="w-16 h-16 mb-4 opacity-20" />
        <BodyText as="p">まだ実績はありません</BodyText>
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
            <Heading as="h3" className="text-sumi">獲得実績</Heading>
            <BodyText as="p" className="text-sm text-sumi-light">
              全 {achievements.length} 個のアチーブメントを達成
            </BodyText>
          </div>
        </div>
        {legendaryCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-kiniro/10 border border-kiniro/30 text-kiniro text-sm animate-pulse-slow">
            <Sparkles className="w-4 h-4" />
            <LabelText>殿堂入り級の活躍！</LabelText>
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
                {getAchievementIcon(achievement)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Heading as="h4" className={`text-lg ${style.text}`}>
                    {achievement.name}
                  </Heading>
                  {style.badge && (
                    <span className="shrink-0">{style.badge}</span>
                  )}
                </div>
                <BodyText as="p" className="text-sm text-sumi-light leading-tight">
                  {achievement.description}
                </BodyText>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
