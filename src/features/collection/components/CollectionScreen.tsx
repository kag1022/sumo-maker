import React from "react";
import {
  Award,
  BookOpenText,
  CheckCircle2,
  Lock,
  ScrollText,
  Trophy,
  Activity,
  AlertTriangle,
  Clock,
  Unlock,
} from "lucide-react";
import type { ObservationPointState } from "../../../logic/persistence/observationPoints";
import {
  listObserverUpgrades,
  purchaseObserverUpgrade,
  type ObserverUpgradeView,
} from "../../../logic/observer/upgrades";
import {
  getCollectionDashboardSummary,
  listCollectionCatalogEntries,
  type CollectionCatalogEntry,
  type CollectionCatalogType,
  type CollectionDashboardSummary,
} from "../../../logic/persistence/collections";
import { cn } from "../../../shared/lib/cn";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import { Button } from "../../../shared/ui/Button";
import { ProgressRing } from "../../../shared/ui/ProgressRing";
import styles from "./CollectionScreen.module.css";

const TAB_DEFS: Array<{
  id: CollectionCatalogType;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "RECORD",      label: "生涯記録",    shortLabel: "記録",   icon: Award },
  { id: "ACHIEVEMENT", label: "偉業",        shortLabel: "偉業",   icon: Trophy },
  { id: "KIMARITE",   label: "決まり手",     shortLabel: "決まり手", icon: ScrollText },
];

const KIMARITE_FILTERS = [
  "ALL", "押し・突き", "寄り・極め", "投げ", "捻り・落とし", "足取り・掛け", "反り", "送り", "非技",
] as const;
type KimariteFilter = (typeof KIMARITE_FILTERS)[number];

interface CollectionScreenProps {
  onOpenArchive: () => void;
  observationPoints: ObservationPointState | null;
}

export const CollectionScreen: React.FC<CollectionScreenProps> = ({ onOpenArchive, observationPoints }) => {
  const [activeTab, setActiveTab] = React.useState<CollectionCatalogType>("RECORD");
  const [kimariteFilter, setKimariteFilter] = React.useState<KimariteFilter>("ALL");
  const [dashboard, setDashboard] = React.useState<CollectionDashboardSummary | null>(null);
  const [entriesByType, setEntriesByType] = React.useState<Record<CollectionCatalogType, CollectionCatalogEntry[]>>({
    RECORD: [], ACHIEVEMENT: [], KIMARITE: [],
  });
  const [selectedById, setSelectedById] = React.useState<Partial<Record<CollectionCatalogType, string>>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [upgrades, setUpgrades] = React.useState<ObserverUpgradeView[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      try {
        const [summary, records, achievements, kimarites] = await Promise.all([
          getCollectionDashboardSummary(),
          listCollectionCatalogEntries("RECORD"),
          listCollectionCatalogEntries("ACHIEVEMENT"),
          listCollectionCatalogEntries("KIMARITE"),
        ]);
        if (cancelled) return;
        const next = { RECORD: records, ACHIEVEMENT: achievements, KIMARITE: kimarites };
        setDashboard(summary);
        setEntriesByType(next);
        setUpgrades(await listObserverUpgrades());
        setSelectedById({
          RECORD: records[0]?.id,
          ACHIEVEMENT: achievements[0]?.id,
          KIMARITE: kimarites[0]?.id,
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allEntries = entriesByType[activeTab];
  const filteredEntries =
    activeTab !== "KIMARITE" || kimariteFilter === "ALL"
      ? allEntries
      : allEntries.filter((e) => String(e.meta?.familyLabel ?? "") === kimariteFilter);

  const selectedEntry =
    filteredEntries.find((e) => e.id === selectedById[activeTab]) ??
    filteredEntries[0] ??
    null;

  const totalUnlocked = dashboard?.totalUnlocked ?? 0;
  const totalAll = dashboard?.rows.reduce((s, r) => s + r.total, 0) ?? 0;
  const totalPct = totalAll > 0 ? Math.round((totalUnlocked / totalAll) * 100) : 0;
  const handlePurchaseUpgrade = React.useCallback(async (id: ObserverUpgradeView["id"]) => {
    const result = await purchaseObserverUpgrade(id);
    if (!result.ok) return;
    setUpgrades(await listObserverUpgrades());
  }, []);

  return (
    <div className={styles.shell}>
      {/* ── ヘッダー ── */}
      <div className={cn(surface.panel, styles.header)}>
        <div className={styles.headerLeft}>
          <ProgressRing
            value={totalUnlocked}
            max={Math.max(1, totalAll)}
            size={52}
            strokeWidth={4}
            label={<span className="text-[10px] font-bold" style={{ color: "var(--ui-brand-line)" }}>{totalPct}%</span>}
          />
          <div>
            <div className="text-xs text-text-dim mb-0.5">資料館</div>
            <div className={cn(typography.heading, "text-lg leading-tight text-text")}>
              {isLoading ? "読み込み中…" : `全${totalAll}件中 ${totalUnlocked}件を解放`}
            </div>
            {dashboard?.totalNew ? (
              <div className="mt-1 text-[11px] text-action">新着 {dashboard.totalNew}件</div>
            ) : null}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onOpenArchive}>
          <BookOpenText className="h-3.5 w-3.5 mr-1.5" />
          保存済み記録
        </Button>
      </div>

      <div className={cn(surface.panel, styles.header)}>
        <div className={styles.headerLeft}>
          <span className={styles.categoryIcon}>
            <Unlock className="h-4 w-4" />
          </span>
          <div>
            <div className="text-xs text-text-dim mb-0.5">観測室</div>
            <div className={cn(typography.heading, "text-lg leading-tight text-text")}>
              観測点 {observationPoints?.points ?? 0}
            </div>
            <div className="mt-1 text-[11px] text-text-dim">完走した人生から得た点で、読み解く道具を増やします。</div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {upgrades.slice(0, 3).map((upgrade) => (
            <Button
              key={upgrade.id}
              variant={upgrade.unlocked ? "success" : "outline"}
              size="sm"
              disabled={upgrade.unlocked || (observationPoints?.points ?? 0) < upgrade.cost}
              onClick={() => void handlePurchaseUpgrade(upgrade.id)}
            >
              {upgrade.unlocked ? "解放済み" : `${upgrade.cost}点`}
              <span className="ml-1.5">{upgrade.title}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* ── カテゴリ進捗 ── */}
      {!isLoading && dashboard && (
        <div className={styles.categoryGrid}>
          {dashboard.rows.map((row) => {
            const pct = row.total > 0 ? (row.unlocked / row.total) * 100 : 0;
            const tabDef = TAB_DEFS.find((t) => t.id === row.type);
            const Icon = tabDef?.icon ?? Award;
            return (
              <button
                key={row.type}
                type="button"
                className={styles.categoryCard}
                data-active={activeTab === row.type}
                onClick={() => setActiveTab(row.type)}
              >
                <div className={styles.categoryTop}>
                  <span className={styles.categoryIcon}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className={styles.categoryLabel}>{row.label}</span>
                  {row.newCount > 0 && (
                    <span className={styles.categoryNew}>NEW {row.newCount}</span>
                  )}
                </div>
                <div className={styles.categoryCount}>
                  {row.unlocked}<span className={styles.categoryTotal}>/{row.total}</span>
                </div>
                <div className={styles.categoryBar}>
                  <div
                    className={styles.categoryBarFill}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── ローディング ── */}
      {isLoading && (
        <div className={styles.loading}>
          <Activity className="h-6 w-6 text-text-dim animate-pulse" />
          <span className="text-sm text-text-dim">読み込み中…</span>
        </div>
      )}

      {/* ── メインコンテンツ ── */}
      {!isLoading && (
        <div className={styles.body}>
          {/* 左: カタログ */}
          <section className={cn(surface.panel, styles.catalog)}>
            {/* タブ */}
            <div className={styles.tabs}>
              {TAB_DEFS.map((tab) => {
                const Icon = tab.icon;
                const row = dashboard?.rows.find((r) => r.type === tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={styles.tab}
                    data-active={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{tab.label}</span>
                    {row && (
                      <span className={styles.tabCount}>{row.unlocked}/{row.total}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 決まり手フィルター */}
            {activeTab === "KIMARITE" && (
              <div className={styles.filterRow}>
                {KIMARITE_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={styles.chip}
                    data-active={kimariteFilter === f}
                    onClick={() => setKimariteFilter(f)}
                  >
                    {f === "ALL" ? "すべて" : f}
                  </button>
                ))}
              </div>
            )}

            {/* エントリーリスト */}
            <div className={styles.list}>
              {filteredEntries.length === 0 && (
                <div className={styles.empty}>
                  <span className="text-sm text-text-dim">該当する項目がありません</span>
                </div>
              )}
              {filteredEntries.map((entry) => {
                const isUnlocked = entry.state === "UNLOCKED";
                const isActive = selectedEntry?.id === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={styles.entry}
                    data-active={isActive}
                    data-unlocked={isUnlocked}
                    onClick={() => setSelectedById((prev) => ({ ...prev, [activeTab]: entry.id }))}
                  >
                    <span className={styles.entryIcon}>
                      {isUnlocked
                        ? <CheckCircle2 className="h-3.5 w-3.5" />
                        : <Lock className="h-3 w-3" />}
                    </span>
                    <span className={styles.entryName}>
                      {isUnlocked ? entry.label : "?????"}
                    </span>
                    {entry.tier && isUnlocked && (
                      <span className={styles.entryTier} data-tier={entry.tier}>
                        {entry.tier === "GOLD" ? "金" : entry.tier === "SILVER" ? "銀" : "銅"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 右: 詳細パネル */}
          <section className={cn(surface.panel, styles.detail)}>
            {selectedEntry ? (
              <EntryDetail entry={selectedEntry} />
            ) : (
              <div className={styles.detailEmpty}>
                <BookOpenText className="h-8 w-8 text-text-dim/40" />
                <span className="text-sm text-text-dim">左のリストから項目を選択してください</span>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── 最近の解放 ── */}
      {!isLoading && !!dashboard?.recentUnlocks.length && (
        <div className={cn(surface.panel, styles.recent)}>
          <div className={styles.recentHeader}>
            <Clock className="h-3.5 w-3.5 text-text-dim" />
            <span className="text-xs text-text-dim">最近の解放</span>
          </div>
          <div className={styles.recentList}>
            {dashboard.recentUnlocks.slice(0, 8).map((item) => (
              <div key={item.id} className={styles.recentItem}>
                <span className={styles.recentName}>{item.label}</span>
                <span className={styles.recentDate}>{formatDate(item.unlockedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── 詳細パネルの中身 ── */
const EntryDetail: React.FC<{ entry: CollectionCatalogEntry }> = ({ entry }) => {
  const isUnlocked = entry.state === "UNLOCKED";
  return (
    <div className={cn(styles.detailInner, "animate-in fade-in duration-300")}>
      {/* カテゴリバッジ */}
      <div className={styles.detailType}>{resolveTypeLabel(entry.type)}</div>

      {/* タイトル */}
      <div className={styles.detailTitle}>
        {isUnlocked ? entry.label : "?????"}
      </div>

      {/* 説明 */}
      <div className={styles.detailDesc}>
        {isUnlocked
          ? entry.description
          : "条件を満たすと解放されます。"}
      </div>

      {/* メタ情報 */}
      <div className={styles.detailMeta}>
        <MetaRow label="状態" value={isUnlocked ? "解放済み" : "未解放"} highlight={isUnlocked} />
        {entry.tier && <MetaRow label="レアリティ" value={resolveTierLabel(entry.tier)} />}
        {entry.unlockedAt && <MetaRow label="解放日" value={formatDate(entry.unlockedAt)} />}
        {typeof entry.progress === "number" && (
          <MetaRow
            label="進捗"
            value={entry.target ? `${entry.progress} / ${entry.target}` : String(entry.progress)}
          />
        )}
        {entry.meta && Object.entries(entry.meta)
          .filter(([, v]) => v !== false && typeof v !== "object")
          .map(([key, value]) => (
            <MetaRow key={key} label={resolveMetaLabel(key)} value={value === true ? "達成" : String(value)} />
          ))}
      </div>

      {/* 進捗バー */}
      {typeof entry.progress === "number" && typeof entry.target === "number" && entry.target > 0 && (
        <div className={styles.progressWrap}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.min(100, (entry.progress / entry.target) * 100)}%` }}
            />
          </div>
          <span className={styles.progressLabel}>
            {Math.round((entry.progress / entry.target) * 100)}%
          </span>
        </div>
      )}

      {/* 未解放ヒント */}
      {!isUnlocked && (
        <div className={styles.detailHint}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>条件を達成すると解放されます。特定の成績・実績が必要です。</span>
        </div>
      )}
    </div>
  );
};

const MetaRow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({
  label, value, highlight,
}) => (
  <div className={styles.metaRow}>
    <span className={styles.metaLabel}>{label}</span>
    <span className={cn(styles.metaValue, highlight && styles.metaValueHighlight)}>{value}</span>
  </div>
);

/* ── ユーティリティ ── */
const resolveTypeLabel = (type: CollectionCatalogType): string => {
  if (type === "RECORD") return "生涯記録";
  if (type === "ACHIEVEMENT") return "偉業";
  return "決まり手";
};

const resolveTierLabel = (tier: string): string => {
  if (tier === "GOLD") return "金";
  if (tier === "SILVER") return "銀";
  return "銅";
};

const resolveMetaLabel = (key: string): string => {
  const map: Record<string, string> = {
    scoreBonus: "評点ボーナス",
    category: "技の分類",
    tier: "レアリティ",
    familyLabel: "技系統",
    rarityLabel: "出現頻度",
    isNonTechnique: "特殊勝負",
  };
  return map[key] ?? key;
};

const formatDate = (value: string): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};
