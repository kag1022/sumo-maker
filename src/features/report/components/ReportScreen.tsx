import React from 'react';
import {
  Activity,
  BookMarked,
  LineChart as LineChartIcon,
  ScrollText,
  ShieldAlert,
  Swords,
  Trophy,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';
import { RikishiStatus } from '../../../logic/models';
import { calculateCareerPrizeBreakdown } from '../../../logic/economy/prizeMoney';
import { listCareerPlayerBoutsByBasho } from '../../../logic/persistence/repository';
import { resolveKataDisplay } from '../../../logic/style/kata';
import { DamageMap } from '../../../shared/ui/DamageMap';
import { Button } from '../../../shared/ui/Button';
import { RikishiPortrait } from '../../../shared/ui/RikishiPortrait';
import { HoshitoriCareerRecord, HoshitoriTable } from './HoshitoriTable';
import {
  buildHoshitoriCareerRecords,
  buildRankChartData,
  buildReportCareerRecords,
  buildTimelineEventGroups,
  formatBashoLabel,
  formatRankDisplayName,
} from '../utils/reportCareer';

type ReportTab = 'overview' | 'rank' | 'timeline' | 'skills' | 'shelve';

interface ReportScreenProps {
  status: RikishiStatus;
  onReset: () => void;
  onSave?: () => void | Promise<void>;
  onDiscard?: () => void | Promise<void>;
  isSaved?: boolean;
  careerId?: string | null;
}

interface CareerOverviewSummary {
  highestPoint: string;
  recordLine: string;
  activeYears: string;
  insight: string;
}

interface CareerInjuryRecord {
  key: string;
  year: number;
  month: number;
  description: string;
}

const TABS: Array<{ id: ReportTab; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: '総覧', icon: <Activity size={15} /> },
  { id: 'rank', label: '番付推移', icon: <LineChartIcon size={15} /> },
  { id: 'timeline', label: '星取・年表', icon: <ScrollText size={15} /> },
  { id: 'skills', label: '決まり手・怪我', icon: <Swords size={15} /> },
  { id: 'shelve', label: '収蔵', icon: <BookMarked size={15} /> },
];

const TOOLTIP_STYLE = {
  borderRadius: 0,
  background: '#11161b',
  border: '2px solid rgba(122,148,171,0.34)',
  color: '#eef4ff',
  fontSize: 12,
};

const RANK_AXIS_LABELS = [
  { value: 0, label: '横綱' },
  { value: 10, label: '大関' },
  { value: 20, label: '関脇' },
  { value: 30, label: '小結' },
  { value: 41, label: '前頭' },
  { value: 61, label: '十両' },
  { value: 81, label: '幕下' },
  { value: 151, label: '三段目' },
  { value: 261, label: '序二段' },
  { value: 371, label: '序ノ口' },
];

const formatRankAxisTick = (value: number): string =>
  RANK_AXIS_LABELS.find((tick) => tick.value === value)?.label ?? '';

const buildOverviewSummary = (status: RikishiStatus): CareerOverviewSummary => {
  const { history } = status;
  const entryYear = history.records[0]?.year ?? new Date().getFullYear();
  const endYear = history.records[history.records.length - 1]?.year ?? entryYear;
  const allYusho = history.yushoCount.makuuchi + history.yushoCount.juryo + history.yushoCount.makushita + history.yushoCount.others;
  const topReach = formatRankDisplayName(history.maxRank);
  const insight =
    history.maxRank.name === '横綱'
      ? '頂点まで到達した'
      : history.maxRank.division === 'Makuuchi'
        ? '幕内まで伸びた'
        : history.maxRank.division === 'Juryo'
          ? '関取まで届いた'
          : allYusho > 0
            ? '下位で勝ち切る場所があった'
            : '下位で浮き沈みを重ねた';

  return {
    highestPoint: topReach,
    recordLine: `${history.totalWins}勝 ${history.totalLosses}敗${history.totalAbsent > 0 ? ` ${history.totalAbsent}休` : ''}`,
    activeYears: `${entryYear} - ${endYear}`,
    insight,
  };
};

const buildTimelinePoints = (status: RikishiStatus): string[] => {
  const events = status.history.events;
  const firstPromotion = events.find((event) => event.type === 'PROMOTION');
  const firstYusho = status.history.records.find((record) => record.yusho);
  const majorInjury = events.find((event) => event.type === 'INJURY');
  const retirement = events.find((event) => event.type === 'RETIREMENT');

  return [
    firstPromotion?.description,
    firstYusho ? `${firstYusho.year}年${firstYusho.month}月に優勝` : undefined,
    majorInjury?.description,
    retirement?.description,
  ].filter((value): value is string => Boolean(value));
};

const buildCareerInjuryHistory = (status: RikishiStatus): CareerInjuryRecord[] => {
  const eventRecords = status.history.events
    .filter((event) => event.type === 'INJURY')
    .map((event, index) => ({
      key: `event-${event.year}-${event.month}-${index}`,
      year: event.year,
      month: event.month,
      description: event.description,
    }));

  const fallbackRecords = (status.injuries ?? [])
    .filter((injury) => !eventRecords.some((event) =>
      event.year === injury.occurredAt.year
      && event.month === injury.occurredAt.month
      && event.description.includes(injury.name),
    ))
    .map((injury) => ({
      key: `injury-${injury.id}`,
      year: injury.occurredAt.year,
      month: injury.occurredAt.month,
      description: `${injury.name} (重症度 ${injury.severity} / ${injury.status})`,
    }));

  return [...eventRecords, ...fallbackRecords].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
};

export const ReportScreen: React.FC<ReportScreenProps> = ({
  status,
  onReset,
  onSave,
  onDiscard,
  isSaved = false,
  careerId = null,
}) => {
  const [activeTab, setActiveTab] = React.useState<ReportTab>('overview');
  const [hoshitoriCareerRecords, setHoshitoriCareerRecords] = React.useState<HoshitoriCareerRecord[]>([]);
  const [isHoshitoriLoading, setIsHoshitoriLoading] = React.useState(false);
  const [hoshitoriErrorMessage, setHoshitoriErrorMessage] = React.useState<string | undefined>(undefined);

  const summary = React.useMemo(() => buildOverviewSummary(status), [status]);
  const timelinePoints = React.useMemo(() => buildTimelinePoints(status), [status]);
  const careerInjuryHistory = React.useMemo(() => buildCareerInjuryHistory(status), [status]);
  const displayCareerRecords = React.useMemo(() => buildReportCareerRecords(status.history.records), [status.history.records]);
  const rankChartData = React.useMemo(() => buildRankChartData(status.history.records), [status.history.records]);
  const rankAxisTicks = React.useMemo(() => {
    if (rankChartData.length === 0) return [];
    const maxValue = Math.max(...rankChartData.map((point) => point.rankValue));
    return RANK_AXIS_LABELS.filter((tick) => tick.value <= maxValue + 10).map((tick) => tick.value);
  }, [rankChartData]);
  const timelineGroups = React.useMemo(() => buildTimelineEventGroups(status.history.events), [status.history.events]);
  const kataLabel = React.useMemo(() => resolveKataDisplay(status.kataProfile).styleLabel, [status.kataProfile]);
  const prizeBreakdown = React.useMemo(
    () => status.history.prizeBreakdown ?? calculateCareerPrizeBreakdown(status),
    [status],
  );

  React.useEffect(() => {
    let cancelled = false;
    if (!careerId) {
      setHoshitoriCareerRecords([]);
      setIsHoshitoriLoading(false);
      setHoshitoriErrorMessage(undefined);
      return;
    }
    setIsHoshitoriLoading(true);
    setHoshitoriErrorMessage(undefined);
    void (async () => {
      try {
        const byBasho = await listCareerPlayerBoutsByBasho(careerId);
        if (cancelled) return;
        setHoshitoriCareerRecords(buildHoshitoriCareerRecords(status.history.records, byBasho));
      } catch (error) {
        if (!cancelled) {
          setHoshitoriErrorMessage(error instanceof Error ? error.message : '星取を読み込めませんでした。');
        }
      } finally {
        if (!cancelled) setIsHoshitoriLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [careerId, status.history.records]);

  const kimariteData = React.useMemo(
    () =>
      Object.entries(status.history.kimariteTotal ?? {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([name, count]) => ({ name, count })),
    [status.history.kimariteTotal],
  );

  const awardsSummary = React.useMemo(() => {
    let sansho = 0;
    let kinboshi = 0;
    status.history.records.forEach((record) => {
      sansho += record.specialPrizes?.length ?? 0;
      kinboshi += record.kinboshi ?? 0;
    });
    return { sansho, kinboshi };
  }, [status.history.records]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in">
      <section className="arcade-hero overflow-hidden px-6 py-7 sm:px-8 sm:py-8">
        <div className="relative z-10 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 sm:flex-row">
              <RikishiPortrait bodyType={status.bodyType} showLabel className="h-[220px] w-full sm:w-[220px]" />
              <div className="space-y-3">
                <div className="museum-kicker">Final Board</div>
                <h1 className="ui-text-heading text-4xl text-[#fff1d8] sm:text-6xl">{status.shikona}</h1>
                <div className="flex flex-wrap gap-2 text-sm text-[#d7c0a0]">
                  <span>{status.profile.realName || '本名未設定'}</span>
                  <span>{status.profile.birthplace || '出身地未設定'}</span>
                  <span>{Math.round(status.bodyMetrics.heightCm)}cm / {Math.round(status.bodyMetrics.weightKg)}kg</span>
                  <span>{kataLabel === 'なし' ? '型未確立' : kataLabel}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">最高位 {summary.highestPoint}</span>
                  <span className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">通算 {summary.recordLine}</span>
                  <span className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">現役 {summary.activeYears}</span>
                  <span className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">{summary.insight}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="stat-block">
              <div className="stat-label">最高位</div>
              <div className="stat-value">{summary.highestPoint}</div>
            </div>
            <div className="stat-block">
              <div className="stat-label">通算成績</div>
              <div className="stat-value">{status.history.totalWins}勝</div>
              <div className="stat-sub">{status.history.totalLosses}敗 {status.history.totalAbsent > 0 ? `${status.history.totalAbsent}休` : ''}</div>
            </div>
            <div className="stat-block">
              <div className="stat-label">幕内優勝</div>
              <div className="stat-value">{status.history.yushoCount.makuuchi}回</div>
            </div>
            <div className="stat-block">
              <div className="stat-label">金星 / 三賞</div>
              <div className="stat-value">{awardsSummary.kinboshi} / {awardsSummary.sansho}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="command-bar">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button key={tab.id} type="button" className="museum-chip" data-active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onReset}>入口へ戻る</Button>
          {onDiscard && !isSaved && <Button variant="outline" onClick={() => void onDiscard()}>破棄する</Button>}
          {onSave && <Button onClick={() => void onSave()} disabled={isSaved}>{isSaved ? '収蔵済み' : '資料館に収蔵する'}</Button>}
        </div>
      </section>

      {activeTab === 'overview' && (
        <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <section className="rpg-panel p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="pixel-icon-badge"><Trophy size={16} /></span>
              <h2 className="ui-text-heading text-2xl text-[#fff1d8]">最高到達の要点</h2>
            </div>
            <div className="ticker-log">
              {timelinePoints.length === 0 ? (
                <div className="scoreboard-panel p-5 text-sm text-[#c6d8f2]">大きな節目は記録されていません。</div>
              ) : (
                timelinePoints.map((point) => (
                  <div key={point} className="ticker-entry">
                    <span className="text-[#d9a441]">LOG</span>
                    <span>{point}</span>
                    <span className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">節目</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rpg-panel p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="pixel-icon-badge"><Activity size={16} /></span>
              <h2 className="ui-text-heading text-2xl text-[#fff1d8]">主要指標</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="stat-block">
                <div className="stat-label">活動場所数</div>
                <div className="stat-value">{displayCareerRecords.length}</div>
              </div>
              <div className="stat-block">
                <div className="stat-label">勝率</div>
                <div className="stat-value">
                  {status.history.totalWins + status.history.totalLosses > 0
                    ? ((status.history.totalWins / (status.history.totalWins + status.history.totalLosses)) * 100).toFixed(1)
                    : '0.0'}%
                </div>
              </div>
              <div className="stat-block">
                <div className="stat-label">下位優勝</div>
                <div className="stat-value">{status.history.yushoCount.juryo + status.history.yushoCount.makushita + status.history.yushoCount.others}回</div>
              </div>
              <div className="stat-block">
                <div className="stat-label">生涯賞金</div>
                <div className="stat-value">{new Intl.NumberFormat('ja-JP').format(prizeBreakdown.totalYen)}円</div>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'rank' && (
        <section className="scoreboard-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="pixel-icon-badge"><LineChartIcon size={16} /></span>
            <h2 className="ui-text-heading text-2xl text-[#f3f7ff]">番付推移</h2>
          </div>
          <div className="h-[360px] border-[2px] border-[rgba(122,148,171,0.28)] bg-[rgba(10,12,15,0.65)] p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rankChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,148,171,0.16)" />
                <XAxis
                  dataKey="slot"
                  tick={{ fontSize: 11, fill: '#a9bfdc' }}
                  tickFormatter={(_value: number, index: number) => rankChartData[index]?.axisLabel ?? ''}
                  interval={0}
                  minTickGap={20}
                />
                <YAxis
                  type="number"
                  reversed
                  tick={{ fontSize: 11, fill: '#a9bfdc' }}
                  width={60}
                  ticks={rankAxisTicks}
                  tickFormatter={formatRankAxisTick}
                  domain={[0, (dataMax: number) => Math.max(dataMax + 8, 42)]}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(_label: string, payload: Array<{ payload?: { bashoLabel: string } }>) => payload?.[0]?.payload?.bashoLabel ?? ''}
                  formatter={(_v: number, _n: string, entry: { payload?: { rankLabel: string } }) => entry.payload?.rankLabel ?? ''}
                />
                <Line type="linear" dataKey="rankValue" stroke="#d9a441" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {activeTab === 'timeline' && (
        <div className="space-y-6">
          <section className="rpg-panel p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="pixel-icon-badge"><ScrollText size={16} /></span>
              <h2 className="ui-text-heading text-2xl text-[#fff1d8]">星取</h2>
            </div>
            <HoshitoriTable
              careerRecords={hoshitoriCareerRecords}
              shikona={status.shikona}
              isLoading={isHoshitoriLoading}
              errorMessage={hoshitoriErrorMessage}
            />
          </section>

          <section className="rpg-panel p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="pixel-icon-badge"><ScrollText size={16} /></span>
              <h2 className="ui-text-heading text-2xl text-[#fff1d8]">年表</h2>
            </div>
            <div className="ticker-log">
              {timelineGroups.map((group) => (
                <div key={group.key} className="ticker-entry">
                  <span className="text-[#d9a441]">{String(group.month).padStart(2, '0')}</span>
                  <div className="grid gap-1 text-sm text-[#eef4ff]">
                    <div>{formatBashoLabel(group.year, group.month)}</div>
                    <div className="grid gap-1 text-xs text-[#c6d8f2]">
                      {group.descriptions.map((description, index) => (
                        <span key={`${group.key}-${index}`}>{description}</span>
                      ))}
                    </div>
                  </div>
                  <span className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">{group.tagLabel}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'skills' && (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="scoreboard-panel p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="pixel-icon-badge"><Swords size={16} /></span>
              <h2 className="ui-text-heading text-2xl text-[#f3f7ff]">決まり手</h2>
            </div>
            {kimariteData.length === 0 ? (
              <div className="text-sm text-[#c6d8f2]">決まり手データはありません。</div>
            ) : (
              <div className="h-[320px] border-[2px] border-[rgba(122,148,171,0.28)] bg-[rgba(10,12,15,0.65)] p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kimariteData} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,148,171,0.16)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#a9bfdc' }} />
                    <YAxis dataKey="name" type="category" width={88} tick={{ fontSize: 11, fill: '#eef4ff' }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill="#d9a441" radius={[0, 0, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rpg-panel p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="pixel-icon-badge"><ShieldAlert size={16} /></span>
              <h2 className="ui-text-heading text-2xl text-[#fff1d8]">怪我</h2>
            </div>
            {careerInjuryHistory.length === 0 ? (
              <p className="text-sm text-[#d7c0a0]">生涯を通して記録された怪我はありませんでした。</p>
            ) : (
              <div className="space-y-4">
                <DamageMap
                  injuries={status.injuries}
                  historicRecords={careerInjuryHistory.map((record) => record.description)}
                  bodyType={status.bodyType}
                />
                <div className="grid gap-2">
                  {careerInjuryHistory.map((injury) => (
                    <div key={injury.key} className="scoreboard-panel p-3">
                      <div className="text-sm text-[#f3f7ff]">{injury.description}</div>
                      <div className="text-xs text-[#8ea9cb]">{injury.year}年{injury.month}月</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'shelve' && (
        <section className="rpg-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="pixel-icon-badge"><BookMarked size={16} /></span>
            <h2 className="ui-text-heading text-2xl text-[#fff1d8]">収蔵</h2>
          </div>
          <div className="space-y-4">
            <p className="text-sm text-[#d7c0a0]">
              この人生を資料館に残すと、収蔵庫からいつでも読み返せます。破棄すると記録は残りません。
            </p>
            <div className="flex flex-wrap gap-2">
              {onSave && <Button onClick={() => void onSave()} disabled={isSaved}>{isSaved ? '収蔵済み' : '資料館に収蔵する'}</Button>}
              {onDiscard && !isSaved && <Button variant="outline" onClick={() => void onDiscard()}>破棄する</Button>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
