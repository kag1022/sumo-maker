import React from 'react';
import {
  Activity,
  BookMarked,
  ChevronDown,
  LineChart as LineChartIcon,
  ShieldAlert,
  Swords,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RikishiStatus } from '../../../logic/models';
import { calculateCareerPrizeBreakdown } from '../../../logic/economy/prizeMoney';
import { listCareerPlayerBoutsByBasho } from '../../../logic/persistence/repository';
import { DamageMap } from '../../../shared/ui/DamageMap';
import { Button } from '../../../shared/ui/Button';
import { RikishiPortrait } from '../../../shared/ui/RikishiPortrait';
import { getBackgroundLabel, getStyleLabelJa, ReportMetricBlock } from '../../../shared/ui/displayLabels';
import { HoshitoriCareerRecord, HoshitoriTable } from './HoshitoriTable';
import {
  buildCareerHeadline,
  buildDesignedVsRealizedLabel,
  buildFantasyHooksForReport,
  buildHoshitoriCareerRecords,
  buildInjuryWhatIfText,
  buildRankChartDataFromStatus,
  buildReportTimelineItems,
  formatBashoLabel,
  formatRankDisplayName,
} from '../utils/reportCareer';

type ReportTab = 'timeline' | 'analysis' | 'archive';

interface ReportScreenProps {
  status: RikishiStatus;
  onReset: () => void;
  onSave?: () => void | Promise<void>;
  onDiscard?: () => void | Promise<void>;
  isSaved?: boolean;
  careerId?: string | null;
}

const TOOLTIP_STYLE = {
  borderRadius: 0,
  background: '#11161b',
  border: '2px solid rgba(91,122,165,0.34)',
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
] as const;

const EVENT_BADGE: Record<string, string> = {
  MAJOR_INJURY: '怪',
  KINBOSHI: '金',
  YUSHO: '優',
  PROMOTION: '昇',
  RETIREMENT: '終',
  FIRST_SEKITORI: '関',
  JURYO_DROP: '落',
};

const formatRankAxisTick = (value: number): string =>
  RANK_AXIS_LABELS.find((tick) => tick.value === value)?.label ?? '';

const EventDot = (props: {
  cx?: number;
  cy?: number;
  payload?: { eventTags?: string[] };
}) => {
  if (!props.payload?.eventTags?.length || props.cx === undefined || props.cy === undefined) return null;
  const label = EVENT_BADGE[props.payload.eventTags[0]] ?? '節';
  return (
    <g>
      <rect x={props.cx - 7} y={props.cy - 22} width={14} height={14} fill="#d6a23d" stroke="#0b0b0f" strokeWidth={2} />
      <text x={props.cx} y={props.cy - 11} textAnchor="middle" fontSize="9" fill="#0b0b0f">
        {label}
      </text>
      <circle cx={props.cx} cy={props.cy} r={2.8} fill="#f3e9d2" stroke="#d6a23d" strokeWidth={1} />
    </g>
  );
};

const SummaryChip = ({ children }: { children: React.ReactNode }) => (
  <span className="museum-chip">{children}</span>
);

export const ReportScreen: React.FC<ReportScreenProps> = ({
  status,
  onReset,
  onSave,
  onDiscard,
  isSaved = false,
  careerId = null,
}) => {
  const [activeTab, setActiveTab] = React.useState<ReportTab>('timeline');
  const [hoshitoriCareerRecords, setHoshitoriCareerRecords] = React.useState<HoshitoriCareerRecord[]>([]);
  const [isHoshitoriLoading, setIsHoshitoriLoading] = React.useState(false);
  const [hoshitoriErrorMessage, setHoshitoriErrorMessage] = React.useState<string | undefined>(undefined);
  const [detailsOpen, setDetailsOpen] = React.useState({
    hoshitori: false,
    kimarite: false,
    injuries: false,
  });

  const rankChartData = React.useMemo(() => buildRankChartDataFromStatus(status), [status]);
  const timelineItems = React.useMemo(() => buildReportTimelineItems(status), [status]);
  const designedVsRealized = React.useMemo(() => buildDesignedVsRealizedLabel(status), [status]);
  const fantasyHooks = React.useMemo(() => buildFantasyHooksForReport(status), [status]);
  const injuryWhatIf = React.useMemo(() => buildInjuryWhatIfText(status), [status]);
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

  const rankAxisTicks = React.useMemo(() => {
    if (rankChartData.length === 0) return [];
    const maxValue = Math.max(...rankChartData.map((point) => point.rankValue));
    return RANK_AXIS_LABELS.filter((tick) => tick.value <= maxValue + 10).map((tick) => tick.value);
  }, [rankChartData]);

  const maxWeight = Math.max(160, ...rankChartData.map((point) => point.weightKg ?? 0));
  const minWeight = Math.min(100, ...rankChartData.map((point) => point.weightKg ?? 999));

  const headline = buildCareerHeadline(status);
  const metrics: ReportMetricBlock[] = [
    {
      label: '最高位',
      value: formatRankDisplayName(status.history.maxRank),
      note: headline,
    },
    {
      label: '通算成績',
      value: `${status.history.totalWins}勝 ${status.history.totalLosses}敗`,
      note: `${status.history.totalAbsent}休を含む`,
    },
    {
      label: '活動場所数',
      value: `${status.history.records.length}`,
      note: `${status.entryAge}歳入門`,
    },
    {
      label: '生涯賞金',
      value: `${new Intl.NumberFormat('ja-JP').format(prizeBreakdown.totalYen)}円`,
      note: status.buildSummary?.careerBandLabel ?? '設計帯未設定',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in">
      <section className="arcade-hero hero-stage">
        <div className="hero-grid xl:grid-cols-[1.08fr_0.92fr] xl:items-start">
          <div className="hero-copy">
            <div className="flex flex-col gap-4 sm:flex-row">
              <RikishiPortrait bodyType={status.bodyType} showLabel className="h-[220px] w-full sm:w-[220px]" />
              <div className="space-y-3">
                <div className="museum-kicker">結果</div>
                <h1 className="ui-text-heading text-4xl text-text sm:text-6xl">{status.shikona}</h1>
                <div className="text-sm text-text-dim">
                  {Math.round(status.bodyMetrics.heightCm)}cm / {Math.round(status.bodyMetrics.weightKg)}kg / {designedVsRealized}
                </div>
                <div className="flex flex-wrap gap-2">
                  <SummaryChip>最高位 {formatRankDisplayName(status.history.maxRank)}</SummaryChip>
                  <SummaryChip>気力 {status.spirit}</SummaryChip>
                  <SummaryChip>{headline}</SummaryChip>
                </div>
              </div>
            </div>

            <div className="summary-grid">
              {metrics.map((metric) => (
                <div key={metric.label} className="metric-tile">
                  <div className="metric-label">{metric.label}</div>
                  <div className="metric-value">{metric.value}</div>
                  {metric.note && <div className="metric-note">{metric.note}</div>}
                </div>
              ))}
            </div>
          </div>

          <div className="hero-side">
            <section className="scoreboard-panel p-5 sm:p-6">
              <div className="museum-kicker">読みどころ</div>
              <div className="mt-4 ticker-log">
                {fantasyHooks.slice(0, 4).map((hook) => (
                  <div key={hook} className="ticker-entry">
                    <span className="text-[var(--accent-gold)]">節目</span>
                    <span>{hook}</span>
                  </div>
                ))}
                {injuryWhatIf && (
                  <div className="ticker-entry">
                    <span className="text-[var(--accent-danger)]">もしも</span>
                    <span>{injuryWhatIf}</span>
                  </div>
                )}
              </div>
            </section>

            <section className="rpg-panel p-5 sm:p-6">
              <div className="museum-kicker">設計と実戦</div>
              <div className="mt-4 space-y-3">
                <div className="pixel-card-dark p-4">
                  <div className="text-xs tracking-[0.14em] text-text-dim">設計型</div>
                  <div className="mt-2 text-lg text-text">{status.designedStyleProfile?.label ?? '未設定'}</div>
                </div>
                <div className="pixel-card-dark p-4">
                  <div className="text-xs tracking-[0.14em] text-text-dim">実戦型</div>
                  <div className="mt-2 text-lg text-text">
                    {status.realizedStyleProfile?.label ?? 'まだ固まっていません'}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="command-bar">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'timeline', label: '人生年表', icon: <BookMarked size={15} /> },
            { id: 'analysis', label: '分析', icon: <LineChartIcon size={15} /> },
            { id: 'archive', label: '収蔵', icon: <Activity size={15} /> },
          ].map((tab) => (
            <button key={tab.id} type="button" className="museum-chip" data-active={activeTab === tab.id} onClick={() => setActiveTab(tab.id as ReportTab)}>
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

      {activeTab === 'timeline' && (
        <div className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
          <section className="rpg-panel p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="pixel-icon-badge"><BookMarked size={16} /></span>
              <div>
                <div className="museum-kicker">人生年表</div>
                <h2 className="ui-text-heading text-2xl text-text">節目を読み返す</h2>
              </div>
            </div>

            <div className="report-timeline">
              {timelineItems.length === 0 ? (
                <div className="scoreboard-panel p-5 text-sm text-text-dim">節目年表はまだありません。</div>
              ) : (
                timelineItems.map((item) => (
                  <article key={item.key} className="timeline-node">
                    <span className={`timeline-dot ${item.tone === 'danger' ? 'is-danger' : item.tone === 'neutral' ? 'is-neutral' : ''}`} />
                    <div className="text-xs text-[var(--accent-gold)]">{item.dateLabel}</div>
                    <div className="mt-2 ui-text-heading text-xl text-text">{item.title}</div>
                    <div className="mt-2 text-sm leading-7 text-text-dim">{item.summary}</div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="scoreboard-panel p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="pixel-icon-badge"><Activity size={16} /></span>
              <div>
                <div className="museum-kicker">概況</div>
                <h2 className="ui-text-heading text-2xl text-text">キャリア要約</h2>
              </div>
            </div>
            <div className="metric-board">
              <div className="metric-tile">
                <div className="metric-label">親方</div>
                <div className="metric-value">{status.buildSummary?.oyakataName ?? '不明'}</div>
                <div className="metric-note">
                  秘伝 {status.buildSummary?.secretStyle ? getStyleLabelJa(status.buildSummary.secretStyle) : '-'}
                </div>
              </div>
              <div className="metric-tile">
                <div className="metric-label">経歴</div>
                <div className="metric-value">
                  {status.buildSummary?.amateurBackground ? getBackgroundLabel(status.buildSummary.amateurBackground) : '不明'}
                </div>
                <div className="metric-note">{status.buildSummary?.careerBandLabel ?? '-'}</div>
              </div>
              <div className="metric-tile">
                <div className="metric-label">設計コスト</div>
                <div className="metric-value">{status.buildSummary?.spentPoints ?? 0}pt</div>
                <div className="metric-note">負債 {status.buildSummary?.debtCount ?? 0}枚</div>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'analysis' && (
        <div className="space-y-6">
          <section className="scoreboard-panel p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="pixel-icon-badge"><LineChartIcon size={16} /></span>
              <div>
                <div className="museum-kicker">分析</div>
                <h2 className="ui-text-heading text-2xl text-text">番付と体重の推移</h2>
              </div>
            </div>
            <div className="h-[380px] border-[2px] border-[rgba(91,122,165,0.28)] bg-[rgba(10,12,15,0.65)] p-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rankChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(91,122,165,0.16)" />
                  <XAxis
                    dataKey="slot"
                    tick={{ fontSize: 11, fill: '#9da7b3' }}
                    tickFormatter={(_value: number, index: number) => rankChartData[index]?.axisLabel ?? ''}
                    interval={0}
                    minTickGap={20}
                  />
                  <YAxis
                    yAxisId="rank"
                    type="number"
                    reversed
                    tick={{ fontSize: 11, fill: '#9da7b3' }}
                    width={60}
                    ticks={rankAxisTicks}
                    tickFormatter={formatRankAxisTick}
                    domain={[0, (dataMax: number) => Math.max(dataMax + 8, 42)]}
                  />
                  <YAxis
                    yAxisId="weight"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#d6a23d' }}
                    width={54}
                    domain={[Math.max(90, Math.floor(minWeight - 6)), Math.ceil(maxWeight + 6)]}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(_label: string, payload: Array<{ payload?: { bashoLabel: string } }>) => payload?.[0]?.payload?.bashoLabel ?? ''}
                  />
                  <Line yAxisId="rank" type="linear" dataKey="rankValue" stroke="#d6a23d" strokeWidth={2.5} dot={<EventDot />} activeDot={{ r: 4 }} />
                  <Line yAxisId="weight" type="monotone" dataKey="weightKg" stroke="#6ea66d" strokeWidth={2.2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-dim">
              {Object.entries(EVENT_BADGE).map(([key, label]) => (
                <span key={key} className="museum-chip">{label} {key}</span>
              ))}
            </div>
          </section>

          <section className="rpg-panel p-5 sm:p-6">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setDetailsOpen((prev) => ({ ...prev, hoshitori: !prev.hoshitori }))}>
              <div className="flex items-center gap-3">
                <span className="pixel-icon-badge"><Activity size={16} /></span>
                <h2 className="ui-text-heading text-2xl text-text">星取表</h2>
              </div>
              <ChevronDown size={18} className={detailsOpen.hoshitori ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
            {detailsOpen.hoshitori && (
              <div className="mt-4">
                <HoshitoriTable
                  careerRecords={hoshitoriCareerRecords}
                  shikona={status.shikona}
                  isLoading={isHoshitoriLoading}
                  errorMessage={hoshitoriErrorMessage}
                />
              </div>
            )}
          </section>

          <section className="scoreboard-panel p-5 sm:p-6">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setDetailsOpen((prev) => ({ ...prev, kimarite: !prev.kimarite }))}>
              <div className="flex items-center gap-3">
                <span className="pixel-icon-badge"><Swords size={16} /></span>
                <h2 className="ui-text-heading text-2xl text-text">決まり手の傾向</h2>
              </div>
              <ChevronDown size={18} className={detailsOpen.kimarite ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
            {detailsOpen.kimarite && (
              <div className="mt-4 h-[320px] border-[2px] border-[rgba(91,122,165,0.28)] bg-[rgba(10,12,15,0.65)] p-3">
                {kimariteData.length === 0 ? (
                  <div className="text-sm text-text-dim">決まり手データはありません。</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={kimariteData} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(91,122,165,0.16)" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#9da7b3' }} />
                      <YAxis dataKey="name" type="category" width={88} tick={{ fontSize: 11, fill: '#f3e9d2' }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="count" fill="#d6a23d" radius={[0, 0, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </section>

          <section className="rpg-panel p-5 sm:p-6">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setDetailsOpen((prev) => ({ ...prev, injuries: !prev.injuries }))}>
              <div className="flex items-center gap-3">
                <span className="pixel-icon-badge"><ShieldAlert size={16} /></span>
                <h2 className="ui-text-heading text-2xl text-text">怪我履歴</h2>
              </div>
              <ChevronDown size={18} className={detailsOpen.injuries ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
            {detailsOpen.injuries && (
              <div className="mt-4 space-y-4">
                <DamageMap
                  injuries={status.injuries}
                  historicRecords={status.injuries.map((injury) => injury.name)}
                  bodyType={status.bodyType}
                />
                <div className="grid gap-2">
                  {status.injuries.length === 0 ? (
                    <div className="text-sm text-text-dim">記録された怪我はありません。</div>
                  ) : (
                    status.injuries.map((injury) => (
                      <div key={injury.id} className="scoreboard-panel p-3">
                        <div className="text-sm text-text">{injury.name}</div>
                        <div className="text-xs text-text-dim">{formatBashoLabel(injury.occurredAt.year, injury.occurredAt.month)} / 重症度 {injury.severity}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'archive' && (
        <section className="rpg-panel p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="pixel-icon-badge"><BookMarked size={16} /></span>
            <div>
              <div className="museum-kicker">収蔵</div>
              <h2 className="ui-text-heading text-2xl text-text">この人生を残す</h2>
            </div>
          </div>
          <div className="space-y-4">
            <p className="text-sm leading-7 text-text-dim">
              ここで収蔵すると、次の周回に親方や図録の解放として引き継がれます。
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="metric-tile">
                <div className="metric-label">保存すると増えるもの</div>
                <div className="metric-note">親方候補、図録進行、周回用ポイント</div>
              </div>
              <div className="metric-tile">
                <div className="metric-label">今回の結果</div>
                <div className="metric-note">{headline}</div>
              </div>
            </div>
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
