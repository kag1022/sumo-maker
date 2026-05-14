import React from "react";
import {
  ChevronRight,
  Compass,
  Eye as TelescopeIcon,
  LibraryBig,
  LockKeyhole,
  ScrollText,
} from "lucide-react";
import { cn } from "../../shared/lib/cn";
import surface from "../../shared/styles/surface.module.css";
import typography from "../../shared/styles/typography.module.css";
import { Button } from "../../shared/ui/Button";
import { getDb, type CareerRow } from "../../logic/persistence/db";
import { listArchiveCategories, ARCHIVE_CATEGORIES } from "../../logic/archive/categories";
import { OBSERVATION_THEMES } from "../../logic/archive/observationThemes";
import type {
  ArchiveCategoryDefinition,
  ArchiveCategoryId,
  CareerTitleTier,
  ObservationThemeId,
} from "../../logic/archive/types";
import styles from "./ArchiveCollectionScreen.module.css";

interface ArchiveCollectionScreenProps {
  onOpenCareer: (careerId: string) => void;
  onOpenObservationBuild?: () => void;
}

type FilterMode =
  | "ALL"
  | { kind: "category"; id: ArchiveCategoryId }
  | { kind: "theme"; id: ObservationThemeId }
  | { kind: "tier"; tier: CareerTitleTier }
  | "TITLED";

type MuseumGroupKey = "life" | "rank" | "honor" | "torikumi" | "rare";

interface MuseumGroup {
  key: MuseumGroupKey;
  title: string;
  lead: string;
  categories: ArchiveCategoryDefinition[];
}

interface MuseumSummary {
  observedCount: number;
  savedCount: number;
  unlockedCategoryCount: number;
  unlockedTitleCount: number;
  totalCategoryCount: number;
  totalTitleSlots: number;
  recentCareer: CareerRow | null;
  recentRecordText: string;
  rankBreakdown: Array<{ label: string; count: number }>;
  highlights: Array<{ label: string; value: string; note: string }>;
}

interface MuseumProgressRow {
  key: MuseumGroupKey;
  title: string;
  total: number;
  unlocked: number;
  nextCategory: ArchiveCategoryDefinition | null;
}

const GROUP_META: Record<MuseumGroupKey, Omit<MuseumGroup, "key" | "categories">> = {
  life: {
    title: "力士人生の記録",
    lead: "入門から終幕までの輪郭が残る棚。",
  },
  rank: {
    title: "番付・昇進の記録",
    lead: "どこまで上がり、どこで足踏みしたかを読む棚。",
  },
  honor: {
    title: "優勝・賞の記録",
    lead: "土俵で刻んだ結果と晴れ場を集める棚。",
  },
  torikumi: {
    title: "取組・決まり手の記録",
    lead: "相手関係や勝ち筋から一代を読むための棚。",
  },
  rare: {
    title: "珍記録・例外的な一代",
    lead: "まっすぐではない軌跡や、記録として残したい余白の棚。",
  },
};

const GROUP_ORDER: MuseumGroupKey[] = ["life", "rank", "honor", "torikumi", "rare"];

const TIER_FILTERS: Array<{ tier: CareerTitleTier; label: string }> = [
  { tier: "rare", label: "希少な称号" },
  { tier: "epic", label: "特別な称号" },
  { tier: "legendary", label: "伝説級の称号" },
];

const tierRank: Record<CareerTitleTier, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

const PROMOTION_CATEGORY_IDS = new Set<ArchiveCategoryId>([
  "sekitori_reached",
  "makuuchi_reached",
  "sanyaku_reached",
  "yokozuna_reached",
]);

const RARE_CATEGORY_IDS = new Set<ArchiveCategoryId>([
  "fast_riser",
  "late_bloomer",
  "long_stagnation",
]);

const filterEquals = (a: FilterMode, b: FilterMode): boolean => {
  if (a === b) return true;
  if (typeof a === "string" || typeof b === "string") return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "tier" && b.kind === "tier") return a.tier === b.tier;
  if (a.kind === "category" && b.kind === "category") return a.id === b.id;
  if (a.kind === "theme" && b.kind === "theme") return a.id === b.id;
  return false;
};

const isArchiveCategoryId = (value: string): value is ArchiveCategoryId =>
  value in ARCHIVE_CATEGORIES;

const toArchiveCategoryIds = (values?: string[]): ArchiveCategoryId[] =>
  (values ?? []).filter(isArchiveCategoryId);

const formatRankName = (rank: CareerRow["maxRank"]): string => {
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) return `${side}${rank.name}`;
  const number = rank.number || 1;
  return number === 1 ? `${side}${rank.name}筆頭` : `${side}${rank.name}${number}枚目`;
};

const formatCareerPeriod = (
  row: Pick<CareerRow, "careerStartYearMonth" | "careerEndYearMonth">,
): string => `${row.careerStartYearMonth} - ${row.careerEndYearMonth || "現在"}`;

const formatRecordLabel = (
  row: Pick<CareerRow, "totalWins" | "totalLosses" | "totalAbsent">,
): string => `${row.totalWins}勝${row.totalLosses}敗${row.totalAbsent > 0 ? `${row.totalAbsent}休` : ""}`;

const resolveThemeLabel = (themeId?: string): string | null => {
  if (!themeId) return null;
  return OBSERVATION_THEMES[themeId as ObservationThemeId]?.label ?? "観測テーマ未詳";
};

const resolveCategoryGroupKey = (category: ArchiveCategoryDefinition): MuseumGroupKey => {
  const text = `${category.label} ${category.description}`;
  if (/優勝|賞/.test(text)) return "honor";
  if (/取組|決まり手|宿敵|相手/.test(text)) return "torikumi";
  if (/晩成|停滞|快進撃|珍|休場|復帰/.test(text)) return "rare";
  if (/番付|昇進|横綱|大関|三役|幕内|十両|幕下|三段目|壁|関取/.test(text)) return "rank";
  return "life";
};

const buildMuseumGroups = (categories: ArchiveCategoryDefinition[]): MuseumGroup[] => {
  const grouped = new Map<MuseumGroupKey, ArchiveCategoryDefinition[]>();
  for (const key of GROUP_ORDER) grouped.set(key, []);
  for (const category of categories) {
    const key = resolveCategoryGroupKey(category);
    grouped.get(key)?.push(category);
  }
  return GROUP_ORDER.map((key) => ({
    key,
    ...GROUP_META[key],
    categories: grouped.get(key) ?? [],
  }));
};

const resolveCategoryReading = (category: ArchiveCategoryDefinition): string => {
  if (category.id === "yokozuna_reached") return "最高位まで届いた一代を、番付の到達点として残します。";
  if (category.id === "sekitori_reached") return "十両以上へ進んだ一代を、関取到達の記録として残します。";
  if (category.id === "makuuchi_reached") return "幕内まで進んだ一代を、上位土俵への到達として残します。";
  if (category.id === "sanyaku_reached") return "三役まで進んだ一代を、番付上位の記録として残します。";
  if (category.id === "fast_riser") return "序盤から番付を動かした一代を、勢いのある軌跡として残します。";
  if (category.id === "late_bloomer") return "遅れて花開いた一代を、時間をかけた伸びとして残します。";
  if (category.id === "long_stagnation") return "長く同じ帯に留まった一代を、粘りや壁の記録として残します。";
  if (category.id.startsWith("wall_") || category.id === "makushita_wall") {
    return "届きそうで届かない番付帯を、読みどころとして残します。";
  }
  return "一代の中で見つかった特徴を、資料館の分類として残します。";
};

const resolveMissingHint = (category: ArchiveCategoryDefinition): string => {
  if (PROMOTION_CATEGORY_IDS.has(category.id)) {
    return "高い番付まで届く一代で見つかりやすい記録です。";
  }
  if (category.id === "fast_riser") {
    return "序盤から番付を早く動かす一代で見つかりやすい記録です。";
  }
  if (category.id === "late_bloomer") {
    return "序盤で決まらず、後半に伸びる一代で見つかりやすい記録です。";
  }
  if (category.id === "long_stagnation") {
    return "長く土俵に残り、同じ番付帯で読みどころが出る一代で見つかりやすい記録です。";
  }
  return "まだ資料館にない軌跡です。違う入口条件で観測すると見つかる可能性があります。";
};

const resolveRecentRecordText = (row: CareerRow | null): string => {
  if (!row) return "まだ記録は増えていません";
  const delta = row.collectionDeltaCount ?? 0;
  if (delta > 0) return `${row.shikona}で新規記録 ${delta}件`;
  const titles = row.archiveTitles?.length ?? 0;
  if (titles > 0) return `${row.shikona}で称号 ${titles}件`;
  const categories = row.archiveCategories?.length ?? 0;
  if (categories > 0) return `${row.shikona}で分類 ${categories}件`;
  return `${row.shikona}を最近追加`;
};

const buildRankBreakdown = (rows: CareerRow[]): Array<{ label: string; count: number }> =>
  [
    { label: "横綱", count: rows.filter((row) => row.maxRank.name === "横綱").length },
    { label: "大関", count: rows.filter((row) => row.maxRank.name === "大関").length },
    { label: "三役", count: rows.filter((row) => ["関脇", "小結"].includes(row.maxRank.name)).length },
    {
      label: "幕内",
      count: rows.filter((row) =>
        row.maxRank.division === "Makuuchi" &&
        !["横綱", "大関", "関脇", "小結"].includes(row.maxRank.name),
      ).length,
    },
    { label: "十両以下", count: rows.filter((row) => row.maxRank.division !== "Makuuchi").length },
  ].filter((entry) => entry.count > 0);

const buildMuseumSummary = (
  rows: CareerRow[],
  collectedCategories: Set<string>,
  collectedTitleIds: Set<string>,
  totalCategoryCount: number,
  totalTitleSlots: number,
): MuseumSummary => {
  const recentCareer = [...rows].sort((left, right) =>
    (right.archiveJudgedAt || right.savedAt || right.updatedAt || "").localeCompare(
      left.archiveJudgedAt || left.savedAt || left.updatedAt || "",
    ),
  )[0] ?? null;
  const yushoCareers = rows.filter((row) =>
    row.yushoCount.makuuchi + row.yushoCount.juryo + row.yushoCount.makushita + row.yushoCount.others > 0,
  ).length;
  const promotionUnlocked = [...PROMOTION_CATEGORY_IDS].filter((id) => collectedCategories.has(id)).length;
  const rareUnlocked = [...RARE_CATEGORY_IDS].filter((id) => collectedCategories.has(id)).length;
  const torikumiLikeRecords = rows.reduce((sum, row) => {
    const titles = row.archiveTitles ?? [];
    return sum + titles.filter((title) => /取組|決まり手|寄り切り|押し出し|投げ|宿敵/.test(title.label)).length;
  }, 0);

  return {
    observedCount: rows.length,
    savedCount: rows.filter((row) => row.state === "shelved" || row.savedAt).length,
    unlockedCategoryCount: collectedCategories.size,
    unlockedTitleCount: collectedTitleIds.size,
    totalCategoryCount,
    totalTitleSlots,
    recentCareer,
    recentRecordText: resolveRecentRecordText(recentCareer),
    rankBreakdown: buildRankBreakdown(rows),
    highlights: [
      {
        label: "最高位到達",
        value: `${promotionUnlocked} / ${PROMOTION_CATEGORY_IDS.size}`,
        note: promotionUnlocked > 0 ? "関取以上の到達記録あり" : "高位到達の記録は未収集",
      },
      {
        label: "優勝・賞",
        value: `${yushoCareers}代`,
        note: collectedTitleIds.size > 0 ? `称号 ${collectedTitleIds.size}件` : "晴れ場の記録はこれから",
      },
      {
        label: "珍記録",
        value: `${rareUnlocked} / ${RARE_CATEGORY_IDS.size}`,
        note: rareUnlocked > 0 ? "例外的な軌跡あり" : "まだ標準的な一代が中心",
      },
      {
        label: "取組・決まり手",
        value: `${torikumiLikeRecords}件`,
        note: torikumiLikeRecords > 0 ? "取組由来の称号あり" : "今の保存情報では未収集",
      },
    ],
  };
};

const findRelatedCareer = (rows: CareerRow[], categoryId: ArchiveCategoryId): CareerRow | null =>
  rows.find((row) => toArchiveCategoryIds(row.archiveCategories).includes(categoryId)) ?? null;

const buildProgressRows = (
  groups: MuseumGroup[],
  collectedCategories: Set<string>,
): MuseumProgressRow[] =>
  groups
    .filter((group) => group.categories.length > 0)
    .map((group) => {
      const missing = group.categories.find((category) => !collectedCategories.has(category.id)) ?? null;
      return {
        key: group.key,
        title: group.title,
        total: group.categories.length,
        unlocked: group.categories.filter((category) => collectedCategories.has(category.id)).length,
        nextCategory: missing,
      };
    });

const buildGapCategories = (
  groups: MuseumGroup[],
  collectedCategories: Set<string>,
): ArchiveCategoryDefinition[] =>
  groups.flatMap((group) => group.categories.filter((category) => !collectedCategories.has(category.id))).slice(0, 5);

export const ArchiveCollectionScreen: React.FC<ArchiveCollectionScreenProps> = ({
  onOpenCareer,
  onOpenObservationBuild,
}) => {
  const [rows, setRows] = React.useState<CareerRow[]>([]);
  const [filter, setFilter] = React.useState<FilterMode>("ALL");
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
          .sort((a, b) => (b.archiveJudgedAt ?? "").localeCompare(a.archiveJudgedAt ?? ""));
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
    for (const row of rows) {
      for (const category of row.archiveCategories ?? []) set.add(category);
    }
    return set;
  }, [rows]);

  const collectedTitleIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      for (const title of row.archiveTitles ?? []) set.add(title.id);
    }
    return set;
  }, [rows]);

  const totalTitleSlots = React.useMemo(() => Math.max(8, collectedTitleIds.size), [collectedTitleIds]);

  const museumGroups = React.useMemo(() => buildMuseumGroups(allCategories), [allCategories]);

  const summary = React.useMemo(
    () => buildMuseumSummary(rows, collectedCategories, collectedTitleIds, allCategories.length, totalTitleSlots),
    [allCategories.length, collectedCategories, collectedTitleIds, rows, totalTitleSlots],
  );

  const progressRows = React.useMemo(
    () => buildProgressRows(museumGroups, collectedCategories),
    [collectedCategories, museumGroups],
  );

  const gapCategories = React.useMemo(
    () => buildGapCategories(museumGroups, collectedCategories),
    [collectedCategories, museumGroups],
  );

  const filtered = rows.filter((row) => {
    if (filter === "ALL") return true;
    if (filter === "TITLED") return (row.archiveTitles ?? []).length > 0;
    if (filter.kind === "theme") return row.archiveThemeId === filter.id;
    if (filter.kind === "category") return toArchiveCategoryIds(row.archiveCategories).includes(filter.id);
    if (filter.kind === "tier") {
      const min = tierRank[filter.tier];
      return (row.archiveTitles ?? []).some((title) =>
        tierRank[(title.tier as CareerTitleTier) ?? "common"] >= min,
      );
    }
    return true;
  });

  const isAllEmpty = !loading && rows.length === 0;
  const isFilterEmpty = !loading && rows.length > 0 && filtered.length === 0;

  return (
    <div className={styles.museum}>
      <section className={cn(surface.panel, styles.hero)}>
        <div className={styles.heroCopy}>
          <div className={styles.titleLine}>
            <LibraryBig className={styles.titleIcon} />
            <div>
              <div className={typography.kicker}>観測資料館</div>
              <h2 className={styles.heroTitle}>観測した一代を、記録の棚として読む</h2>
            </div>
          </div>
          <p className={styles.heroLead}>
            保存された力士人生から、到達した番付、解放された称号、まだ空いている記録の余白を見渡します。
          </p>
          <div className={styles.progressRail} aria-label="資料館サマリー">
            <SummaryStat label="観測済み" value={`${summary.observedCount}`} note="一代" />
            <SummaryStat label="保存済み" value={`${summary.savedCount}`} note="書架入り" />
            <SummaryStat
              label="解放済み記録"
              value={`${summary.unlockedCategoryCount + summary.unlockedTitleCount}`}
              note={`分類 ${summary.unlockedCategoryCount}/${summary.totalCategoryCount}`}
            />
            <SummaryStat
              label="最近増えた記録"
              value={summary.recentCareer?.shikona ?? "未記録"}
              note={summary.recentRecordText}
            />
          </div>
        </div>

        <aside className={styles.heroAside} aria-label="到達状況">
          <div className={styles.sealBox}>
            <span>最高位到達者</span>
            {summary.rankBreakdown.length > 0 ? (
              <div className={styles.rankBreakdown}>
                {summary.rankBreakdown.map((entry) => (
                  <span key={entry.label}>
                    {entry.label}
                    <strong>{entry.count}</strong>
                  </span>
                ))}
              </div>
            ) : (
              <em>まだ到達記録はありません</em>
            )}
          </div>
          <div className={styles.highlightGrid}>
            {summary.highlights.map((highlight) => (
              <div key={highlight.label} className={styles.highlightCard}>
                <span>{highlight.label}</span>
                <strong>{highlight.value}</strong>
                <em>{highlight.note}</em>
              </div>
            ))}
          </div>
        </aside>
      </section>

      {!isAllEmpty ? (
        <section className={cn(surface.panel, styles.filters)}>
          <FilterGroup label="読む範囲">
            <FilterChip label="すべて" active={filter === "ALL"} onClick={() => setFilter("ALL")} />
            <FilterChip label="称号獲得のみ" active={filter === "TITLED"} onClick={() => setFilter("TITLED")} />
          </FilterGroup>

          <FilterGroup label="観測テーマ">
            {(Object.keys(OBSERVATION_THEMES) as ObservationThemeId[]).map((themeId) => (
              <FilterChip
                key={themeId}
                label={OBSERVATION_THEMES[themeId].label}
                active={filter !== "ALL" && filter !== "TITLED" && filter.kind === "theme" && filter.id === themeId}
                onClick={() => setFilter({ kind: "theme", id: themeId })}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="記録分類">
            {allCategories.map((category) => (
              <FilterChip
                key={category.id}
                label={category.label}
                active={filterEquals(filter, { kind: "category", id: category.id })}
                dim={!collectedCategories.has(category.id)}
                onClick={() => setFilter({ kind: "category", id: category.id })}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="称号の深度">
            {TIER_FILTERS.map((tierFilter) => (
              <FilterChip
                key={tierFilter.tier}
                label={tierFilter.label}
                active={filterEquals(filter, { kind: "tier", tier: tierFilter.tier })}
                onClick={() => setFilter({ kind: "tier", tier: tierFilter.tier })}
              />
            ))}
          </FilterGroup>
        </section>
      ) : null}

      <div className={styles.contentGrid}>
        <section className={cn(surface.panel, styles.collectionPanel)}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={typography.kicker}>読む順番</div>
              <h3 className={styles.sectionTitle}>分類別の収集棚</h3>
            </div>
            <span className={styles.countBadge}>
              {summary.unlockedCategoryCount} / {summary.totalCategoryCount}
            </span>
          </div>

          {isAllEmpty ? (
            <EmptyMuseumState onOpenObservationBuild={onOpenObservationBuild} />
          ) : (
            <div className={styles.groupList}>
              {museumGroups.map((group) => (
                <CategoryGroup
                  key={group.key}
                  group={group}
                  rows={rows}
                  collectedCategories={collectedCategories}
                  onOpenCareer={onOpenCareer}
                  onOpenObservationBuild={onOpenObservationBuild}
                />
              ))}
            </div>
          )}
        </section>

        <section className={cn(surface.panel, styles.metaPanel)}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={typography.kicker}>観測地図</div>
              <h3 className={styles.sectionTitle}>未発見から次を決める</h3>
            </div>
            {!isAllEmpty ? (
              <span className={styles.countBadge}>
                参照 {filtered.length}
              </span>
            ) : null}
          </div>

          {loading ? (
            <div className={styles.loading}>読み込み中...</div>
          ) : isAllEmpty ? (
            <div className={styles.recordEmpty}>観測済みの一代が入ると、ここに資料館全体の偏りが出ます。</div>
          ) : isFilterEmpty ? (
            <div className={styles.recordEmpty}>この条件に該当する一代はありません。分類やテーマを変えてください。</div>
          ) : (
            <div className={styles.metaStack}>
              <ProgressMap rows={progressRows} />
              <GapPanel
                categories={gapCategories}
                onOpenObservationBuild={onOpenObservationBuild}
              />
              <ReferenceCareerList rows={filtered.slice(0, 5)} onOpenCareer={onOpenCareer} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const SummaryStat: React.FC<{
  label: string;
  value: string;
  note: string;
}> = ({ label, value, note }) => (
  <div className={styles.summaryStat}>
    <span>{label}</span>
    <strong>{value}</strong>
    <em>{note}</em>
  </div>
);

const FilterGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className={styles.filterGroup}>
    <div className={styles.filterLabel}>{label}</div>
    <div className={styles.filterChips}>{children}</div>
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
    className={styles.filterChip}
    data-active={active ? "true" : "false"}
    data-dim={dim ? "true" : "false"}
  >
    {label}
  </button>
);

const EmptyMuseumState: React.FC<{ onOpenObservationBuild?: () => void }> = ({ onOpenObservationBuild }) => (
  <div className={styles.emptyState}>
    <TelescopeIcon className={styles.emptyIcon} />
    <strong>まだ資料館に一代がありません</strong>
    <p>
      観測設計から一代を観測すると、到達番付や称号がここに収蔵されます。
      まずは結果保証ではなく、どんな人生が残るかを読むための一件を増やしてください。
    </p>
    {onOpenObservationBuild ? (
      <Button size="md" onClick={onOpenObservationBuild}>
        <Compass className="mr-2 h-4 w-4" />
        次の観測設計へ
      </Button>
    ) : null}
  </div>
);

const CategoryGroup: React.FC<{
  group: MuseumGroup;
  rows: CareerRow[];
  collectedCategories: Set<string>;
  onOpenCareer: (careerId: string) => void;
  onOpenObservationBuild?: () => void;
}> = ({ group, rows, collectedCategories, onOpenCareer, onOpenObservationBuild }) => {
  const unlockedCount = group.categories.filter((category) => collectedCategories.has(category.id)).length;
  return (
    <article className={styles.categoryGroup}>
      <header className={styles.groupHead}>
        <div>
          <h4>{group.title}</h4>
          <p>{group.lead}</p>
        </div>
        <span>{group.categories.length > 0 ? `${unlockedCount} / ${group.categories.length}` : "分類待ち"}</span>
      </header>

      {group.categories.length === 0 ? (
        <div className={styles.groupEmpty}>
          この棚は、今の保存情報ではまだ分類されていません。今後の観測で読みどころが増えます。
        </div>
      ) : (
        <div className={styles.categoryGrid}>
          {group.categories.map((category) => {
            const unlocked = collectedCategories.has(category.id);
            const relatedCareer = unlocked ? findRelatedCareer(rows, category.id) : null;
            return (
              <div key={category.id} className={styles.categoryCard} data-unlocked={unlocked ? "true" : "false"}>
                <div className={styles.categoryTop}>
                  {unlocked ? <ScrollText className={styles.categoryIcon} /> : <LockKeyhole className={styles.categoryIcon} />}
                  <span>{unlocked ? "収集済み" : "観測の余白"}</span>
                </div>
                <strong>{category.label}</strong>
                <p>{unlocked ? resolveCategoryReading(category) : resolveMissingHint(category)}</p>
                <div className={styles.categoryAction}>
                  {relatedCareer ? (
                    <Button size="sm" variant="ghost" onClick={() => onOpenCareer(relatedCareer.id)}>
                      この記録を持つ一代を読む
                      <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  ) : onOpenObservationBuild ? (
                    <Button size="sm" variant="ghost" onClick={onOpenObservationBuild}>
                      似た一代を探す
                      <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
};

const ProgressMap: React.FC<{ rows: MuseumProgressRow[] }> = ({ rows }) => (
  <div className={styles.metaBlock}>
    <div className={styles.metaHead}>
      <h4>棚の進み具合</h4>
      <span>分類単位</span>
    </div>
    <div className={styles.progressList}>
      {rows.map((row) => {
        const progress = row.total > 0 ? Math.round((row.unlocked / row.total) * 100) : 0;
        return (
          <div key={row.key} className={styles.progressItem}>
            <div className={styles.progressItemHead}>
              <strong>{row.title}</strong>
              <span>
                {row.unlocked} / {row.total}
              </span>
            </div>
            <div className={styles.progressTrack} aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
            <em>{row.nextCategory ? `次の余白: ${row.nextCategory.label}` : "この棚の分類は収集済み"}</em>
          </div>
        );
      })}
    </div>
  </div>
);

const GapPanel: React.FC<{
  categories: ArchiveCategoryDefinition[];
  onOpenObservationBuild?: () => void;
}> = ({ categories, onOpenObservationBuild }) => (
  <div className={styles.metaBlock}>
    <div className={styles.metaHead}>
      <h4>次に空いている余白</h4>
      <span>{categories.length > 0 ? `${categories.length}件表示` : "空きなし"}</span>
    </div>
    {categories.length > 0 ? (
      <ul className={styles.gapList}>
        {categories.map((category) => (
          <li key={category.id}>
            <strong>{category.label}</strong>
            <p>{resolveMissingHint(category)}</p>
          </li>
        ))}
      </ul>
    ) : (
      <div className={styles.recordEmpty}>表示中の分類棚はすべて埋まっています。</div>
    )}
    {onOpenObservationBuild ? (
      <Button size="sm" variant="ghost" onClick={onOpenObservationBuild}>
        次の観測設計へ
        <ChevronRight className="ml-1 h-3.5 w-3.5" />
      </Button>
    ) : null}
  </div>
);

const ReferenceCareerList: React.FC<{
  rows: CareerRow[];
  onOpenCareer: (careerId: string) => void;
}> = ({ rows, onOpenCareer }) => (
  <div className={styles.referenceBlock}>
    <div className={styles.metaHead}>
      <h4>関連する一代</h4>
      <span>代表例だけ表示</span>
    </div>
    <ul className={styles.referenceList}>
      {rows.map((row) => (
        <ReferenceCareerRow key={row.id} row={row} onOpenCareer={onOpenCareer} />
      ))}
    </ul>
  </div>
);

const ReferenceCareerRow: React.FC<{
  row: CareerRow;
  onOpenCareer: (careerId: string) => void;
}> = ({ row, onOpenCareer }) => {
  const themeLabel = resolveThemeLabel(row.archiveThemeId);
  const categories = toArchiveCategoryIds(row.archiveCategories);
  const titles = row.archiveTitles ?? [];

  return (
    <li className={styles.referenceRow}>
      <div className={styles.referenceMain}>
        <span className={styles.recordLabel}>{themeLabel ?? "観測記録"}</span>
        <strong>{row.shikona}</strong>
        <p>
          {formatRankName(row.maxRank)} / {formatRecordLabel(row)} / {formatCareerPeriod(row)}
        </p>
        <div className={styles.referenceTags}>
          {categories.slice(0, 2).map((categoryId) => (
            <span key={categoryId}>{ARCHIVE_CATEGORIES[categoryId]?.label ?? "未分類"}</span>
          ))}
          {titles[0] ? <span>{titles[0].label}</span> : null}
        </div>
      </div>
      <div className={styles.referenceAction}>
        <Button size="sm" variant="ghost" onClick={() => onOpenCareer(row.id)}>
          読む
        </Button>
      </div>
    </li>
  );
};
