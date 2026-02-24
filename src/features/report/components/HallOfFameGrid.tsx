import React from "react";
import { Trophy, Trash2, X, Star } from "lucide-react";
import { Rank, CareerHistory } from "../../../logic/models";

interface HallOfFameItem {
  id: string;
  shikona: string;
  title: string | null;
  maxRank: Rank;
  careerStartYearMonth: string;
  careerEndYearMonth: string | undefined;
  totalWins: number;
  totalLosses: number;
  totalAbsent: number;
  yushoCount: CareerHistory["yushoCount"];
  savedAt: number;
}

interface HallOfFameGridProps {
  items: HallOfFameItem[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const formatRankName = (rank: Rank): string => {
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) {
    return `${side}${rank.name}`;
  }
  const number = rank.number || 1;
  return `${side}${rank.name}${number}枚目`;
};

const getRarityByRank = (rankName: string): "UR" | "SR" | "R" | "N" => {
  if (rankName === "横綱") return "UR";
  if (rankName === "大関") return "SR";
  if (["関脇", "小結"].includes(rankName)) return "R";
  return "N";
};

const getCardStyle = (rarity: "UR" | "SR" | "R" | "N") => {
  switch (rarity) {
    case "UR":
      return "border-crimson/60 bg-crimson/10 glow-red";
    case "SR":
      return "border-gold/50 bg-gold/10 glow-gold";
    case "R":
      return "border-gold-muted/40 bg-bg-light";
    case "N":
    default:
      return "border-gold-muted/20 bg-bg-light";
  }
};

const getTitleStyle = (rarity: "UR" | "SR" | "R" | "N") => {
  switch (rarity) {
    case "UR":
      return "text-crimson";
    case "SR":
      return "text-gold";
    case "R":
      return "text-gold-dim";
    case "N":
    default:
      return "text-text";
  }
};

export const HallOfFameGrid: React.FC<HallOfFameGridProps> = ({
  items,
  onOpen,
  onDelete,
  onClose,
}) => {
  const [filter, setFilter] = React.useState<"ALL" | "YOKOZUNA" | "YUSHO">(
    "ALL",
  );

  const filteredItems = React.useMemo(() => {
    if (filter === "YOKOZUNA")
      return items.filter((i) => i.maxRank.name === "横綱");
    if (filter === "YUSHO")
      return items.filter((i) => i.yushoCount.makuuchi > 0);
    return items;
  }, [items, filter]);

  return (
    <div className="fixed inset-0 bg-black/80 w-full h-full flex items-center justify-center z-[100] p-3 sm:p-6 animate-in backdrop-blur-sm">
      <div className="bg-bg flex flex-col w-full h-full max-w-5xl border-2 border-gold shadow-rpg">
        {/* Header */}
        <div className="p-3 sm:p-5 border-b-2 border-gold-muted flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <h2 className="text-lg sm:text-2xl flex items-center text-gold font-pixel">
              <Trophy className="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-crimson" />
              殿堂入り力士
            </h2>
            <div className="hidden sm:flex bg-bg-panel p-0.5 gap-0.5 border-2 border-gold-muted">
              <button
                onClick={() => setFilter("ALL")}
                className={`px-3 py-1.5 text-xs font-pixel transition-all ${filter === "ALL" ? "bg-gold/15 text-gold" : "text-text-dim hover:text-gold"}`}
              >
                すべて ({items.length})
              </button>
              <button
                onClick={() => setFilter("YUSHO")}
                className={`px-3 py-1.5 text-xs font-pixel transition-all ${filter === "YUSHO" ? "bg-gold/15 text-gold" : "text-text-dim hover:text-gold"}`}
              >
                幕内優勝
              </button>
              <button
                onClick={() => setFilter("YOKOZUNA")}
                className={`px-3 py-1.5 text-xs font-pixel transition-all ${filter === "YOKOZUNA" ? "bg-gold/15 text-gold" : "text-text-dim hover:text-gold"}`}
              >
                歴代横綱
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-dim hover:text-gold transition border-2 border-transparent hover:border-gold-muted"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Mobile Filter */}
        <div className="sm:hidden p-3 bg-bg-panel border-b-2 border-gold-muted shrink-0">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="w-full p-2 bg-bg text-sm font-pixel text-text border-2 border-gold-muted focus:ring-1 focus:ring-gold/50"
          >
            <option value="ALL">すべて表示 ({items.length})</option>
            <option value="YUSHO">幕内優勝経験者</option>
            <option value="YOKOZUNA">歴代横綱</option>
          </select>
        </div>

        {/* Grid Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-bg">
          {filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-text-dim space-y-4">
              <Trophy className="w-16 h-16 opacity-20" />
              <p className="text-lg font-pixel">
                {filter === "ALL"
                  ? "保存された力士はいません"
                  : "条件に一致する力士がいません"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 auto-rows-max">
              {filteredItems.map((rec) => {
                const rarity = getRarityByRank(rec.maxRank.name);
                const cardStyle = getCardStyle(rarity);
                const titleStyle = getTitleStyle(rarity);

                return (
                  <div
                    key={rec.id}
                    className={`relative group flex flex-col border-2 transition-transform duration-200 hover:-translate-y-0.5 ${cardStyle}`}
                  >
                    {/* UR Shine Effect */}
                    {rarity === "UR" && (
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-gold/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    )}

                    {/* Card Header */}
                    <div className="p-3 sm:p-4 pb-2 border-b-2 border-gold-muted/20 relative overflow-hidden shrink-0">
                      {rarity === "UR" && (
                        <Star className="absolute -top-3 -right-3 w-14 h-14 text-gold/10 fill-gold/10 rotate-12" />
                      )}

                      <div className="flex justify-between items-start mb-2 relative z-10">
                        <span className="text-[10px] font-pixel px-2 py-0.5 border-2 border-gold-muted text-text-dim tracking-widest">
                          {rec.careerEndYearMonth ? "引退" : "現役"}
                        </span>
                        {rec.yushoCount.makuuchi > 0 && (
                          <span className="flex items-center text-[10px] font-pixel text-crimson border-2 border-crimson/40 bg-crimson/10 px-2 py-0.5">
                            <Trophy className="w-3 h-3 mr-1" /> 優勝{" "}
                            {rec.yushoCount.makuuchi}回
                          </span>
                        )}
                      </div>
                      <h3
                        className={`text-xl sm:text-2xl font-pixel mb-1 tracking-tight ${titleStyle}`}
                      >
                        {rec.shikona}
                      </h3>
                      <div className="text-xs text-text-dim">
                        {rec.title ? `「${rec.title}」` : "無冠"}
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-3 sm:p-4 flex-1 flex flex-col justify-center space-y-3 bg-bg/40">
                      <div className="text-center">
                        <p className="text-[10px] font-pixel tracking-wider text-text-dim mb-0.5">
                          最高位
                        </p>
                        <p className="text-lg sm:text-xl font-pixel text-text">
                          {formatRankName(rec.maxRank)}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-center border-t-2 border-gold-muted/20 pt-3">
                        <div>
                          <p className="text-[10px] font-pixel tracking-wider text-text-dim mb-0.5">
                            通算成績
                          </p>
                          <p className="text-base sm:text-lg font-pixel">
                            <span className="text-text">{rec.totalWins}</span>
                            <span className="text-xs text-text-dim">勝</span>
                            <span className="text-text ml-0.5">{rec.totalLosses}</span>
                            <span className="text-xs text-text-dim">敗</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-pixel tracking-wider text-text-dim mb-0.5">
                            活動期間
                          </p>
                          <p className="text-xs sm:text-sm font-pixel text-text mt-1">
                            {rec.careerStartYearMonth}
                            <br />
                            <span className="text-text-dim">～</span>
                            <br />
                            {rec.careerEndYearMonth || "現在"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="p-2 border-t-2 border-gold-muted/20 bg-bg-panel flex gap-2 shrink-0">
                      <button
                        onClick={() => onOpen(rec.id)}
                        className="flex-1 py-2 text-sm font-pixel bg-bg border-2 border-gold text-gold hover:bg-gold/10 transition"
                      >
                        詳細を見る
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`${rec.shikona}の記録を削除しますか？`)) {
                            onDelete(rec.id);
                          }
                        }}
                        className="p-2 text-crimson/60 hover:text-crimson hover:bg-crimson/10 transition border-2 border-transparent hover:border-crimson/30"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
