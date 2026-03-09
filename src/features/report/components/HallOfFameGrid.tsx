import React from 'react';
import { BookCopy, GitBranch, Search, Trash2 } from 'lucide-react';
import { Rank } from '../../../logic/models';
import { buildGenealogyTree, CareerListItem, GenealogyNode } from '../../../logic/persistence/repository';
import { Button } from '../../../shared/ui/Button';

interface HallOfFameGridProps {
  items: CareerListItem[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

type TabId = 'ledger' | 'lineage';

const formatRankName = (rank: Rank): string => {
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return `${side}${rank.name}`;
  return rank.division === 'Maezumo' ? '前相撲' : `${side}${rank.name}${rank.number || 1}枚目`;
};

const buildTag = (item: CareerListItem): string => {
  if (item.yushoCount.makuuchi > 0) return `幕内優勝 ${item.yushoCount.makuuchi}回`;
  if (item.maxRank.name === '横綱') return '横綱到達';
  if (item.maxRank.division === 'Makuuchi') return '幕内到達';
  if (item.maxRank.division === 'Juryo') return '十両到達';
  return '下位を歩んだ';
};

type GenealogyViewNode = {
  id: string;
  label: string;
  rankLabel: string;
  generation: number;
  children: GenealogyViewNode[];
};

const toViewNode = (node: GenealogyNode): GenealogyViewNode => ({
  id: node.careerId,
  label: node.shikona,
  rankLabel: formatRankName(node.maxRank),
  generation: node.generation,
  children: node.children.map(toViewNode),
});

const LineageColumn = ({ node }: { node: GenealogyViewNode }) => (
  <div className="space-y-3">
    <div className="scoreboard-panel p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-[#8ea9cb]">Generation {node.generation}</div>
      <div className="mt-2 ui-text-heading text-2xl text-[#f3f7ff]">{node.label}</div>
      <div className="mt-1 text-sm text-[#b8cbe6]">{node.rankLabel}</div>
    </div>
    {node.children.length > 0 && (
      <div className="grid gap-3 border-l-2 border-[rgba(217,164,65,0.24)] pl-4">
        {node.children.map((child) => (
          <LineageColumn key={child.id} node={child} />
        ))}
      </div>
    )}
  </div>
);

export const HallOfFameGrid: React.FC<HallOfFameGridProps> = ({
  items,
  onOpen,
  onDelete,
  onClose,
}) => {
  const [tab, setTab] = React.useState<TabId>('ledger');
  const [query, setQuery] = React.useState('');
  const [roots, setRoots] = React.useState<GenealogyViewNode[]>([]);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const tree = await buildGenealogyTree();
      if (!alive) return;
      setRoots(tree.roots.map(toViewNode));
    })();
    return () => {
      alive = false;
    };
  }, [items]);

  const filteredItems = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      [item.shikona, item.title ?? '', item.kataLabel ?? '', buildTag(item), formatRankName(item.maxRank)]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [items, query]);

  return (
    <div className="space-y-6 animate-in">
      <section className="arcade-hero overflow-hidden px-6 py-7 sm:px-8">
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="museum-kicker">Archive Booth</div>
            <h2 className="ui-text-heading text-4xl text-[#fff1d8] sm:text-5xl">殿堂録</h2>
            <p className="max-w-2xl text-sm leading-7 text-[#d7c0a0]">
              保存した力士をカード台帳で読み返し、系譜として追える収蔵面。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">収蔵 {items.length}</div>
            <Button variant="secondary" onClick={onClose}>入口へ戻る</Button>
          </div>
        </div>
      </section>

      <section className="command-bar">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="museum-chip" data-active={tab === 'ledger'} onClick={() => setTab('ledger')}>
            <BookCopy size={15} />
            一覧
          </button>
          <button type="button" className="museum-chip" data-active={tab === 'lineage'} onClick={() => setTab('lineage')}>
            <GitBranch size={15} />
            系譜
          </button>
        </div>
        {tab === 'ledger' && (
          <label className="flex items-center gap-2 border-[2px] border-[rgba(255,224,176,0.18)] bg-[rgba(17,13,11,0.84)] px-3 py-2 text-sm text-[#d7c0a0]">
            <Search size={15} />
            <input
              className="w-52 border-0 bg-transparent p-0 text-[#fff1d8] shadow-none"
              placeholder="四股名で探す"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        )}
      </section>

      {tab === 'ledger' ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.length === 0 ? (
            <div className="scoreboard-panel p-6 text-sm text-[#c6d8f2]">一致する記録がありません。</div>
          ) : (
            filteredItems.map((item) => (
              <article key={item.id} className="rpg-panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="ui-text-heading text-2xl text-[#fff1d8]">{item.shikona}</div>
                    {item.title && <div className="mt-1 text-sm text-[#d7c0a0]">{item.title}</div>}
                  </div>
                  <span className="museum-chip">{buildTag(item)}</span>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="scoreboard-panel p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-[#8ea9cb]">最高位</div>
                    <div className="mt-2 text-xl text-[#f3f7ff]">{formatRankName(item.maxRank)}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="pixel-card p-3">
                      <div className="text-[0.65rem] uppercase tracking-[0.14em] text-[#6e513d]">通算</div>
                      <div className="mt-2 text-xl text-[#24160f]">{item.totalWins}勝 {item.totalLosses}敗</div>
                    </div>
                    <div className="pixel-card p-3">
                      <div className="text-[0.65rem] uppercase tracking-[0.14em] text-[#6e513d]">期間</div>
                      <div className="mt-2 text-sm text-[#24160f]">{item.careerStartYearMonth} - {item.careerEndYearMonth || '未記録'}</div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => onOpen(item.id)}>開く</Button>
                  <Button size="sm" variant="outline" onClick={() => onDelete(item.id)}>
                    <Trash2 size={14} className="mr-1" />
                    削除
                  </Button>
                </div>
              </article>
            ))
          )}
        </section>
      ) : (
        <section className="rpg-panel p-5 sm:p-6">
          {roots.length === 0 ? (
            <div className="scoreboard-panel p-5 text-sm text-[#c6d8f2]">系譜はまだありません。</div>
          ) : (
            <div className="grid gap-4">
              {roots.map((root) => (
                <LineageColumn key={root.id} node={root} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
