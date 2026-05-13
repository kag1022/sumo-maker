import React from 'react';
import { LibraryBig, Eye as TelescopeIcon, Trophy, Layers } from 'lucide-react';
import { cn } from '../../shared/lib/cn';
import surface from '../../shared/styles/surface.module.css';
import typography from '../../shared/styles/typography.module.css';
import { Button } from '../../shared/ui/Button';
import { getDb, type CareerRow } from '../../logic/persistence/db';
import { listArchiveCategories, ARCHIVE_CATEGORIES } from '../../logic/archive/categories';
import { OBSERVATION_THEMES } from '../../logic/archive/observationThemes';
import type {
  ArchiveCategoryId,
  CareerTitleTier,
  ObservationThemeId,
} from '../../logic/archive/types';

interface ArchiveCollectionScreenProps {
  onOpenCareer: (careerId: string) => void;
  onOpenObservationBuild?: () => void;
}

type FilterMode =
  | 'ALL'
  | { kind: 'category'; id: ArchiveCategoryId }
  | { kind: 'theme'; id: ObservationThemeId }
  | { kind: 'tier'; tier: CareerTitleTier }
  | 'TITLED';

const TITLE_TIER_STYLE: Record<CareerTitleTier, { wrap: string; label: string }> = {
  common: { wrap: 'border-white/20 bg-white/[0.04]', label: 'text-text-dim' },
  uncommon: { wrap: 'border-emerald-400/40 bg-emerald-400/8', label: 'text-emerald-200' },
  rare: { wrap: 'border-sky-400/45 bg-sky-400/8', label: 'text-sky-200' },
  epic: { wrap: 'border-fuchsia-400/50 bg-fuchsia-400/8', label: 'text-fuchsia-200' },
  legendary: { wrap: 'border-amber-300/60 bg-amber-300/10', label: 'text-amber-100' },
};

const TIER_FILTERS: Array<{ tier: CareerTitleTier; label: string }> = [
  { tier: 'rare', label: 'R 以上' },
  { tier: 'epic', label: 'EPIC 以上' },
  { tier: 'legendary', label: 'LEGEND' },
];

const tierRank: Record<CareerTitleTier, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

const filterEquals = (a: FilterMode, b: FilterMode): boolean => {
  if (a === b) return true;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'tier' && b.kind === 'tier') return a.tier === b.tier;
  if (a.kind === 'category' && b.kind === 'category') return a.id === b.id;
  if (a.kind === 'theme' && b.kind === 'theme') return a.id === b.id;
  return false;
};

export const ArchiveCollectionScreen: React.FC<ArchiveCollectionScreenProps> = ({
  onOpenCareer,
  onOpenObservationBuild,
}) => {
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

  const collectedTitleIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      for (const t of r.archiveTitles ?? []) set.add(t.id);
    }
    return set;
  }, [rows]);

  // Total titles known to the system (= max distinct title IDs we've ever seen +
  // titles defined in the catalog). We don't import the title list to avoid
  // tight coupling — use observed-distinct count for now.
  const totalTitleSlots = React.useMemo(() => {
    // Lower bound = collectedTitleIds size; if we know nothing, fall back to 8.
    return Math.max(8, collectedTitleIds.size);
  }, [collectedTitleIds]);

  const missingCategories = allCategories.filter((c) => !collectedCategories.has(c.id));

  const filtered = rows.filter((r) => {
    if (filter === 'ALL') return true;
    if (filter === 'TITLED') return (r.archiveTitles ?? []).length > 0;
    if (filter.kind === 'theme') return r.archiveThemeId === filter.id;
    if (filter.kind === 'category') return (r.archiveCategories ?? []).includes(filter.id);
    if (filter.kind === 'tier') {
      const min = tierRank[filter.tier];
      return (r.archiveTitles ?? []).some((t) => tierRank[(t.tier as CareerTitleTier) ?? 'common'] >= min);
    }
    return true;
  });

  const isAllEmpty = !loading && rows.length === 0;
  const isFilterEmpty = !loading && rows.length > 0 && filtered.length === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Hero */}
      <section className={cn(surface.panel, 'space-y-4 p-6')}>
        <div className="flex items-center gap-3">
          <LibraryBig className="h-6 w-6 text-action" />
          <div>
            <div className={typography.kicker}>観測資料館</div>
            <h2 className={cn(typography.heading, 'text-2xl text-text')}>
              観測したキャリアを並べる場所
            </h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <HeroStat
            icon={<Layers className="h-4 w-4 text-action/80" />}
            label="観測済みキャリア"
            value={`${rows.length}`}
            sub="件"
          />
          <HeroStat
            icon={<LibraryBig className="h-4 w-4 text-emerald-300/80" />}
            label="カテゴリ収集"
            value={`${collectedCategories.size} / ${allCategories.length}`}
          />
          <HeroStat
            icon={<Trophy className="h-4 w-4 text-amber-300/80" />}
            label="称号収集"
            value={`${collectedTitleIds.size} / ${totalTitleSlots}`}
          />
        </div>
      </section>

      {/* Filters — grouped */}
      {!isAllEmpty ? (
        <section className={cn(surface.panel, 'space-y-3 p-5')}>
          <FilterGroup label="表示">
            <FilterChip label="すべて" active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
            <FilterChip label="称号獲得のみ" active={filter === 'TITLED'} onClick={() => setFilter('TITLED')} />
          </FilterGroup>

          <FilterGroup label="観測テーマ">
            {(Object.keys(OBSERVATION_THEMES) as ObservationThemeId[]).map((t) => (
              <FilterChip
                key={t}
                label={OBSERVATION_THEMES[t].label}
                active={filter !== 'ALL' && filter !== 'TITLED' && filter.kind === 'theme' && filter.id === t}
                onClick={() => setFilter({ kind: 'theme', id: t })}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="カテゴリ">
            {allCategories.map((c) => (
              <FilterChip
                key={c.id}
                label={c.label}
                active={filterEquals(filter, { kind: 'category', id: c.id })}
                dim={!collectedCategories.has(c.id)}
                onClick={() => setFilter({ kind: 'category', id: c.id })}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="称号tier">
            {TIER_FILTERS.map((tf) => (
              <FilterChip
                key={tf.tier}
                label={tf.label}
                active={filterEquals(filter, { kind: 'tier', tier: tf.tier })}
                onClick={() => setFilter({ kind: 'tier', tier: tf.tier })}
              />
            ))}
          </FilterGroup>
        </section>
      ) : null}

      {/* Missing categories — collection hook */}
      {!isAllEmpty && missingCategories.length > 0 ? (
        <section className={cn(surface.panel, 'space-y-3 p-5')}>
          <h3 className={cn(typography.heading, 'text-lg text-text')}>
            未収集カテゴリ
            <span className="ml-2 text-xs text-text-dim">
              ({missingCategories.length} / {allCategories.length})
            </span>
          </h3>
          <p className="text-[11px] text-text-dim">次の観測の手がかり。テーマ選びの参考に。</p>
          <ul className="grid gap-1.5 text-xs text-text-dim sm:grid-cols-2">
            {missingCategories.map((c) => (
              <li key={c.id} className="border border-white/8 bg-white/[0.02] px-3 py-2">
                <div className="text-text">{c.label}</div>
                <div className="text-[11px] text-text-dim/80">{c.description}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!isAllEmpty && missingCategories.length === 0 ? (
        <section className={cn(surface.panel, 'p-4 text-xs text-emerald-300')}>
          すべてのカテゴリを収集済み。
        </section>
      ) : null}

      {/* Career list */}
      <section className={cn(surface.panel, 'space-y-3 p-5')}>
        <div className="flex items-baseline justify-between">
          <h3 className={cn(typography.heading, 'text-lg text-text')}>観測済みキャリア</h3>
          {!isAllEmpty ? (
            <span className="text-xs text-text-dim">
              {filtered.length} / {rows.length} 件
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="text-xs text-text-dim">読み込み中…</div>
        ) : isAllEmpty ? (
          <div className="space-y-3 border border-action/30 bg-action/[0.04] px-5 py-6 text-center">
            <TelescopeIcon className="mx-auto h-7 w-7 text-action" />
            <div className="text-sm text-text">まだ観測したキャリアがありません。</div>
            <p className="mx-auto max-w-md text-xs text-text-dim leading-relaxed">
              観測設計から、最初の相撲人生を観測してみましょう。
              どんなキャリアになっても、ここに資料として残ります。
            </p>
            {onOpenObservationBuild ? (
              <div className="pt-1">
                <Button size="md" onClick={onOpenObservationBuild}>
                  <TelescopeIcon className="mr-2 h-4 w-4" />
                  観測設計へ
                </Button>
              </div>
            ) : null}
          </div>
        ) : isFilterEmpty ? (
          <div className="border border-white/10 bg-white/[0.02] px-4 py-6 text-center text-xs text-text-dim">
            この条件に該当するキャリアはありません。フィルタを変更してください。
          </div>
        ) : (
          <ul className="grid gap-3">
            {filtered.map((row) => {
              const themeId = row.archiveThemeId as ObservationThemeId | undefined;
              const themeLabel = themeId
                ? OBSERVATION_THEMES[themeId]?.label ?? themeId
                : null;
              const titles = row.archiveTitles ?? [];
              const cats = row.archiveCategories ?? [];
              return (
                <li
                  key={row.id}
                  className={cn(
                    'flex flex-col gap-2 border-l-2 border-white/15 bg-white/[0.02] px-4 py-3 transition hover:border-action/60 hover:bg-white/[0.04]',
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-base text-text">{row.shikona}</span>
                      <span className="text-xs text-gold">{row.maxRank?.name ?? '-'}</span>
                    </div>
                    {themeLabel ? (
                      <span className="border border-action/30 bg-action/8 px-2 py-0.5 text-[10px] text-action/90">
                        {themeLabel}
                      </span>
                    ) : null}
                  </div>

                  {cats.length > 0 ? (
                    <div className="flex flex-wrap gap-1 text-[11px]">
                      {cats.map((c) => (
                        <span
                          key={c}
                          className="border border-white/12 bg-white/[0.02] px-1.5 py-0.5 text-text-dim"
                        >
                          {ARCHIVE_CATEGORIES[c as ArchiveCategoryId]?.label ?? c}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {titles.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {titles.map((t) => {
                        const tier = (t.tier as CareerTitleTier) ?? 'common';
                        const style = TITLE_TIER_STYLE[tier] ?? TITLE_TIER_STYLE.common;
                        return (
                          <span
                            key={t.id}
                            className={cn(
                              'border px-2 py-0.5 text-[11px]',
                              style.wrap,
                              style.label,
                            )}
                          >
                            {t.label}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between text-[11px] text-text-dim">
                    <span>
                      {row.bashoCount}場所 / 報酬 +{row.archiveRewardAwarded ?? 0} OP
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => onOpenCareer(row.id)}>
                      開く
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

const HeroStat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}> = ({ icon, label, value, sub }) => (
  <div className="border border-white/10 bg-white/[0.02] px-4 py-3">
    <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] text-text-dim uppercase">
      {icon}
      <span>{label}</span>
    </div>
    <div className="mt-1 flex items-baseline gap-1">
      <span className="text-xl text-text">{value}</span>
      {sub ? <span className="text-xs text-text-dim">{sub}</span> : null}
    </div>
  </div>
);

const FilterGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <div className={cn(typography.label, 'text-[10px] tracking-[0.3em] text-text-dim/80 uppercase')}>
      {label}
    </div>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

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
