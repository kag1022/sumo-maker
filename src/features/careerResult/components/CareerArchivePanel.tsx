import React from 'react';
import { LibraryBig, Award, Sparkles } from 'lucide-react';
import { cn } from '../../../shared/lib/cn';
import surface from '../../../shared/styles/surface.module.css';
import typography from '../../../shared/styles/typography.module.css';
import { Button } from '../../../shared/ui/Button';
import { getDb, type CareerRow } from '../../../logic/persistence/db';
import { ARCHIVE_CATEGORIES } from '../../../logic/archive/categories';
import { OBSERVATION_THEMES } from '../../../logic/archive/observationThemes';
import { OBSERVATION_MODIFIERS } from '../../../logic/archive/observationBuild';
import type {
  ArchiveCategoryId,
  CareerTitleTier,
  ObservationModifierId,
  ObservationThemeId,
} from '../../../logic/archive/types';

interface CareerArchivePanelProps {
  careerId: string | null;
  onOpenArchive: () => void;
}

// Visual tier styles. Uses existing palette tokens; no new CSS framework.
const TIER_STYLE: Record<CareerTitleTier, { wrap: string; label: string; ring: string }> = {
  common: {
    wrap: 'border-white/15 bg-white/[0.04]',
    label: 'text-text-dim',
    ring: '',
  },
  uncommon: {
    wrap: 'border-emerald-400/45 bg-emerald-400/10',
    label: 'text-emerald-200',
    ring: '',
  },
  rare: {
    wrap: 'border-sky-400/50 bg-sky-400/10',
    label: 'text-sky-200',
    ring: '',
  },
  epic: {
    wrap: 'border-fuchsia-400/55 bg-fuchsia-400/10',
    label: 'text-fuchsia-200',
    ring: 'shadow-[0_0_0_1px_rgba(217,70,239,0.25)]',
  },
  legendary: {
    wrap: 'border-amber-300/70 bg-amber-300/12',
    label: 'text-amber-100',
    ring: 'shadow-[0_0_18px_rgba(251,191,36,0.18)]',
  },
};

const TIER_LABEL_JA: Record<CareerTitleTier, string> = {
  common: 'C',
  uncommon: 'UC',
  rare: 'R',
  epic: 'EPIC',
  legendary: 'LEGEND',
};

export const CareerArchivePanel: React.FC<CareerArchivePanelProps> = ({ careerId, onOpenArchive }) => {
  const [row, setRow] = React.useState<CareerRow | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!careerId) {
      setRow(null);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    void (async () => {
      const r = await getDb().careers.get(careerId);
      if (!cancelled) {
        setRow(r ?? null);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [careerId]);

  if (!loaded || !careerId) return null;

  // Legacy career: row exists but archive judgment never ran. Show soft message.
  if (!row || !row.archiveJudgedAt) {
    return (
      <section className={cn(surface.panel, 'space-y-2 p-5')}>
        <div className="flex items-center gap-3">
          <LibraryBig className="h-5 w-5 text-text-dim" />
          <h3 className={cn(typography.heading, 'text-lg text-text-dim')}>資料館登録</h3>
        </div>
        <p className="text-xs text-text-dim leading-relaxed">
          このキャリアは旧形式のため、観測資料館には登録されていません。
          以降の観測ビルドからのキャリアは自動的に資料館に登録されます。
        </p>
      </section>
    );
  }

  const themeId = row.archiveThemeId as ObservationThemeId | undefined;
  const themeLabel = themeId ? OBSERVATION_THEMES[themeId]?.label ?? themeId : '未指定';
  const modifierLabels = (row.archiveModifierIds ?? [])
    .map((id) => OBSERVATION_MODIFIERS[id as ObservationModifierId]?.label ?? id);
  const categories = (row.archiveCategories ?? []) as string[];
  const titles = row.archiveTitles ?? [];
  const opAwarded = row.archiveRewardAwarded ?? 0;

  return (
    <section className={cn(surface.panel, 'space-y-5 p-5')}>
      {/* Header + meta line */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <LibraryBig className="h-5 w-5 text-action" />
          <div>
            <div className={typography.kicker}>資料館登録</div>
            <h3 className={cn(typography.heading, 'text-xl text-text')}>このキャリアの観測記録</h3>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-dim">
          <span>
            <span className="text-text-dim/70">テーマ:</span>{' '}
            <span className="text-text-dim">{themeLabel}</span>
          </span>
          {modifierLabels.length > 0 ? (
            <span>
              <span className="text-text-dim/70">追加ビルド:</span>{' '}
              <span className="text-text-dim">{modifierLabels.join(' / ')}</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Categories — medium tier */}
      <div className="space-y-2">
        <div className={cn(typography.label, 'text-[10px] tracking-[0.3em] text-text-dim uppercase')}>
          獲得カテゴリ
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.length === 0 ? (
            <span className="text-xs text-text-dim/70">該当なし</span>
          ) : (
            categories.map((c) => (
              <span
                key={c}
                className="border border-white/20 bg-white/[0.04] px-2 py-1 text-[11px] text-text"
              >
                {ARCHIVE_CATEGORIES[c as ArchiveCategoryId]?.label ?? c}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Titles — large, tier-colored */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-amber-300/80" />
          <div className={cn(typography.label, 'text-[10px] tracking-[0.3em] text-text-dim uppercase')}>
            獲得称号
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {titles.length === 0 ? (
            <span className="text-xs text-text-dim/70">該当なし</span>
          ) : (
            titles.map((t) => {
              const tier = (t.tier as CareerTitleTier) ?? 'common';
              const style = TIER_STYLE[tier] ?? TIER_STYLE.common;
              return (
                <div
                  key={t.id}
                  className={cn(
                    'flex items-center gap-2 border px-3 py-2 text-sm',
                    style.wrap,
                    style.ring,
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex items-center border border-current px-1.5 py-0.5 text-[9px] tracking-wider opacity-80',
                      style.label,
                    )}
                  >
                    {TIER_LABEL_JA[tier]}
                  </span>
                  <span className={cn('text-[13px]', style.label)}>{t.label}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Reward + CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-gold/20 bg-gold/[0.05] px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-gold">
          <Sparkles className="h-4 w-4" />
          <span>獲得観測ポイント</span>
          <span className="text-base">+{opAwarded} OP</span>
        </div>
        <Button size="sm" variant="primary" onClick={onOpenArchive}>
          <LibraryBig className="mr-2 h-4 w-4" />
          観測資料館で見る
        </Button>
      </div>
    </section>
  );
};
