import React from "react";
import { Archive, Search, Star, Trash2 } from "lucide-react";
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
}

interface ArchiveScreenProps {
  items: ArchiveItem[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

type ArchiveFilter = "ALL" | "YOKOZUNA" | "YUSHO";

const formatRankName = (rank: Rank): string => {
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) return `${side}${rank.name}`;
  const number = rank.number || 1;
  return number === 1 ? `${side}${rank.name}筆頭` : `${side}${rank.name}${number}枚目`;
};

const resolveArchiveLabel = (item: ArchiveItem): string => {
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
    });
  }, [filter, items, keyword]);

  const selectedItem =
    filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;

  React.useEffect(() => {
    if (selectedItem && selectedItem.id !== selectedId) {
      setSelectedId(selectedItem.id);
    }
  }, [selectedId, selectedItem]);

  return (
    <div className="archive-layout">
      <section className="surface-panel space-y-4">
        <div>
          <div className="panel-title">絞り込み</div>
          <p className="panel-caption">
            条件を絞っても0件表示で破綻しない、記録庫向けの一覧にします。
          </p>
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
      </section>

      <section className="surface-panel min-w-0">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="panel-title">保存済み記録</div>
            <p className="panel-caption">
              一覧は記録行を主役にし、装飾カードではなく読みやすさを優先します。
            </p>
          </div>
          <div className="text-xs text-text-dim">{filteredItems.length}件を表示中</div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="empty-state min-h-[320px]">
            <Archive className="h-10 w-10" />
            <div className="empty-state-title">条件に合う保存済み記録はありません</div>
            <div className="empty-state-text">
              絞り込みを戻すか、新しい力士人生を保存するとここに並びます。
            </div>
          </div>
        ) : (
          <div className="archive-table-wrap">
            <table className="archive-table">
              <thead>
                <tr>
                  <th>四股名</th>
                  <th>最高位</th>
                  <th>幕内優勝</th>
                  <th>通算成績</th>
                  <th>在位期間</th>
                  <th>保存日</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    data-active={selectedItem?.id === item.id}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <td>
                      <div className="font-medium text-text">{item.shikona}</div>
                      <div className="text-xs text-text-dim">{resolveArchiveLabel(item)}</div>
                    </td>
                    <td>{formatRankName(item.maxRank)}</td>
                    <td>{item.yushoCount.makuuchi}回</td>
                    <td>
                      {item.totalWins}勝 {item.totalLosses}敗
                      {item.totalAbsent > 0 ? ` ${item.totalAbsent}休` : ""}
                    </td>
                    <td>
                      {item.careerStartYearMonth}
                      <span className="mx-1 text-text-faint">〜</span>
                      {item.careerEndYearMonth || "現在"}
                    </td>
                    <td>{toDateText(item.savedAt || item.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="surface-panel space-y-4">
        <div>
          <div className="panel-title">プレビュー</div>
          <p className="panel-caption">
            一覧を開かなくても、誰のどんな人生かが右で読める構成にします。
          </p>
        </div>

        {selectedItem ? (
          <>
            <div className="space-y-2 border-b border-line pb-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-award/25 bg-award/8 px-3 py-1 text-xs text-award">
                <Star className="h-3.5 w-3.5" />
                {resolveArchiveLabel(selectedItem)}
              </div>
              <div className="text-2xl ui-text-heading text-text">{selectedItem.shikona}</div>
              <div className="text-sm text-text-dim">
                最高位 {formatRankName(selectedItem.maxRank)}
                {selectedItem.title ? ` / ${selectedItem.title}` : ""}
              </div>
            </div>

            <div className="metric-strip">
              <div className="metric-card">
                <div className="metric-label">通算成績</div>
                <div className="metric-value">
                  {selectedItem.totalWins}勝 {selectedItem.totalLosses}敗
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">幕内優勝</div>
                <div className="metric-value">{selectedItem.yushoCount.makuuchi}回</div>
              </div>
            </div>

            <div className="space-y-2 text-sm text-text-dim">
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

            <div className="space-y-2 pt-2">
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
            <div className="empty-state-text">
              力士人生を最後まで読み、保存するとここに記録が残ります。
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
