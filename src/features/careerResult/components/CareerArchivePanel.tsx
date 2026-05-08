import React from 'react';
import { LibraryBig } from 'lucide-react';
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
  ObservationModifierId,
  ObservationThemeId,
} from '../../../logic/archive/types';

interface CareerArchivePanelProps {
  careerId: string | null;
  onOpenArchive: () => void;
}

export const CareerArchivePanel: React.FC<CareerArchivePanelProps> = ({ careerId, onOpenArchive }) => {
  const [row, setRow] = React.useState<CareerRow | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!careerId) {
      setRow(null);
      return;
    }
    void (async () => {
      const r = await getDb().careers.get(careerId);
      if (!cancelled) setRow(r ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [careerId]);

  if (!row || !row.archiveJudgedAt) return null;

  const themeId = row.archiveThemeId as ObservationThemeId | undefined;
  const themeLabel = themeId ? OBSERVATION_THEMES[themeId]?.label ?? themeId : '未指定';
  const modifierLabels = (row.archiveModifierIds ?? [])
    .map((id) => OBSERVATION_MODIFIERS[id as ObservationModifierId]?.label ?? id);
  const categories = (row.archiveCategories ?? []) as string[];
  const titles = row.archiveTitles ?? [];

  return (
    <section className={cn(surface.panel, 'space-y-3 p-5')}>
      <div className="flex items-center gap-3">
        <LibraryBig className="h-5 w-5 text-action" />
        <h3 className={cn(typography.heading, 'text-xl text-text')}>資料館登録</h3>
      </div>

      <div className="grid gap-2 text-sm text-text-dim sm:grid-cols-2">
        <div>
          <div className="text-xs text-text-dim/70">観測テーマ</div>
          <div className="text-text">{themeLabel}</div>
        </div>
        <div>
          <div className="text-xs text-text-dim/70">追加ビルド</div>
          <div className="text-text">
            {modifierLabels.length > 0 ? modifierLabels.join(' / ') : 'なし'}
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs text-text-dim/70">獲得カテゴリ</div>
        <div className="flex flex-wrap gap-1 pt-1 text-[11px]">
          {categories.length === 0 ? (
            <span className="text-text-dim">該当なし</span>
          ) : (
            categories.map((c) => (
              <span key={c} className="border border-white/15 px-1.5 py-0.5 text-text-dim">
                {ARCHIVE_CATEGORIES[c as ArchiveCategoryId]?.label ?? c}
              </span>
            ))
          )}
        </div>
      </div>

      <div>
        <div className="text-xs text-text-dim/70">獲得称号</div>
        <div className="flex flex-wrap gap-1 pt-1 text-[11px]">
          {titles.length === 0 ? (
            <span className="text-text-dim">該当なし</span>
          ) : (
            titles.map((t) => (
              <span key={t.id} className="border border-amber-300/30 px-1.5 py-0.5 text-amber-200/90">
                {t.label}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="text-sm text-gold">獲得OP: +{row.archiveRewardAwarded ?? 0}</div>
        <Button size="sm" variant="secondary" onClick={onOpenArchive}>
          <LibraryBig className="mr-2 h-4 w-4" />
          観測資料館を開く
        </Button>
      </div>
    </section>
  );
};
