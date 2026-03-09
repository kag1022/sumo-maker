import React from "react";
import { RikishiStatus } from "../../../logic/models";
import { Achievement, evaluateAchievements } from "../../../logic/achievements";


interface AchievementViewProps {
  status: RikishiStatus;
}

const getAchievementStyle = (rarity: Achievement["rarity"]) => {
  switch (rarity) {
    case "LEGENDARY":
      return {
        bg: "bg-crimson/10",
        border: "border-2 sm:border-4 border-crimson shadow-[inset_0_0_8px_rgba(220,38,38,0.2)]",
        text: "text-crimson",
        iconBg: "bg-crimson/20 border-2 border-crimson",
        badge: <span className="text-crimson text-xs">★</span>,
      };
    case "EPIC":
      return {
        bg: "bg-gold/10",
        border: "border-2 sm:border-4 border-gold shadow-[inset_0_0_8px_rgba(212,160,23,0.2)]",
        text: "text-gold",
        iconBg: "bg-gold/20 border-2 border-gold",
        badge: <span className="text-gold text-xs">[勲]</span>,
      };
    case "RARE":
      return {
        bg: "bg-bg-light",
        border: "border-2 border-gold-muted",
        text: "text-gold-dim",
        iconBg: "bg-bg border-2 border-gold-muted",
        badge: <span className="text-gold-dim text-xs">[賞]</span>,
      };
    case "COMMON":
    default:
      return {
        bg: "bg-bg/60",
        border: "border-2 border-gold-muted/40",
        text: "text-text",
        iconBg: "bg-bg-light border-2 border-gold-muted/30",
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
    const className = `text-2xl ${getAchievementStyle(achievement.rarity).text}`;
    switch (achievement.iconKey) {
      case "trophy": return <span className={className}>[冠]</span>;
      case "sparkles": return <span className={className}>✨</span>;
      case "swords": return <span className={className}>⚔</span>;
      case "timer": return <span className={className}>⚡</span>;
      case "sun": return <span className={className}>☀</span>;
      case "rocket": return <span className={className}>📈</span>;
      case "medal": return <span className={className}>[勲]</span>;
      case "ladder": return <span className={className}>#</span>;
      case "star": return <span className={className}>★</span>;
      case "shield": return <span className={className}>🛡</span>;
      case "seedling":
      default: return <span className={className}>[賞]</span>;
    }
  };

  if (achievements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-text-dim rpg-panel relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(212,160,23,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(212,160,23,0.5) 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }} />
        <span className="text-6xl mb-4 opacity-20 relative z-10">[賞]</span>
        <p className="ui-text-label relative z-10">まだ実績はありません</p>
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between rpg-panel p-4 relative overflow-hidden gap-3">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(212,160,23,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(212,160,23,0.5) 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }} />
        <div className="flex items-center gap-3 relative z-10">
          <div className="p-3 bg-crimson/15 border-2 border-crimson text-crimson shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]">
            <span className="text-2xl">[賞]</span>
          </div>
          <div>
            <h3 className="text-lg sm:text-xl ui-text-label text-text">獲得実績</h3>
            <p className="text-xs text-text-dim mt-0.5 ui-text-label">
              全 {achievements.length} 個のアチーブメントを達成
            </p>
          </div>
        </div>
        {legendaryCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gold/10 border-2 border-gold text-gold text-xs relative z-10 self-start sm:self-auto">
            <span className="text-base">✨</span>
            <span className="ui-text-label">殿堂入り級の活躍！</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {sortedAchievements.map((achievement) => {
          const style = getAchievementStyle(achievement.rarity);
          return (
            <div
              key={achievement.id}
              className={`relative flex items-center p-3 sm:p-4 hover:-translate-y-1 transition-none hover:shadow-[4px_4px_0_#332211] active:translate-y-0 active:shadow-none bg-bg border-4 ${style.bg} ${style.border}`}
            >
              <div
                className={`flex flex-col items-center justify-center w-12 h-12 sm:w-14 sm:h-14 ${style.iconBg} mr-3 sm:mr-4 shrink-0 shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]`}
              >
                {getAchievementIcon(achievement)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className={`text-base sm:text-lg ui-text-label ${style.text}`}>
                    {achievement.name}
                  </h4>
                  {style.badge && (
                    <span className="shrink-0">{style.badge}</span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-text-dim leading-tight">
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
