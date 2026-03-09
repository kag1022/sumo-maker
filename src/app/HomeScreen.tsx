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

const formatTimer = (wallet: WalletState | null) => {
  if (!wallet || wallet.points >= wallet.cap) return 'MAX';
  return `${Math.floor(wallet.nextRegenInSec / 60)}:${String(wallet.nextRegenInSec % 60).padStart(2, '0')}`;
};

const DESIGN_STEPS = ['四股名', '出自', '体格', '入門口', '所属'];

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

  React.useEffect(() => {
    if (!wallet || wallet.points >= wallet.cap) return;
    const interval = setInterval(() => {
      setWallet((prev) => {
        if (!prev || prev.points >= prev.cap) return prev;
        if (prev.nextRegenInSec <= 1) {
          getWalletState().then((newState) => setWallet(newState)).catch(() => {});
          return prev;
        }
        return { ...prev, nextRegenInSec: prev.nextRegenInSec - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [wallet]);

  const totalCollection = collectionSummary.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in">
      <section className="arcade-hero overflow-hidden px-6 py-7 sm:px-8 sm:py-8">
        <div className="relative z-10 grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-center">
          <div className="space-y-5">
            <div className="museum-kicker">Dohyo Start</div>
            <div className="space-y-3">
              <h2 className="ui-text-heading text-4xl text-[#fff1d8] sm:text-6xl">
                力士を組み上げて
                <br />
                一生を走らせる
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-[#d7c0a0] sm:text-base">
                最初に四股名、出自、体格、入門口、所属先を決める。
                そこから土俵へ送り出し、結果ボードで人生の軌跡を読む。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={onStartDesign} className="px-8">
                新しく設計する
              </Button>
              <Button size="lg" variant="secondary" onClick={onOpenCollection} className="px-8">
                収蔵庫を開く
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="scoreboard-panel px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-[#8ea9cb]">Start Design</div>
                  <div className="mt-2 ui-text-heading text-2xl text-[#f3f7ff]">ここで決めること</div>
                </div>
                <div className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">
                  <Wallet size={14} />
                  {wallet?.points ?? '--'}pt
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                <div className="space-y-3">
                  <p className="text-sm leading-7 text-[#c6d8f2]">
                    設計画面では力士の入口条件を順番に固めます。能力育成ではなく、人生の初期条件を組み立てる画面です。
                  </p>
                  <div className="grid gap-2 sm:grid-cols-5">
                    {DESIGN_STEPS.map((step, index) => (
                      <div key={step} className="pixel-card-dark p-3">
                        <div className="text-[0.65rem] uppercase tracking-[0.14em] text-[#8ea9cb]">Step {index + 1}</div>
                        <div className="mt-2 text-sm text-[#f3f7ff]">{step}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex min-w-[92px] flex-row gap-3 lg:flex-col">
                  <div className="pixel-card-dark p-3">
                    <div className="text-[0.65rem] uppercase tracking-[0.14em] text-[#8ea9cb]">Regen</div>
                    <div className="mt-2 text-xl text-[#f3f7ff]">{formatTimer(wallet)}</div>
                  </div>
                  <div className="pixel-card-dark p-3">
                    <div className="text-[0.65rem] uppercase tracking-[0.14em] text-[#8ea9cb]">Shelf</div>
                    <div className="mt-2 text-xl text-[#f3f7ff]">{recentShelvedCareers.length}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="stat-block">
                <div className="flex items-center justify-between gap-2 text-xs text-text-dim">
                  <span className="flex items-center gap-2">
                    <Wallet size={15} />
                    所持ポイント
                  </span>
                  <span>{wallet && wallet.points < wallet.cap ? `+1 ${formatTimer(wallet)}` : '満タン'}</span>
                </div>
                <div className="stat-value mt-3">{wallet?.points ?? '--'} <span className="text-sm text-text-dim">/ {wallet?.cap ?? '--'}</span></div>
              </div>
              <div className="stat-block">
                <div className="flex items-center gap-2 text-xs text-text-dim">
                  <Archive size={15} />
                  収蔵済み
                </div>
                <div className="stat-value mt-3">{recentShelvedCareers.length}</div>
                <div className="stat-sub">最近の記録</div>
              </div>
              <div className="stat-block">
                <div className="flex items-center gap-2 text-xs text-text-dim">
                  <Landmark size={15} />
                  図鑑進行
                </div>
                <div className="stat-value mt-3">{totalCollection}</div>
                <div className="stat-sub">解放済み項目</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="rpg-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="pixel-icon-badge"><FolderClock size={16} /></span>
            <div>
              <div className="museum-kicker">Resume Booth</div>
              <h3 className="ui-text-heading text-2xl text-[#fff1d8]">未収蔵の人生</h3>
            </div>
          </div>

          {unshelvedCareers.length === 0 ? (
            <div className="scoreboard-panel p-5 text-sm text-[#c6d8f2]">
              完走した未収蔵キャリアはありません。土俵を見届けた後に残すか破棄するかを選べます。
            </div>
          ) : (
            <div className="grid gap-3">
              {unshelvedCareers.slice(0, 3).map((career) => (
                <div key={career.id} className="scoreboard-panel p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <div className="ui-text-heading text-2xl text-[#f3f7ff]">{career.shikona}</div>
                      <div className="flex flex-wrap gap-2 text-xs text-[#b8cbe6]">
                        <span className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">{buildLifeTag(career)}</span>
                        <span className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">
                          最高位 {formatRankName(career.maxRank)}
                        </span>
                      </div>
                    </div>
                    <Button variant="secondary" onClick={() => void onResumeCareer(career.id)}>
                      続きを見る
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rpg-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="pixel-icon-badge"><BookOpen size={16} /></span>
            <div>
              <div className="museum-kicker">Unlock Feed</div>
              <h3 className="ui-text-heading text-2xl text-[#fff1d8]">収蔵と解放ログ</h3>
            </div>
          </div>

          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {collectionSummary.map((row) => (
              <div key={row.type} className="pixel-card p-3">
                <div className="text-xs uppercase tracking-[0.14em] text-[#6e513d]">{collectionTypeLabel[row.type]}</div>
                <div className="mt-2 text-2xl text-[#24160f]">{row.count}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 ticker-log">
            {recentShelvedCareers.length > 0 && (
              <div className="ticker-entry">
                <span className="text-[#d9a441]">LOG</span>
                <span>最近の収蔵: {recentShelvedCareers[0].shikona}</span>
                <span className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">
                  {buildLifeTag(recentShelvedCareers[0])}
                </span>
              </div>
            )}
            {collectionDetails.length === 0 ? (
              <div className="scoreboard-panel p-5 text-sm text-[#c6d8f2]">まだ解放ログはありません。</div>
            ) : (
              collectionDetails.slice(0, 8).map((entry) => (
                <div key={entry.id} className="ticker-entry">
                  <span className="text-[#d9a441]">NEW</span>
                  <span>{entry.label}</span>
                  <span className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">
                    {entry.isNew ? 'NEW' : 'OPEN'}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
};
