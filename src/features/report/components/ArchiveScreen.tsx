import React from "react";
import { Archive, Search, Star, Trash2 } from "lucide-react";
import { resolveCareerRecordBadgeLabel } from "../../../logic/career/clearScore";
import { Rank } from "../../../logic/models";
import { Button } from "../../../shared/ui/Button";

interface ArchiveItem {
  id: string;
  shikona: string;
  title: string | null;
  maxRank: Rank;
  careerStartYearMonth: string;
  careerEndYearMonth: string | null | undefined;
  totalWins: number;
  totalLosses: number;
  totalAbsent: number;
  yushoCount: {
    makuuchi: number;
    juryo?: number;
    makushita?: number;
    others?: number;
  };
  savedAt?: string;
  updatedAt?: string;
  clearScore?: number;
  recordBadgeKeys?: string[];
  bestScoreRank?: number;
}

interface ArchiveScreenProps {
  items: ArchiveItem[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

type ArchiveFilter = "ALL" | "YOKOZUNA" | "YUSHO";
type ArchiveSort = "RECENT" | "SCORE";

const formatRankName = (rank: Rank): string => {
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) return `${side}${rank.name}`;
  const number = rank.number || 1;
  return number === 1 ? `${side}${rank.name}筆頭` : `${side}${rank.name}${number}枚目`;
};

const resolveArchiveLabel = (item: ArchiveItem): string => {
  if (item.bestScoreRank && item.bestScoreRank <= 10) return `総評点歴代${item.bestScoreRank}位`;
  if (item.maxRank.name === "横綱") return "横綱到達";
  if (item.maxRank.name === "大関") return "大関到達";
  if (item.yushoCount.makuuchi > 0) return `幕内優勝 ${item.yushoCount.makuuchi}回`;
  if (item.maxRank.division === "Makuuchi") return "幕内経験";
  if (item.maxRank.division === "Juryo") return "関取経験";
  return "保存済み記録";
};

const toDateText = (value?: string): string => {
  if (!value) return "未保存";
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

export const ArchiveScreen: React.FC<ArchiveScreenProps> = ({
  items,
  onOpen,
  onDelete,
}) => {
  const [filter, setFilter] = React.useState<ArchiveFilter>("ALL");
  const [sortBy, setSortBy] = React.useState<ArchiveSort>("RECENT");
  const [keyword, setKeyword] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(items[0]?.id ?? null);

  React.useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  const filteredItems = React.useMemo(() => {
    const normalized = keyword.trim();
    return items.filter((item) => {
      if (filter === "YOKOZUNA" && item.maxRank.name !== "横綱") return false;
      if (filter === "YUSHO" && item.yushoCount.makuuchi <= 0) return false;
      if (!normalized) return true;
      return (
        item.shikona.includes(normalized) ||
        formatRankName(item.maxRank).includes(normalized) ||
        (item.title ?? "").includes(normalized)
      );
    }).sort((left, right) => {
      if (sortBy === "SCORE") {
        const scoreDelta = (right.clearScore ?? 0) - (left.clearScore ?? 0);
        if (scoreDelta !== 0) return scoreDelta;
        const rankDelta = (left.bestScoreRank ?? Number.MAX_SAFE_INTEGER) - (right.bestScoreRank ?? Number.MAX_SAFE_INTEGER);
        if (rankDelta !== 0) return rankDelta;
      }
      const savedDelta = (right.savedAt || right.updatedAt || "").localeCompare(left.savedAt || left.updatedAt || "");
      if (savedDelta !== 0) return savedDelta;
      return right.shikona.localeCompare(left.shikona, "ja");
    });
  }, [filter, items, keyword, sortBy]);

  const selectedItem =
    filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;

  React.useEffect(() => {
    if (selectedItem && selectedItem.id !== selectedId) {
      setSelectedId(selectedItem.id);
    }
  }, [selectedId, selectedItem]);

  return (
    <div className="archive-ledger-layout">
      <section className="archive-ledger-filter surface-panel space-y-4">
        <div>
          <div className="record-page-kicker">私設書架</div>
          <div className="panel-title">書架の索引</div>
        </div>

        <div className="search-field">
          <Search className="h-4 w-4 text-text-faint" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="四股名や最高位で検索"
            aria-label="保存済み記録を検索"
          />
        </div>

        <div className="space-y-2">
          {[
            { id: "ALL" as const, label: "すべて", count: items.length },
            {
              id: "YUSHO" as const,
              label: "幕内優勝経験",
              count: items.filter((item) => item.yushoCount.makuuchi > 0).length,
            },
            {
              id: "YOKOZUNA" as const,
              label: "横綱到達",
              count: items.filter((item) => item.maxRank.name === "横綱").length,
            },
          ].map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="filter-chip"
              data-active={filter === entry.id}
              onClick={() => setFilter(entry.id)}
            >
              <span>{entry.label}</span>
              <span>{entry.count}件</span>
            </button>
          ))}
        </div>

        <div className="space-y-2 border-t border-line pt-3">
          <div className="panel-title">並び順</div>
          <div className="space-y-2">
            {[
              { id: "RECENT" as const, label: "新しい順" },
              { id: "SCORE" as const, label: "スコア順" },
            ].map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="filter-chip"
                data-active={sortBy === entry.id}
                onClick={() => setSortBy(entry.id)}
              >
                <span>{entry.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="archive-ledger-shelf surface-panel min-w-0">
        <div className="archive-ledger-shelf-head">
          <div>
            <div className="record-page-kicker">保存した人生</div>
            <div className="panel-title">保存済み記録</div>
            <div className="text-sm text-text-dim">書架から一冊選ぶと、右側に開きかけの記録帳を表示します。</div>
          </div>
          <div className="text-xs text-text-dim">{filteredItems.length}件を表示中</div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="empty-state min-h-[320px]">
            <Archive className="h-10 w-10" />
            <div className="empty-state-title">条件に合う保存済み記録はありません</div>
          </div>
        ) : (
          <div className="archive-ledger-shelf-list">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="archive-ledger-card"
                data-active={selectedItem?.id === item.id}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="archive-ledger-card-head">
                  <div>
                    <div className="archive-ledger-card-title">{item.shikona}</div>
                    <div className="archive-ledger-card-label">{resolveArchiveLabel(item)}</div>
                  </div>
                  <div className="archive-ledger-card-date">{toDateText(item.savedAt || item.updatedAt)}</div>
                </div>
                <div className="archive-ledger-card-meta">
                  <span>{formatRankName(item.maxRank)}</span>
                  <span>{item.yushoCount.makuuchi}回</span>
                  <span>{item.clearScore ?? 0}点</span>
                </div>
                <div className="archive-ledger-card-record">
                  {item.totalWins}勝 {item.totalLosses}敗{item.totalAbsent > 0 ? ` ${item.totalAbsent}休` : ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="archive-ledger-detail surface-panel space-y-4">
        <div>
          <div className="record-page-kicker">閲覧面</div>
          <div className="panel-title">開きかけの記録帳</div>
        </div>

        {selectedItem ? (
          <>
            <div className="archive-ledger-detail-head">
              <div className="archive-ledger-detail-chip">
                <Star className="h-3.5 w-3.5" />
                {resolveArchiveLabel(selectedItem)}
              </div>
              <div className="archive-ledger-detail-title">{selectedItem.shikona}</div>
              <div className="archive-ledger-detail-subtitle">
                最高位 {formatRankName(selectedItem.maxRank)}
                {selectedItem.title ? ` / ${selectedItem.title}` : ""}
              </div>
            </div>

            <div className="archive-ledger-metrics">
              <div className="archive-ledger-metric">
                <div className="archive-ledger-metric-label">総評点</div>
                <div className="archive-ledger-metric-value">{selectedItem.clearScore ?? 0}</div>
              </div>
              <div className="archive-ledger-metric">
                <div className="archive-ledger-metric-label">通算成績</div>
                <div className="archive-ledger-metric-value">
                  {selectedItem.totalWins}勝 {selectedItem.totalLosses}敗
                </div>
              </div>
              <div className="archive-ledger-metric">
                <div className="archive-ledger-metric-label">幕内優勝</div>
                <div className="archive-ledger-metric-value">{selectedItem.yushoCount.makuuchi}回</div>
              </div>
            </div>

            {!!selectedItem.recordBadgeKeys?.length && (
              <div className="archive-ledger-badges">
                {selectedItem.recordBadgeKeys.slice(0, 3).map((badgeKey) => (
                  <span key={badgeKey} className="report-pill" data-tone="state">
                    {resolveCareerRecordBadgeLabel(
                      badgeKey as Parameters<typeof resolveCareerRecordBadgeLabel>[0],
                    )}
                  </span>
                ))}
              </div>
            )}

            <div className="archive-ledger-detail-rows">
              <div className="info-row">
                <span>在位期間</span>
                <span>
                  {selectedItem.careerStartYearMonth} 〜 {selectedItem.careerEndYearMonth || "現在"}
                </span>
              </div>
              <div className="info-row">
                <span>保存日</span>
                <span>{toDateText(selectedItem.savedAt || selectedItem.updatedAt)}</span>
              </div>
              <div className="info-row">
                <span>休場</span>
                <span>{selectedItem.totalAbsent}休</span>
              </div>
            </div>

            <div className="archive-ledger-detail-actions">
              <Button className="w-full" onClick={() => onOpen(selectedItem.id)}>
                この記録を開く
              </Button>
              <Button
                variant="danger"
                className="w-full"
                onClick={() => {
                  if (confirm(`${selectedItem.shikona}の保存済み記録を削除しますか？`)) {
                    onDelete(selectedItem.id);
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                この記録を削除する
              </Button>
            </div>
          </>
        ) : (
          <div className="empty-state min-h-[240px]">
            <Archive className="h-10 w-10" />
            <div className="empty-state-title">まだ保存済み記録がありません</div>
          </div>
        )}
      </section>
    </div>
  );
};
