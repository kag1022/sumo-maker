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
import type { LocaleCode } from "../../../shared/lib/locale";
import { useLocale } from "../../../shared/hooks/useLocale";
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

const TAB_LABELS_EN: Record<CollectionCatalogType, { label: string; shortLabel: string }> = {
  RECORD: { label: "Career Records", shortLabel: "Records" },
  ACHIEVEMENT: { label: "Achievements", shortLabel: "Feats" },
  KIMARITE: { label: "Kimarite", shortLabel: "Kimarite" },
};

const KIMARITE_FILTER_LABELS_EN: Record<KimariteFilter, string> = {
  ALL: "All",
  "押し・突き": "Push/Thrust",
  "寄り・極め": "Force-out/Lock",
  投げ: "Throws",
  "捻り・落とし": "Twist/Drop",
  "足取り・掛け": "Trips/Picks",
  反り: "Back bends",
  送り: "Rear attacks",
  非技: "Non-technique",
};

const RARITY_LABELS_EN: Record<string, string> = {
  常用: "Common",
  準レア: "Uncommon",
  珍技: "Rare",
  極珍: "Very rare",
};

const OBSERVER_UPGRADE_EN_LABELS: Record<string, string> = {
  SCOUT_NOTES: "Observation Notes",
  SAVE_TAGS_PLUS: "Save Tags",
  ARCHIVE_FILTERS: "Shelf Index",
  RIVALRY_READING: "Rivalry Reading",
  KEY_BASHO_PICKUP: "Key Basho Picks",
  EXPERIMENT_LAB: "Experimental Observation",
};

const RECORD_ENTRY_EN: Record<string, { label: string; description: string }> = {
  YOKOZUNA_REACHED: { label: "Reached Yokozuna", description: "Highest rank reached Yokozuna." },
  OZEKI_REACHED: { label: "Reached Ozeki", description: "Highest rank reached Ozeki." },
  MAKUUCHI_REACHED: { label: "Reached Makuuchi", description: "Highest rank reached the top division." },
  SEKITORI_REACHED: { label: "Reached Sekitori", description: "Highest rank reached Juryo or above." },
  MAKUUCHI_YUSHO: { label: "Makuuchi Yusho", description: "Won a top-division championship." },
  JURYO_YUSHO: { label: "Juryo Yusho", description: "Won a Juryo championship." },
  SANSHO: { label: "Special Prize", description: "Received a special prize." },
  KINBOSHI: { label: "Kinboshi", description: "Defeated a Yokozuna as a maegashira." },
  DOUBLE_DIGIT_WINS: { label: "Double-digit Wins", description: "Recorded at least 10 wins in one basho." },
  HIGH_WIN_RATE: { label: "High Win Rate", description: "Maintained a high career win rate over a long career." },
  LONG_CAREER: { label: "Long Career", description: "Stayed on the dohyo for a long career." },
  KACHIKOSHI_STREAK: { label: "Kachi-koshi Streak", description: "Recorded winning records across multiple basho." },
};

const ACHIEVEMENT_ENTRY_EN: Record<string, { label: string; description: string }> = {
  YUSHO_1: { label: "1 Makuuchi Yusho", description: "Win one top-division championship." },
  YUSHO_10: { label: "10 Makuuchi Yusho", description: "Win ten top-division championships." },
  YUSHO_20: { label: "20 Makuuchi Yusho", description: "Win at least twenty top-division championships." },
  ZENSHO_1: { label: "1 Zensho Yusho", description: "Win one perfect top-division championship." },
  ZENSHO_5: { label: "5 Zensho Yusho", description: "Win five perfect top-division championships." },
  WINS_100: { label: "100 Career Wins", description: "Reach 100 career wins." },
  WINS_300: { label: "300 Career Wins", description: "Reach 300 career wins." },
  WINS_500: { label: "500 Career Wins", description: "Reach 500 career wins." },
  WINS_1000: { label: "1000 Career Wins", description: "Reach 1000 career wins." },
  AGE_35: { label: "Active at 35", description: "Stay active through age 35 or older." },
  AGE_40: { label: "Active at 40", description: "Stay active through age 40 or older." },
  IRONMAN_30: { label: "30 Basho Ironman", description: "Continue for 30 or more basho without absences." },
  IRONMAN: { label: "60 Basho Ironman", description: "Continue for 60 or more basho without absences." },
  STREAK_8: { label: "8 Makuuchi Kachi-koshi", description: "Record eight straight winning records in makuuchi." },
  STREAK_15: { label: "15 Makuuchi Kachi-koshi", description: "Record fifteen straight winning records in makuuchi." },
  STREAK_30: { label: "30 Makuuchi Kachi-koshi", description: "Record thirty straight winning records in makuuchi." },
  RAPID_PROMOTION_18: { label: "Makuuchi Within 18 Basho", description: "Reach makuuchi within 18 basho of debut." },
  RAPID_PROMOTION: { label: "Makuuchi Within 12 Basho", description: "Reach makuuchi within 12 basho of debut." },
  SANSHO_3: { label: "3 Special Prizes", description: "Receive at least three special prizes." },
  SANSHO_10: { label: "10 Special Prizes", description: "Receive at least ten special prizes." },
  SANSHO_ALL: { label: "All Special Prizes x5", description: "Receive each special prize at least five times." },
  GRAND_SLAM: { label: "Lower-Juryo-Makuuchi Yusho", description: "Win championships in Makushita, Juryo, and Makuuchi." },
  KINBOSHI_1: { label: "1 Kinboshi", description: "Earn at least one kinboshi." },
  KINBOSHI_5: { label: "5 Kinboshi", description: "Earn at least five kinboshi." },
  KIMARITE_20: { label: "20 Winning Kimarite", description: "Win with at least twenty different kimarite." },
  FIRST_STEP: { label: "First Win", description: "Record a first win on the ozumo stage." },
};

interface CollectionScreenProps {
  onOpenArchive: () => void;
  observationPoints: ObservationPointState | null;
}

const resolveTabLabel = (type: CollectionCatalogType, locale: LocaleCode): string =>
  locale === "en" ? TAB_LABELS_EN[type].label : TAB_DEFS.find((tab) => tab.id === type)?.label ?? type;

const resolveKimariteFilterLabel = (filter: KimariteFilter, locale: LocaleCode): string =>
  locale === "en" ? KIMARITE_FILTER_LABELS_EN[filter] : filter === "ALL" ? "すべて" : filter;

const resolveUpgradeTitle = (upgrade: ObserverUpgradeView, locale: LocaleCode): string =>
  locale === "en" ? OBSERVER_UPGRADE_EN_LABELS[upgrade.id] ?? upgrade.title : upgrade.title;

const resolveEntryCopy = (
  entry: CollectionCatalogEntry,
  locale: LocaleCode,
): { label: string; description?: string } => {
  if (locale !== "en") return { label: entry.label, description: entry.description };
  if (entry.state === "LOCKED") return { label: "?????", description: "Unlock this entry by meeting its condition." };
  if (entry.type === "RECORD") return RECORD_ENTRY_EN[entry.key] ?? { label: entry.label, description: "A saved career record entry." };
  if (entry.type === "ACHIEVEMENT") return ACHIEVEMENT_ENTRY_EN[entry.key] ?? { label: entry.label, description: "An achievement unlocked by a completed career." };
  const family = typeof entry.meta?.familyLabel === "string" ? KIMARITE_FILTER_LABELS_EN[entry.meta.familyLabel as KimariteFilter] ?? entry.meta.familyLabel : "kimarite";
  const nonTechnique = entry.meta?.isNonTechnique === true;
  return {
    label: entry.label,
    description: nonTechnique ? "A non-technique result outside the official kimarite list." : `An official kimarite in the ${family} family.`,
  };
};

const resolveRecentUnlockLabel = (
  item: { id: string; type: CollectionCatalogType; label: string },
  locale: LocaleCode,
): string => {
  if (locale !== "en") return item.label;
  const key = item.id.startsWith(`${item.type}:`) ? item.id.slice(item.type.length + 1) : item.id;
  if (item.type === "RECORD") return RECORD_ENTRY_EN[key]?.label ?? item.label;
  if (item.type === "ACHIEVEMENT") return ACHIEVEMENT_ENTRY_EN[key]?.label ?? item.label;
  if (item.type === "KIMARITE") return item.label.replace(/^決まり手：/, "Kimarite: ");
  return item.label;
};

export const CollectionScreen: React.FC<CollectionScreenProps> = ({ onOpenArchive, observationPoints }) => {
  const { locale } = useLocale();
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
            <div className="text-xs text-text-dim mb-0.5">{locale === "en" ? "Collection" : "資料館"}</div>
            <div className={cn(typography.heading, "text-lg leading-tight text-text")}>
              {isLoading ? (locale === "en" ? "Loading..." : "読み込み中…") : (locale === "en" ? `${totalUnlocked} of ${totalAll} unlocked` : `全${totalAll}件中 ${totalUnlocked}件を解放`)}
            </div>
            {dashboard?.totalNew ? (
              <div className="mt-1 text-[11px] text-action">{locale === "en" ? `New ${dashboard.totalNew}` : `新着 ${dashboard.totalNew}件`}</div>
            ) : null}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onOpenArchive}>
          <BookOpenText className="h-3.5 w-3.5 mr-1.5" />
          {locale === "en" ? "Saved Records" : "保存済み記録"}
        </Button>
      </div>

      <div className={cn(surface.panel, styles.header)}>
        <div className={styles.headerLeft}>
          <span className={styles.categoryIcon}>
            <Unlock className="h-4 w-4" />
          </span>
          <div>
            <div className="text-xs text-text-dim mb-0.5">{locale === "en" ? "Observation Room" : "観測室"}</div>
            <div className={cn(typography.heading, "text-lg leading-tight text-text")}>
              {locale === "en" ? `Observation Points ${observationPoints?.points ?? 0}` : `観測点 ${observationPoints?.points ?? 0}`}
            </div>
            <div className="mt-1 text-[11px] text-text-dim">
              {locale === "en" ? "Use points earned from completed careers to unlock better reading tools." : "完走した人生から得た点で、読み解く道具を増やします。"}
            </div>
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
              {upgrade.unlocked ? (locale === "en" ? "Unlocked" : "解放済み") : (locale === "en" ? `${upgrade.cost} pts` : `${upgrade.cost}点`)}
              <span className="ml-1.5">{resolveUpgradeTitle(upgrade, locale)}</span>
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
                  <span className={styles.categoryLabel}>{resolveTabLabel(row.type, locale)}</span>
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
          <span className="text-sm text-text-dim">{locale === "en" ? "Loading..." : "読み込み中…"}</span>
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
                    <span>{locale === "en" ? TAB_LABELS_EN[tab.id].label : tab.label}</span>
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
                    {resolveKimariteFilterLabel(f, locale)}
                  </button>
                ))}
              </div>
            )}

            {/* エントリーリスト */}
            <div className={styles.list}>
              {filteredEntries.length === 0 && (
                <div className={styles.empty}>
                  <span className="text-sm text-text-dim">{locale === "en" ? "No matching entries" : "該当する項目がありません"}</span>
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
                      {isUnlocked ? resolveEntryCopy(entry, locale).label : "?????"}
                    </span>
                    {entry.tier && isUnlocked && (
                      <span className={styles.entryTier} data-tier={entry.tier}>
                        {resolveTierLabel(entry.tier, locale)}
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
              <EntryDetail entry={selectedEntry} locale={locale} />
            ) : (
              <div className={styles.detailEmpty}>
                <BookOpenText className="h-8 w-8 text-text-dim/40" />
                <span className="text-sm text-text-dim">{locale === "en" ? "Select an entry from the list" : "左のリストから項目を選択してください"}</span>
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
            <span className="text-xs text-text-dim">{locale === "en" ? "Recent Unlocks" : "最近の解放"}</span>
          </div>
          <div className={styles.recentList}>
            {dashboard.recentUnlocks.slice(0, 8).map((item) => (
              <div key={item.id} className={styles.recentItem}>
                <span className={styles.recentName}>{resolveRecentUnlockLabel(item, locale)}</span>
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
const EntryDetail: React.FC<{ entry: CollectionCatalogEntry; locale: LocaleCode }> = ({ entry, locale }) => {
  const isUnlocked = entry.state === "UNLOCKED";
  const copy = resolveEntryCopy(entry, locale);
  return (
    <div className={cn(styles.detailInner, "animate-in fade-in duration-300")}>
      {/* カテゴリバッジ */}
      <div className={styles.detailType}>{resolveTypeLabel(entry.type, locale)}</div>

      {/* タイトル */}
      <div className={styles.detailTitle}>
        {isUnlocked ? copy.label : "?????"}
      </div>

      {/* 説明 */}
      <div className={styles.detailDesc}>
        {isUnlocked
          ? copy.description
          : locale === "en" ? "Unlock this entry by meeting its condition." : "条件を満たすと解放されます。"}
      </div>

      {/* メタ情報 */}
      <div className={styles.detailMeta}>
        <MetaRow label={locale === "en" ? "State" : "状態"} value={isUnlocked ? (locale === "en" ? "Unlocked" : "解放済み") : (locale === "en" ? "Locked" : "未解放")} highlight={isUnlocked} />
        {entry.tier && <MetaRow label={locale === "en" ? "Rarity" : "レアリティ"} value={resolveTierLabel(entry.tier, locale)} />}
        {entry.unlockedAt && <MetaRow label={locale === "en" ? "Unlocked Date" : "解放日"} value={formatDate(entry.unlockedAt)} />}
        {typeof entry.progress === "number" && (
          <MetaRow
            label={locale === "en" ? "Progress" : "進捗"}
            value={entry.target ? `${entry.progress} / ${entry.target}` : String(entry.progress)}
          />
        )}
        {entry.meta && Object.entries(entry.meta)
          .filter(([, v]) => v !== false && typeof v !== "object")
          .map(([key, value]) => (
            <MetaRow key={key} label={resolveMetaLabel(key, locale)} value={formatMetaValue(key, value, locale)} />
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
          <span>{locale === "en" ? "Meet the condition to unlock this entry. Specific records or achievements may be required." : "条件を達成すると解放されます。特定の成績・実績が必要です。"}</span>
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
const resolveTypeLabel = (type: CollectionCatalogType, locale: LocaleCode): string => {
  if (locale === "en") return TAB_LABELS_EN[type].label;
  if (type === "RECORD") return "生涯記録";
  if (type === "ACHIEVEMENT") return "偉業";
  return "決まり手";
};

const resolveTierLabel = (tier: string, locale: LocaleCode): string => {
  if (locale === "en") {
    if (tier === "GOLD") return "Gold";
    if (tier === "SILVER") return "Silver";
    return "Bronze";
  }
  if (tier === "GOLD") return "金";
  if (tier === "SILVER") return "銀";
  return "銅";
};

const resolveMetaLabel = (key: string, locale: LocaleCode): string => {
  if (locale === "en") {
    const map: Record<string, string> = {
      scoreBonus: "Score bonus",
      category: "Category",
      tier: "Tier",
      familyLabel: "Technique family",
      rarityLabel: "Frequency",
      isNonTechnique: "Non-technique",
    };
    return map[key] ?? key;
  }
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

const formatMetaValue = (
  key: string,
  value: string | number | boolean,
  locale: LocaleCode,
): string => {
  if (locale !== "en") return value === true ? "達成" : String(value);
  if (value === true) return "Achieved";
  if (typeof value !== "string") return String(value);
  if (key === "familyLabel") return KIMARITE_FILTER_LABELS_EN[value as KimariteFilter] ?? value;
  if (key === "rarityLabel") return RARITY_LABELS_EN[value] ?? value;
  if (key === "category") {
    const map: Record<string, string> = {
      優勝: "Yusho",
      全勝優勝: "Perfect yusho",
      通算勝利: "Career wins",
      現役年齢: "Active age",
      無休場: "Ironman",
      連続勝ち越し: "Kachi-koshi streak",
      新入幕速度: "Top division speed",
      三賞: "Special prizes",
      各段優勝: "Division yusho",
      金星: "Kinboshi",
      決まり手: "Kimarite",
      初勝利: "First win",
    };
    return map[value] ?? value;
  }
  return value;
};

const formatDate = (value: string): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};
