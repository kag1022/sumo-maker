import React from "react";
import { Award, BookOpenText, ScrollText, Sparkles, Activity, AlertTriangle, Trophy } from "lucide-react";
import {
  getCollectionDashboardSummary,
  listCollectionCatalogEntries,
  type CollectionCatalogEntry,
  type CollectionCatalogType,
  type CollectionDashboardSummary,
} from "../../../logic/persistence/collections";
import { Button } from "../../../shared/ui/Button";

const COLLECTION_TABS: Array<{
  id: CollectionCatalogType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "RECORD", label: "記録資料", icon: Award },
  { id: "ACHIEVEMENT", label: "偉業資料", icon: Sparkles },
  { id: "KIMARITE", label: "決まり手資料", icon: ScrollText },
];

interface CollectionScreenProps {
  onOpenArchive: () => void;
}

type KimariteFamilyFilter =
  | "ALL"
  | "押し・突き"
  | "寄り・極め"
  | "投げ"
  | "捻り・落とし"
  | "足取り・掛け"
  | "反り"
  | "送り"
  | "非技";

export const CollectionScreen: React.FC<CollectionScreenProps> = ({
  onOpenArchive,
}) => {
  const [activeTab, setActiveTab] = React.useState<CollectionCatalogType>("RECORD");
  const [kimariteFamilyFilter, setKimariteFamilyFilter] = React.useState<KimariteFamilyFilter>("ALL");
  const [dashboard, setDashboard] = React.useState<CollectionDashboardSummary | null>(null);
  const [entriesByType, setEntriesByType] = React.useState<Record<CollectionCatalogType, CollectionCatalogEntry[]>>({
    RECORD: [],
    ACHIEVEMENT: [],
    KIMARITE: [],
  });
  const [selectedByType, setSelectedByType] = React.useState<Partial<Record<CollectionCatalogType, string>>>({});
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      try {
        const [summary, recordEntries, achievementEntries, kimariteEntries] = await Promise.all([
          getCollectionDashboardSummary(),
          listCollectionCatalogEntries("RECORD"),
          listCollectionCatalogEntries("ACHIEVEMENT"),
          listCollectionCatalogEntries("KIMARITE"),
        ]);
        if (cancelled) return;
        const nextEntries = {
          RECORD: recordEntries,
          ACHIEVEMENT: achievementEntries,
          KIMARITE: kimariteEntries,
        };
        setDashboard(summary);
        setEntriesByType(nextEntries);
        setSelectedByType({
          RECORD: recordEntries[0]?.id,
          ACHIEVEMENT: achievementEntries[0]?.id,
          KIMARITE: kimariteEntries[0]?.id,
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = entriesByType[activeTab];
  const filteredEntries =
    activeTab !== "KIMARITE" || kimariteFamilyFilter === "ALL"
      ? entries
      : entries.filter((entry) => {
        const familyLabel = String(entry.meta?.familyLabel ?? "");
        return familyLabel === kimariteFamilyFilter;
      });
  const selectedEntry =
    filteredEntries.find((entry) => entry.id === selectedByType[activeTab]) ??
    filteredEntries[0] ??
    null;

  return (
    <div className="space-y-5">
      <section className="surface-panel space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="panel-title">資料館の蓄積</div>
            <p className="panel-caption">
              解放状況を並べるだけでなく、相撲世界の資料として読み返せる棚を目指します。
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onOpenArchive}>
            保存済み記録を開く
          </Button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 animate-pulse">
            <Activity className="h-8 w-8 text-gold/30 mb-4" />
            <div className="text-sm text-text-dim ui-text-label uppercase tracking-widest">資料を整理しています...</div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard label="総解放数" value={`${dashboard?.totalUnlocked ?? 0}`} icon={<BookOpenText className="w-4 h-4" />} tone="brand" />
              <SummaryCard label="新着" value={`${dashboard?.totalNew ?? 0}`} icon={<Sparkles className="w-4 h-4" />} tone="action" />
              {(dashboard?.rows ?? []).map((row) => (
                <SummaryCard
                  key={row.type}
                  label={row.label}
                  value={`${row.unlocked}/${row.total}`}
                  note={row.note ?? (row.newCount > 0 ? `新着 ${row.newCount}` : undefined)}
                  icon={resolveSummaryIcon(row.type)}
                  progress={(row.unlocked / row.total) * 100}
                />
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_minmax(320px,0.7fr)] pt-4">
              <section className="space-y-4">
                <div className="flex flex-wrap gap-1 p-1 bg-bg-panel/40 border border-gold/10 backdrop-blur-sm sticky top-0 z-20">
                  {COLLECTION_TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        className="report-tab-button flex-1 min-w-[120px]"
                        data-active={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                      >
                        <span className="inline-flex items-center gap-2 py-1">
                          <Icon className="h-4 w-4" />
                          <span className="ui-text-label text-sm uppercase tracking-wide">{tab.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {activeTab === "KIMARITE" ? (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {(["ALL", "押し・突き", "寄り・極め", "投げ", "捻り・落とし", "足取り・掛け", "反り", "送り", "非技"] as KimariteFamilyFilter[]).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        className="report-tab-button"
                        data-active={kimariteFamilyFilter === filter}
                        onClick={() => setKimariteFamilyFilter(filter)}
                      >
                        {filter === "ALL" ? "すべて" : filter}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-2 mt-4">
                  {filteredEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="w-full surface-card p-3 text-left transition-all hover:bg-gold/5 group"
                      data-active={selectedEntry?.id === entry.id}
                      onClick={() => {
                        setSelectedByType((current) => ({
                          ...current,
                          [activeTab]: entry.id,
                        }));
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className={`ui-text-label text-sm transition-colors ${selectedEntry?.id === entry.id ? 'text-gold' : 'text-text group-hover:text-gold/80'}`}>
                            {entry.state === "UNLOCKED" ? entry.label : "？？？？？"}
                          </div>
                          <div className="mt-1 text-xs text-text-dim line-clamp-1 italic">
                            {entry.state === "UNLOCKED"
                              ? entry.description
                              : "相まみえることで解放される秘録です。"}
                          </div>
                        </div>
                        <div className={`shrink-0 text-[10px] ui-text-label px-2 py-0.5 border ${entry.state === "UNLOCKED" ? 'border-gold/30 text-gold bg-gold/5' : 'border-text-faint text-text-faint bg-bg-panel/50'}`}>
                          {entry.state === "UNLOCKED" ? "解放済" : "未解放"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-6">
                <div className="surface-panel p-5 border-gold/20 bg-bg-panel/40 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-gold/60 mb-4 border-b border-gold/10 pb-2">
                    <ScrollText className="w-4 h-4" />
                    <span className="ui-text-label text-[10px] uppercase tracking-widest">資料詳細 - DETAILED ARCHIVE</span>
                  </div>

                  {selectedEntry ? (
                    <CollectionDetailCard entry={selectedEntry} />
                  ) : (
                    <div className="empty-state min-h-[300px] border-dashed border-gold-muted/10">
                      <BookOpenText className="h-10 w-10 text-gold/20" />
                      <div className="empty-state-title text-text-dim">目録を選択してください</div>
                      <div className="empty-state-text text-text-faint">
                        記録や偉業や決まり手を、資料として読み解くことができます。
                      </div>
                    </div>
                  )}
                </div>

                {!!dashboard?.recentUnlocks.length && (
                  <div className="surface-panel p-5 border-gold-muted/10 bg-gradient-to-b from-bg-panel/20 to-transparent">
                    <div className="flex items-center gap-2 text-text-dim mb-4 mb-2">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="ui-text-label text-[10px] uppercase tracking-widest text-text-dim">最近の解放項目</span>
                    </div>
                    <div className="space-y-2">
                      {dashboard.recentUnlocks.map((entry) => (
                        <div key={entry.id} className="surface-card p-3 border-gold-muted/5 bg-bg/20">
                          <div className="flex items-center justify-between gap-3">
                            <div className="ui-text-label text-sm text-text-dim">{entry.label}</div>
                            <div className="text-[10px] ui-text-label text-text-faint">{formatUnlockedAt(entry.unlockedAt)}</div>
                          </div>
                          <div className="mt-1 text-[10px] text-gold/40 italic uppercase tracking-wider">{resolveTypeLabel(entry.type)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

const SummaryCard: React.FC<{
  label: string;
  value: string;
  note?: string;
  icon?: React.ReactNode;
  tone?: "brand" | "action" | "neutral";
  progress?: number;
}> = ({ label, value, note, icon, tone, progress }) => (
  <div
    className="surface-card p-4 flex flex-col justify-between min-h-[100px] border-gold-muted/10 group hover:border-gold/30 transition-all overflow-hidden relative"
    data-tone={tone}
  >
    <div className="flex items-center justify-between mb-2">
      <div className="text-[10px] ui-text-label text-text-dim group-hover:text-gold/70 transition-colors uppercase tracking-widest">
        {label}
      </div>
      {icon && <div className="text-gold/40 group-hover:text-gold/80 transition-colors">{icon}</div>}
    </div>
    <div className={`text-xl ui-text-metric ${tone === "brand" ? 'text-gold' : tone === "action" ? 'text-action' : 'text-text'}`}>
      {value}
    </div>
    {note && <div className="text-[9px] text-text-faint italic mt-1">{note}</div>}
    
    {typeof progress === "number" && (
      <div className="absolute bottom-0 left-0 w-full h-0.5 bg-bg/40">
        <div
          className="h-full bg-gold/30 transition-all duration-1000"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    )}
  </div>
);

const CollectionDetailCard: React.FC<{ entry: CollectionCatalogEntry }> = ({ entry }) => (
  <div className="space-y-6 animate-in fade-in duration-500">
    <div className="surface-card p-6 border-gold/30 bg-gradient-to-br from-bg-panel to-transparent relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-5">
        <Sparkles className="w-16 h-16" />
      </div>
      
      <div className="ui-text-label text-[10px] text-gold/60 uppercase tracking-widest mb-2 border-l-2 border-gold/40 pl-3">
        {resolveTypeLabel(entry.type)}
      </div>
      
      <div className="text-3xl sm:text-4xl ui-text-heading text-text mb-4 drop-shadow-md">
        {entry.state === "UNLOCKED" ? entry.label : "？？？？？"}
      </div>
      
      <div className="text-sm leading-relaxed text-text-dim min-h-[60px] italic bg-bg/20 p-4 border border-gold-muted/5">
        {entry.state === "UNLOCKED"
          ? entry.description
          : "この項目は未だ秘匿されています。特定の条件を満たし、土俵でその実力を示すことで全貌が明らかになります。"}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-3">
        <InfoRow label="現状の位" value={entry.state === "UNLOCKED" ? "既読・解放" : "未踏・秘匿"} />
        {entry.unlockedAt && <InfoRow label="登録日時" value={formatUnlockedAt(entry.unlockedAt)} />}
        {entry.tier && <InfoRow label="稀少度" value={resolveTierLabel(entry.tier)} />}
      </div>
      <div className="space-y-3">
        {typeof entry.progress === "number" && (
          <InfoRow
            label="累積進捗"
            value={entry.target ? `${entry.progress}/${entry.target}` : `${entry.progress}`}
          />
        )}
        {entry.meta && Object.entries(entry.meta)
          .filter(([, value]) => value !== false && typeof value !== "object")
          .map(([key, value]) => (
            <InfoRow
              key={key}
              label={resolveMetaLabel(key)}
              value={value === true ? "成就" : String(value)}
            />
          ))}
      </div>
    </div>

    {entry.state !== "UNLOCKED" && (
      <div className="p-4 border border-warning/20 bg-warning/5 text-[10px] text-warning-bright/70 italic leading-relaxed">
        <AlertTriangle className="w-3.5 h-3.5 inline mr-2" />
        条件を達成することで、総評点への加点ボーナスや新弟子への恩恵が解放される場合があります。
      </div>
    )}
  </div>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-col gap-0.5 border-b border-gold-muted/5 pb-2">
    <span className="text-[9px] ui-text-label text-text-faint uppercase tracking-tighter">{label}</span>
    <span className="text-xs font-bold text-text-dim">{value}</span>
  </div>
);

const resolveSummaryIcon = (type: CollectionCatalogType) => {
  switch (type) {
    case "RECORD": return <Award className="w-4 h-4" />;
    case "ACHIEVEMENT": return <Trophy className="w-4 h-4" />;
    case "KIMARITE": return <ScrollText className="w-4 h-4" />;
  }
};

const resolveTypeLabel = (type: CollectionCatalogType): string => {
  if (type === "RECORD") return "生涯記録 - Record";
  if (type === "ACHIEVEMENT") return "不滅の偉業 - Achievement";
  return "四十八手・決まり手 - Kimarite";
};

const resolveTierLabel = (tier: string): string => {
  if (tier === "GOLD") return "極（金）";
  if (tier === "SILVER") return "秀（銀）";
  return "優（銅）";
};

const resolveMetaLabel = (key: string): string => {
  if (key === "scoreBonus") return "評点加算";
  if (key === "category") return "技の分類";
  if (key === "tier") return "稀少段階";
  if (key === "familyLabel") return "技の系統";
  if (key === "rarityLabel") return "出現頻度";
  if (key === "isNonTechnique") return "特殊勝負";
  return key;
};

const formatUnlockedAt = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日`;
};
