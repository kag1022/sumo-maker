import React from 'react';
import { LibraryBig } from 'lucide-react';
import { cn } from '../../shared/lib/cn';
import surface from '../../shared/styles/surface.module.css';
import typography from '../../shared/styles/typography.module.css';
import { Button } from '../../shared/ui/Button';
import { getDb, type CareerRow } from '../../logic/persistence/db';
import { listArchiveCategories, ARCHIVE_CATEGORIES } from '../../logic/archive/categories';
import { OBSERVATION_THEMES } from '../../logic/archive/observationThemes';
import type { ArchiveCategoryId, ObservationThemeId } from '../../logic/archive/types';

interface ArchiveCollectionScreenProps {
  onOpenCareer: (careerId: string) => void;
}

type FilterMode = 'ALL' | ArchiveCategoryId | `theme:${ObservationThemeId}` | 'TITLED';

export const ArchiveCollectionScreen: React.FC<ArchiveCollectionScreenProps> = ({ onOpenCareer }) => {
  const [rows, setRows] = React.useState<CareerRow[]>([]);
  const [filter, setFilter] = React.useState<FilterMode>('ALL');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const all = await getDb().careers.toArray();
        if (cancelled) return;
        const judged = all
          .filter((row) => row.archiveJudgedAt)
          .sort((a, b) => (b.archiveJudgedAt ?? '').localeCompare(a.archiveJudgedAt ?? ''));
        setRows(judged);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allCategories = React.useMemo(() => listArchiveCategories(), []);

  const collectedCategories = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      for (const c of r.archiveCategories ?? []) set.add(c);
    }
    return set;
  }, [rows]);

  const missingCategories = allCategories.filter((c) => !collectedCategories.has(c.id));

  const filtered = rows.filter((r) => {
    if (filter === 'ALL') return true;
    if (filter === 'TITLED') return (r.archiveTitles ?? []).length > 0;
    if (filter.startsWith('theme:')) return r.archiveThemeId === filter.slice('theme:'.length);
    return (r.archiveCategories ?? []).includes(filter);
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className={cn(surface.panel, 'space-y-3 p-5')}>
        <div className="flex items-center gap-3">
          <LibraryBig className="h-5 w-5 text-action" />
          <h2 className={cn(typography.heading, 'text-2xl text-text')}>観測資料館</h2>
        </div>
        <div className="text-xs text-text-dim">
          観測ビルドで観測済みのキャリアを一覧表示します。最高位・カテゴリ・称号・テーマでフィルタできます。
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <FilterChip label="すべて" active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
          <FilterChip label="称号あり" active={filter === 'TITLED'} onClick={() => setFilter('TITLED')} />
          {allCategories.map((c) => (
            <FilterChip
              key={c.id}
              label={c.label}
              active={filter === c.id}
              dim={!collectedCategories.has(c.id)}
              onClick={() => setFilter(c.id)}
            />
          ))}
          {(Object.keys(OBSERVATION_THEMES) as ObservationThemeId[]).map((t) => (
            <FilterChip
              key={t}
              label={`テーマ: ${OBSERVATION_THEMES[t].label}`}
              active={filter === `theme:${t}`}
              onClick={() => setFilter(`theme:${t}`)}
            />
          ))}
        </div>
      </section>

      <section className={cn(surface.panel, 'space-y-3 p-5')}>
        <h3 className={cn(typography.heading, 'text-lg text-text')}>未収集カテゴリ</h3>
        {missingCategories.length === 0 ? (
          <div className="text-xs text-emerald-400">すべてのカテゴリが収集済み。</div>
        ) : (
          <ul className="grid gap-1.5 text-xs text-text-dim sm:grid-cols-2">
            {missingCategories.map((c) => (
              <li key={c.id}>・{c.label} — {c.description}</li>
            ))}
          </ul>
        )}
      </section>

      <section className={cn(surface.panel, 'space-y-3 p-5')}>
        <h3 className={cn(typography.heading, 'text-lg text-text')}>
          観測済みキャリア ({filtered.length}/{rows.length})
        </h3>
        {loading ? (
          <div className="text-xs text-text-dim">読み込み中…</div>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-text-dim">該当キャリアはまだありません。</div>
        ) : (
          <ul className="grid gap-3">
            {filtered.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-1.5 border border-white/10 bg-white/[0.02] px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-base text-text">{row.shikona}</span>
                  <span className="text-xs text-gold">{row.maxRank?.name ?? '-'}</span>
                </div>
                <div className="flex flex-wrap gap-1 text-[11px] text-text-dim">
                  {row.archiveThemeId ? (
                    <span className="border border-action/40 px-1.5 py-0.5">
                      テーマ: {OBSERVATION_THEMES[row.archiveThemeId as ObservationThemeId]?.label ?? row.archiveThemeId}
                    </span>
                  ) : null}
                  {(row.archiveCategories ?? []).map((c) => (
                    <span key={c} className="border border-white/10 px-1.5 py-0.5">
                      {ARCHIVE_CATEGORIES[c as ArchiveCategoryId]?.label ?? c}
                    </span>
                  ))}
                </div>
                {(row.archiveTitles ?? []).length > 0 ? (
                  <div className="flex flex-wrap gap-1 text-[11px] text-amber-200/90">
                    {(row.archiveTitles ?? []).map((t) => (
                      <span key={t.id} className="border border-amber-300/30 px-1.5 py-0.5">
                        {t.label}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-[11px] text-text-dim">
                  <span>{row.bashoCount}場所 / 報酬 +{row.archiveRewardAwarded ?? 0} OP</span>
                  <Button size="sm" variant="ghost" onClick={() => onOpenCareer(row.id)}>
                    開く
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

const FilterChip: React.FC<{
  label: string;
  active?: boolean;
  dim?: boolean;
  onClick: () => void;
}> = ({ label, active, dim, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'border px-2.5 py-1 text-[11px] transition',
      active
        ? 'border-action bg-action/15 text-text'
        : dim
          ? 'border-white/5 bg-white/[0.01] text-text-dim/60'
          : 'border-white/10 bg-white/[0.02] text-text-dim hover:border-gold/40',
    )}
  >
    {label}
  </button>
);
