import React from "react";
import { Award, BookOpenText, ScrollText, Sparkles } from "lucide-react";
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
  { id: "RECORD", label: "記録図鑑", icon: Award },
  { id: "ACHIEVEMENT", label: "偉業図鑑", icon: Sparkles },
  { id: "KIMARITE", label: "決まり手図鑑", icon: ScrollText },
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
            <div className="panel-title">図鑑の進捗</div>
            <p className="panel-caption">
              何が解放されたのかをカテゴリごとに読み返せる、詳細な図鑑画面です。
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onOpenArchive}>
            保存済み記録を開く
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-text-dim">図鑑データを読み込んでいます。</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard label="総解放数" value={`${dashboard?.totalUnlocked ?? 0}`} />
              <SummaryCard label="新着" value={`${dashboard?.totalNew ?? 0}`} />
              {(dashboard?.rows ?? []).map((row) => (
                <SummaryCard
                  key={row.type}
                  label={row.label}
                  value={`${row.unlocked}/${row.total}`}
                  note={row.note ?? (row.newCount > 0 ? `新着 ${row.newCount}` : undefined)}
                />
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
              <section className="rounded-none border border-line bg-surface px-4 py-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  {COLLECTION_TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        className="report-tab-button"
                        data-active={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {tab.label}
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

                <div className="space-y-2">
                  {filteredEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="w-full rounded-none border border-line bg-surface-panel px-3 py-3 text-left"
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
                          <div className="ui-text-label text-sm text-text">{entry.label}</div>
                          <div className="mt-1 text-xs text-text-dim">
                            {entry.state === "UNLOCKED"
                              ? entry.description
                              : "未解放のため詳細は伏せています。"}
                          </div>
                        </div>
                        <div className="shrink-0 text-xs text-text-dim">
                          {entry.state === "UNLOCKED" ? "解放済み" : "未解放"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="surface-panel space-y-4">
                <div>
                  <div className="panel-title">詳細</div>
                  <p className="panel-caption">
                    選択中の項目の条件、解放日時、進捗を確認できます。
                  </p>
                </div>

                {selectedEntry ? (
                  <CollectionDetailCard entry={selectedEntry} />
                ) : (
                  <div className="empty-state min-h-[280px]">
                    <BookOpenText className="h-10 w-10" />
                    <div className="empty-state-title">まだ図鑑項目がありません</div>
                    <div className="empty-state-text">
                      力士人生を保存すると、記録・偉業・決まり手がここに並びます。
                    </div>
                  </div>
                )}

                {!!dashboard?.recentUnlocks.length && (
                  <div className="space-y-2 border-t border-line pt-4">
                    <div className="panel-title">最近の解放</div>
                    <div className="space-y-2">
                      {dashboard.recentUnlocks.map((entry) => (
                        <div key={entry.id} className="rounded-none border border-line bg-surface px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="ui-text-label text-sm text-text">{entry.label}</div>
                            <div className="text-xs text-text-dim">{formatUnlockedAt(entry.unlockedAt)}</div>
                          </div>
                          <div className="mt-1 text-xs text-text-dim">{resolveTypeLabel(entry.type)}</div>
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

const SummaryCard: React.FC<{ label: string; value: string; note?: string }> = ({
  label,
  value,
  note,
}) => (
  <div className="metric-card">
    <div className="metric-label">{label}</div>
    <div className="metric-value">{value}</div>
    {note ? <div className="text-xs text-text-dim">{note}</div> : null}
  </div>
);

const CollectionDetailCard: React.FC<{ entry: CollectionCatalogEntry }> = ({ entry }) => (
  <div className="space-y-4">
    <div className="rounded-none border border-line bg-surface px-4 py-4">
      <div className="ui-text-label text-sm text-text-dim">{resolveTypeLabel(entry.type)}</div>
      <div className="mt-2 text-2xl ui-text-heading text-text">{entry.label}</div>
      <div className="mt-3 text-sm leading-relaxed text-text-dim">
        {entry.state === "UNLOCKED"
          ? entry.description
          : "この項目はまだ未解放です。条件を満たすと名前と詳細が公開されます。"}
      </div>
    </div>

    <div className="space-y-2 text-sm text-text-dim">
      <InfoRow label="状態" value={entry.state === "UNLOCKED" ? "解放済み" : "未解放"} />
      {entry.unlockedAt ? <InfoRow label="解放日時" value={formatUnlockedAt(entry.unlockedAt)} /> : null}
      {typeof entry.progress === "number" ? (
        <InfoRow
          label="進捗"
          value={entry.target ? `${entry.progress}/${entry.target}` : `${entry.progress}`}
        />
      ) : null}
      {entry.tier ? <InfoRow label="到達段階" value={resolveTierLabel(entry.tier)} /> : null}
      {entry.meta ? (
        Object.entries(entry.meta)
          .filter(([, value]) => value !== false)
          .map(([key, value]) => (
          <InfoRow
            key={key}
            label={resolveMetaLabel(key)}
            value={value === true ? "あり" : String(value)}
          />
        ))
      ) : null}
    </div>
  </div>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="info-row">
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

const resolveTypeLabel = (type: CollectionCatalogType): string => {
  if (type === "RECORD") return "記録図鑑";
  if (type === "ACHIEVEMENT") return "偉業図鑑";
  return "決まり手図鑑";
};

const resolveTierLabel = (tier: string): string => {
  if (tier === "GOLD") return "金";
  if (tier === "SILVER") return "銀";
  return "銅";
};

const resolveMetaLabel = (key: string): string => {
  if (key === "scoreBonus") return "加点";
  if (key === "category") return "分類";
  if (key === "tier") return "段階";
  if (key === "familyLabel") return "系統";
  if (key === "rarityLabel") return "頻度";
  if (key === "isNonTechnique") return "別枠";
  return key;
};

const formatUnlockedAt = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};
