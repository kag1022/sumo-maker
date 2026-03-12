import React from 'react';
import { Archive, BookOpen, FolderClock, Landmark, Wallet } from 'lucide-react';
import { Button } from '../shared/ui/Button';
import { getWalletState, WalletState } from '../logic/persistence/wallet';
import {
  CareerListItem,
  CollectionEntryDetail,
  CollectionSummaryRow,
  listCollectionSummary,
  listUnlockedCollectionEntries,
} from '../logic/persistence/repository';
import { CollectionType, Rank } from '../logic/models';
import { HomeActionCard, HomeProgressSummary } from '../shared/ui/displayLabels';

interface HomeScreenProps {
  unshelvedCareers: CareerListItem[];
  recentShelvedCareers: CareerListItem[];
  onStartDesign: () => void;
  onOpenCollection: () => void;
  onResumeCareer: (careerId: string) => void | Promise<void>;
}

const collectionTypeLabel: Record<CollectionType, string> = {
  RIKISHI: '力士',
  OYAKATA: '親方',
  KIMARITE: '決まり手',
  ACHIEVEMENT: '偉業',
};

const formatRankName = (rank: Rank): string => {
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) {
    return `${side}${rank.name}`;
  }
  return rank.division === 'Maezumo' ? '前相撲' : `${side}${rank.name}${rank.number || 1}枚目`;
};

const buildLifeTag = (career: CareerListItem): string => {
  if (career.yushoCount.makuuchi > 0) return `幕内優勝 ${career.yushoCount.makuuchi}回`;
  if (career.maxRank.name === '横綱') return '横綱到達';
  if (career.maxRank.division === 'Makuuchi') return '幕内到達';
  if (career.maxRank.division === 'Juryo') return '十両到達';
  return '下位を歩んだ';
};

const startGuide: HomeActionCard[] = [
  {
    id: 'start',
    title: 'はじめる',
    body: '新しい力士を設計し、土俵人生を走らせる。',
  },
  {
    id: 'resume',
    title: 'つづきから',
    body: '完走後の未整理キャリアを開き、収蔵するか決める。',
  },
  {
    id: 'archive',
    title: '収蔵の進み具合',
    body: '保存した記録と解放要素を見返す。',
  },
];

export const HomeScreen: React.FC<HomeScreenProps> = ({
  unshelvedCareers,
  recentShelvedCareers,
  onStartDesign,
  onOpenCollection,
  onResumeCareer,
}) => {
  const [wallet, setWallet] = React.useState<WalletState | null>(null);
  const [collectionSummary, setCollectionSummary] = React.useState<CollectionSummaryRow[]>([]);
  const [collectionDetails, setCollectionDetails] = React.useState<CollectionEntryDetail[]>([]);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const [walletState, collection, details] = await Promise.all([
        getWalletState(),
        listCollectionSummary(),
        listUnlockedCollectionEntries(),
      ]);
      if (!alive) return;
      setWallet(walletState);
      setCollectionSummary(collection);
      setCollectionDetails(details);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const totalCollection = collectionSummary.reduce((sum, row) => sum + row.count, 0);
  const latestUnlock = collectionDetails[0];
  const progressSummary: HomeProgressSummary = {
    walletPoints: wallet?.points ?? null,
    walletCap: wallet?.cap ?? null,
    archiveCount: recentShelvedCareers.length,
    collectionCount: totalCollection,
    unshelvedCount: unshelvedCareers.length,
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in">
      <section className="arcade-hero hero-stage">
        <div className="hero-grid xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
          <div className="hero-copy">
            <div className="museum-kicker">入口</div>
            <div className="space-y-4">
              <h2 className="ui-text-heading text-4xl text-text sm:text-6xl">
                力士をつくり
                <br />
                人生を読み切る
              </h2>
              <p className="max-w-2xl text-sm leading-8 text-text-dim sm:text-base">
                設計で入口条件を定め、土俵人生の節目を追い、最後に記録として残します。
                最初に押すのはひとつだけ。まずは新しい力士を送り出します。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={onStartDesign} className="px-8">
                新しくはじめる
              </Button>
              <Button size="lg" variant="secondary" onClick={onOpenCollection} className="px-8">
                収蔵庫を見る
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {startGuide.map((item) => (
                <article key={item.id} className="ledger-card">
                  <div className="museum-kicker">{item.title}</div>
                  <div className="text-sm leading-7 text-text-dim">{item.body}</div>
                </article>
              ))}
            </div>
          </div>

          <div className="hero-side">
            <section className="scoreboard-panel p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="museum-kicker">道場状況</div>
                  <h3 className="ui-text-heading mt-2 text-2xl text-text">いま確認すること</h3>
                </div>
                <span className="museum-chip">
                  <Wallet size={14} />
                  {progressSummary.walletPoints ?? '--'}pt
                </span>
              </div>

              <div className="mt-4 summary-grid">
                <div className="metric-tile">
                  <div className="metric-label">所持ポイント</div>
                  <div className="metric-value">
                    {progressSummary.walletPoints ?? '--'}
                    <span className="ml-1 text-sm text-text-dim">/ {progressSummary.walletCap ?? '--'}pt</span>
                  </div>
                  <div className="metric-note">時間回復はありません。</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">未整理の人生</div>
                  <div className="metric-value">{progressSummary.unshelvedCount}</div>
                  <div className="metric-note">完走後に収蔵待ちの記録です。</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-label">収蔵の進み具合</div>
                  <div className="metric-value">{progressSummary.collectionCount}</div>
                  <div className="metric-note">解放済みの項目数です。</div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="pixel-card-dark p-4">
                  <div className="text-xs tracking-[0.14em] text-text-dim">設計の流れ</div>
                  <div className="mt-2 text-sm leading-7 text-text">
                    親方 → 体格 → 型 → リスク → 確認
                  </div>
                </div>
                <div className="pixel-card-dark p-4">
                  <div className="text-xs tracking-[0.14em] text-text-dim">最近の収蔵</div>
                  <div className="mt-2 text-sm leading-7 text-text">
                    {recentShelvedCareers[0]?.shikona ?? 'まだありません'}
                  </div>
                </div>
              </div>
            </section>

            <section className="rpg-panel p-5 sm:p-6">
              <div className="museum-kicker">収蔵の進み具合</div>
              <div className="mt-4 grid gap-3 grid-cols-2">
                {collectionSummary.map((row) => (
                  <div key={row.type} className="pixel-card p-3">
                    <div className="text-xs tracking-[0.12em] text-text-dim">{collectionTypeLabel[row.type]}</div>
                    <div className="mt-2 text-2xl text-text">{row.count}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 ticker-log">
                <div className="ticker-entry">
                  <span className="text-[var(--accent-gold)]">最新</span>
                  <span>{latestUnlock ? latestUnlock.label : 'まだ解放記録はありません。'}</span>
                  <span className="museum-chip">{latestUnlock?.isNew ? '新規' : '記録'}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <article className="rpg-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="pixel-icon-badge"><FolderClock size={16} /></span>
            <div>
              <div className="museum-kicker">つづきから</div>
              <h3 className="ui-text-heading text-2xl text-text">未整理の人生</h3>
            </div>
          </div>

          {unshelvedCareers.length === 0 ? (
            <div className="scoreboard-panel p-5 text-sm text-text-dim">
              まだ未整理のキャリアはありません。新しい力士を送り出すと、ここから続きを読めます。
            </div>
          ) : (
            <div className="grid gap-3">
              {unshelvedCareers.slice(0, 3).map((career) => (
                <article key={career.id} className="ledger-card">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="ui-text-heading text-2xl text-text">{career.shikona}</div>
                      <div className="flex flex-wrap gap-2 text-xs text-text-dim">
                        <span className="museum-chip">{buildLifeTag(career)}</span>
                        <span className="museum-chip">最高位 {formatRankName(career.maxRank)}</span>
                      </div>
                      <div className="text-sm text-text-dim">
                        通算 {career.totalWins}勝 {career.totalLosses}敗
                      </div>
                    </div>
                    <Button variant="secondary" onClick={() => void onResumeCareer(career.id)}>
                      続きを読む
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="rpg-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="pixel-icon-badge"><BookOpen size={16} /></span>
            <div>
              <div className="museum-kicker">収蔵の進み具合</div>
              <h3 className="ui-text-heading text-2xl text-text">最近の解放</h3>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="stat-block">
              <div className="flex items-center gap-2 text-xs text-text-dim">
                <Wallet size={15} />
                所持ポイント
              </div>
              <div className="stat-value mt-3">{progressSummary.walletPoints ?? '--'}</div>
              <div className="stat-sub">上限 {progressSummary.walletCap ?? '--'}pt</div>
            </div>
            <div className="stat-block">
              <div className="flex items-center gap-2 text-xs text-text-dim">
                <Archive size={15} />
                収蔵済み
              </div>
              <div className="stat-value mt-3">{progressSummary.archiveCount}</div>
              <div className="stat-sub">保存した力士の数</div>
            </div>
            <div className="stat-block">
              <div className="flex items-center gap-2 text-xs text-text-dim">
                <Landmark size={15} />
                解放済み
              </div>
              <div className="stat-value mt-3">{progressSummary.collectionCount}</div>
              <div className="stat-sub">図録に載った項目数</div>
            </div>
          </div>

          <div className="mt-5 ticker-log">
            {recentShelvedCareers.length > 0 && (
              <div className="ticker-entry">
                <span className="text-[var(--accent-gold)]">収蔵</span>
                <span>{recentShelvedCareers[0].shikona}</span>
                <span className="museum-chip">{buildLifeTag(recentShelvedCareers[0])}</span>
              </div>
            )}
            {collectionDetails.length === 0 ? (
              <div className="scoreboard-panel p-5 text-sm text-text-dim">まだ解放ログはありません。</div>
            ) : (
              collectionDetails.slice(0, 6).map((entry) => (
                <div key={entry.id} className="ticker-entry">
                  <span className="text-[var(--accent-gold)]">{entry.isNew ? '新規' : '記録'}</span>
                  <span>{entry.label}</span>
                  <span className="museum-chip">{entry.isNew ? '開放' : '既出'}</span>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
};
