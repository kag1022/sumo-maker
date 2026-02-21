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

// レアリティ判定ヘルパー (仮実装: 横綱=UR, 大関=SR, 三役=R, それ以外=N)
const getRarityByRank = (rankName: string): "UR" | "SR" | "R" | "N" => {
  if (rankName === "横綱") return "UR";
  if (rankName === "大関") return "SR";
  if (["関脇", "小結"].includes(rankName)) return "R";
  return "N";
};

const getCardStyle = (rarity: "UR" | "SR" | "R" | "N") => {
  switch (rarity) {
    case "UR":
      return "bg-washi-dark border-shuiro shadow-[4px_4px_0px_0px_#2b2b2b]";
    case "SR":
      return "bg-washi border-kuroboshi shadow-[4px_4px_0px_0px_#2b2b2b]";
    case "R":
      return "bg-washi border-kassairo shadow-[2px_2px_0px_0px_#2b2b2b]";
    case "N":
    default:
      return "bg-washi border-sumi-light shadow-[2px_2px_0px_0px_#2b2b2b]";
  }
};

const getTitleStyle = (rarity: "UR" | "SR" | "R" | "N") => {
  switch (rarity) {
    case "UR":
      return "text-shuiro";
    case "SR":
      return "text-kuroboshi";
    case "R":
      return "text-kassairo";
    case "N":
    default:
      return "text-sumi";
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
    <div className="fixed inset-0 bg-black/80 w-full h-full flex items-center justify-center z-[100] p-4 sm:p-6 animate-in fade-in duration-200 backdrop-blur-sm">
      <div className="bg-washi flex flex-col w-full h-full max-w-6xl rounded-none border-4 border-sumi shadow-[8px_8px_0px_0px_#2b2b2b]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="font-bold text-xl sm:text-2xl flex items-center text-kuroboshi tracking-tight">
              <Trophy className="w-6 h-6 mr-2 sm:mr-3 text-shuiro" />
              殿堂入り力士
            </h2>
            <div className="hidden sm:flex bg-washi p-1 py-1 rounded-none gap-1 border-2 border-sumi">
              <button
                onClick={() => setFilter("ALL")}
                className={`px-4 py-1.5 rounded-none text-xs font-bold transition-all ${filter === "ALL" ? "bg-white text-kuroboshi shadow-sm" : "text-slate-500 hover:text-sumi"}`}
              >
                すべて ({items.length})
              </button>
              <button
                onClick={() => setFilter("YUSHO")}
                className={`px-4 py-1.5 rounded-none text-xs font-bold transition-all ${filter === "YUSHO" ? "bg-white text-kuroboshi shadow-sm" : "text-slate-500 hover:text-sumi"}`}
              >
                幕内優勝経験者
              </button>
              <button
                onClick={() => setFilter("YOKOZUNA")}
                className={`px-4 py-1.5 rounded-none text-xs font-bold transition-all ${filter === "YOKOZUNA" ? "bg-white text-kuroboshi shadow-sm" : "text-slate-500 hover:text-sumi"}`}
              >
                歴代横綱
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Mobile Filter */}
        <div className="sm:hidden p-3 bg-white border-b border-slate-200 shrink-0">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="w-full p-2 bg-slate-100 rounded-none text-sm font-bold text-sumi border-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">すべて表示 ({items.length})</option>
            <option value="YUSHO">幕内優勝経験者</option>
            <option value="YOKOZUNA">歴代横綱</option>
          </select>
        </div>

        {/* Grid Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-washi">
          {filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
              <Trophy className="w-16 h-16 opacity-20" />
              <p className="text-lg font-medium">
                {filter === "ALL"
                  ? "保存された力士はいません"
                  : "条件に一致する力士がいません"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 auto-rows-max">
              {filteredItems.map((rec) => {
                const rarity = getRarityByRank(rec.maxRank.name);
                const cardStyle = getCardStyle(rarity);
                const titleStyle = getTitleStyle(rarity);

                return (
                  <div
                    key={rec.id}
                    className={`relative group flex flex-col rounded-none border-2 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#2b2b2b] ${cardStyle}`}
                  >
                    {/* UR Shine Effect */}
                    {rarity === "UR" && (
                      <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/40 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-none rounded-tr-xl" />
                    )}

                    {/* Card Header */}
                    <div className="p-4 pb-2 border-b border-black/5 relative overflow-hidden shrink-0">
                      {rarity === "UR" && (
                        <Star className="absolute -top-3 -right-3 w-16 h-16 text-yellow-500/10 fill-yellow-500/10 rotate-12" />
                      )}

                      <div className="flex justify-between items-start mb-2 relative z-10">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-black/5 text-black/60 uppercase tracking-widest leading-none">
                          {rec.careerEndYearMonth ? "引退" : "現役"}
                        </span>
                        {rec.yushoCount.makuuchi > 0 && (
                          <span className="flex items-center text-[10px] font-black text-shuiro bg-washi border border-shuiro px-2 py-0.5 rounded shadow-sm border border-shuiro leading-none">
                            <Trophy className="w-3 h-3 mr-1" /> 優勝{" "}
                            {rec.yushoCount.makuuchi}回
                          </span>
                        )}
                      </div>
                      <h3
                        className={`text-2xl font-black mb-1 font-serif tracking-tight ${titleStyle}`}
                      >
                        {rec.shikona}
                      </h3>
                      <div className="text-sm font-medium opacity-70">
                        {rec.title ? `「${rec.title}」` : "無冠"}
                      </div>
                    </div>

                    {/* Card Body - Flex-1 to push footer down */}
                    <div className="p-4 flex-1 flex flex-col justify-center space-y-3 bg-white/40">
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider opacity-60 font-bold mb-0.5">
                          最高位
                        </p>
                        <p className="text-xl font-black">
                          {formatRankName(rec.maxRank)}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-center border-t border-black/5 pt-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider opacity-60 font-bold mb-0.5">
                            通算成績
                          </p>
                          <p className="text-lg font-bold">
                            <span className="text-kuroboshi">
                              {rec.totalWins}
                            </span>
                            <span className="text-xs font-normal opacity-70">
                              勝
                            </span>
                            <span className="text-slate-600">
                              {rec.totalLosses}
                            </span>
                            <span className="text-xs font-normal opacity-70">
                              敗
                            </span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider opacity-60 font-bold mb-0.5">
                            活動期間
                          </p>
                          <p className="text-sm font-bold mt-1 text-sumi">
                            {rec.careerStartYearMonth}
                            <br />
                            <span className="text-xs font-normal opacity-70">
                              ～
                            </span>
                            <br />
                            {rec.careerEndYearMonth || "現在"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="p-2 border-t border-black/5 bg-white/50 flex gap-2 rounded-b-xl shrink-0">
                      <button
                        onClick={() => onOpen(rec.id)}
                        className="flex-1 py-2 text-sm font-bold bg-sumi text-white rounded-none hover:bg-sumi-dark transition shadow-sm"
                      >
                        詳細を見る
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`${rec.shikona}の記録を削除しますか？`)) {
                            onDelete(rec.id);
                          }
                        }}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-none transition"
                        title="削除"
                      >
                        <Trash2 className="w-5 h-5" />
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

