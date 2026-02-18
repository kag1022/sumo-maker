import React from 'react';
import { RikishiStatus, Rank } from '../../logic/models'; // Rank added
import { getRankValueForChart } from '../../logic/ranking';
import { Card, CardContent, CardHeader, CardTitle } from '../common/Card';
import { Button } from '../common/Button';
import { ArrowLeft, Trophy, Activity, TrendingUp } from 'lucide-react'; // TrendingUp fixed
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from 'recharts';

interface ReportScreenProps {
  status: RikishiStatus;
  onReset: () => void;
}

// ヘルパー: イベント色
const getEventColor = (type: string) => {
    switch(type) {
        case 'ENTRY': return 'bg-blue-500';
        case 'PROMOTION': return 'bg-green-500';
        case 'DEMOTION': return 'bg-red-400'; // was red-400
        case 'YUSHO': return 'bg-yellow-500';
        case 'INJURY': return 'bg-red-600';
        case 'RETIREMENT': return 'bg-slate-900';
        default: return 'bg-slate-300';
    }
};

// ヘルパー: ランク名フォーマット（筆頭対応）
const formatRankName = (rank: Rank, simple: boolean = false) => {
    const isSpecial = ['横綱', '大関', '関脇', '小結', '前相撲'].includes(rank.name);
    if (isSpecial) return rank.name;

    // 幕下以下 (人数＝枚数ではなく、東西で割る)
    if (['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'].includes(rank.division)) {
        const val = rank.number || 1;
        const effectiveRank = Math.ceil(val / 2);
        
        if (simple) {
             return `${rank.name}${effectiveRank === 1 ? '筆頭' : effectiveRank + '枚目'}`;
        }
        
        const side = (val % 2 === 1) ? '東' : '西';
        return `${side}${rank.name}${effectiveRank === 1 ? '筆頭' : effectiveRank + '枚目'}`;
    }

    if (rank.number === 1) return `${rank.name}筆頭`;
    return `${rank.name}${rank.number || ''}枚目`;
};

export const ReportScreen: React.FC<ReportScreenProps> = ({ status, onReset }) => {
  const { shikona, history } = status;
  const { title, maxRank, totalWins, totalLosses, totalAbsent, yushoCount } = history;
  
  // 幕内成績計算
  const makuuchiStats = React.useMemo(() => {
    const records = history.records.filter(r => r.rank.division === 'Makuuchi');
    const wins = records.reduce((a, c) => a + c.wins, 0);
    const losses = records.reduce((a, c) => a + c.losses, 0);
    const absent = records.reduce((a, c) => a + c.absent, 0);
    return { wins, losses, absent, bashoCount: records.length };
  }, [history.records]);
  const totalBashoCount = history.records.length;

  // 階級別成績データ作成
  const divisionStats = React.useMemo(() => {
    const divs = ['Makuuchi', 'Juryo', 'Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi', 'Maezumo'] as const;
    return divs.map(div => {
      const records = history.records.filter(r => r.rank.division === div);
      const wins = records.reduce((a, c) => a + c.wins, 0);
      const losses = records.reduce((a, c) => a + c.losses, 0);
      const absent = records.reduce((a, c) => a + c.absent, 0);
      const yusho = records.filter(r => r.yusho).length;
      return { name: div, basho: records.length, wins, losses, absent, yusho };
    }).filter(d => d.basho > 0);
  }, [history.records]);

  // 能力推移データ作成 (年齢ごと)
  const abilityHistoryData = React.useMemo(() => {
    if (!status.statHistory || status.statHistory.length === 0) return [];
    return status.statHistory.map(item => ({
        age: item.age,
        tsuki: Math.round(item.stats.tsuki),
        oshi: Math.round(item.stats.oshi),
        kumi: Math.round(item.stats.kumi),
        nage: Math.round(item.stats.nage),
        koshi: Math.round(item.stats.koshi),
        deashi: Math.round(item.stats.deashi),
        waza: Math.round(item.stats.waza),
        power: Math.round(item.stats.power),
    }));
  }, [status.statHistory]);

  // 決まり手傾向データ (上位10件)
  const kimariteData = React.useMemo(() => {
    const total = history.kimariteTotal || {};
    return Object.entries(total)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }, [history.kimariteTotal]);

  // 番付推移データ
  const lineData = history.records.map(r => {
        const label = formatRankName(r.rank);
            
        const age = Math.floor((r.year - history.records[0].year) + 15);
        return {
          time: `${r.year}年${r.month}月`,
          age: age,
          rankVal: -1 * getRankValueForChart(r.rank), 
          rankLabel: label
        };
    });

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* ヒーローセクション */}
      <div className="bg-slate-900 text-white p-8 rounded-xl shadow-2xl text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-100 via-slate-900 to-slate-900"></div>
        <div className="relative z-10">
          <p className="text-yellow-400 font-bold tracking-widest text-lg mb-2">{title || '無名の力士'}</p>
          <h1 className="text-5xl font-black mb-4 tracking-tight">{shikona}</h1>
          <div className="flex justify-center gap-6 text-slate-300">
            <div>
              <span className="block text-xs uppercase tracking-wider">最高位</span>
              <span className="text-2xl font-bold text-white">
                {formatRankName(maxRank, true)}
              </span>
            </div>
            <div className="text-left">
              <div className="mb-2">
                <span className="block text-xs uppercase tracking-wider text-slate-400">生涯戦歴</span>
                <span className="text-xl font-bold text-white block">
                  {totalWins}勝{totalLosses}敗{totalAbsent}休 <span className="text-sm font-normal text-slate-400">({totalBashoCount}場所)</span>
                </span>
              </div>
              {makuuchiStats.bashoCount > 0 && (
                <div>
                  <span className="block text-xs uppercase tracking-wider text-slate-400">幕内戦歴</span>
                  <span className="text-xl font-bold text-white block">
                    {makuuchiStats.wins}勝{makuuchiStats.losses}敗{makuuchiStats.absent}休 <span className="text-sm font-normal text-slate-400">({makuuchiStats.bashoCount}場所)</span>
                  </span>
                </div>
              )}
            </div>
            <div>
              <span className="block text-xs uppercase tracking-wider">幕内優勝</span>
              <span className="text-2xl font-bold text-white">{yushoCount.makuuchi}回</span>
            </div>
          </div>
        </div>
      </div>

      {/* グラフエリア */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
                <Activity className="w-5 h-5 mr-2"/>
                 能力履歴 (年齢別)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={abilityHistoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="age" label={{ value: '年齢', position: 'insideBottomRight', offset: -5 }} />
                <YAxis domain={[0, 150]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="tsuki" name="突き" stroke="#ef4444" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="oshi" name="押し" stroke="#f97316" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="kumi" name="組力" stroke="#3b82f6" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="nage" name="投げ" stroke="#22c55e" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="koshi" name="腰" stroke="#a855f7" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="deashi" name="出足" stroke="#06b6d4" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="waza" name="技術" stroke="#ec4899" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="power" name="筋力" stroke="#854d0e" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center"><TrendingUp className="w-5 h-5 mr-2"/>番付推移</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" hide={false} interval={5} tick={{fontSize: 10}} label={{ value: '場所', position: 'insideBottomRight', offset: -5 }} />
                <YAxis 
                    hide={false} 
                    domain={[-500, 10]} 
                    tickFormatter={(val) => {
                        const v = Math.abs(val);
                        if (v === 0) return '横綱';
                        if (v === 10) return '大関';
                        if (v === 40) return '幕内';
                        if (v === 60) return '十両';
                        if (v === 80) return '幕下';
                        if (v === 150) return '三段目';
                        return '';
                    }}
                    ticks={[0, -10, -40, -60, -80, -150]}
                    width={50}
                    tick={{fontSize: 10}}
                />
                <Tooltip 
                    labelFormatter={(label) => `${label}`}
                    formatter={(_val: number, _name: string, props: {payload?: {rankLabel: string}}) => [props.payload?.rankLabel || '', '番付']}
                />
                <Line type="monotone" dataKey="rankVal" stroke="#82ca9d" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 決まり手傾向 */}
      {kimariteData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center"><Trophy className="w-5 h-5 mr-2 text-amber-500"/>決まり手傾向 (上位10)</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kimariteData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 13 }} />
                <Tooltip formatter={(value: number) => [`${value}回`, '回数']}/>
                <Bar dataKey="count" name="回数" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>階級別成績詳細</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-100 uppercase text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">階級</th>
                  <th className="px-4 py-2 font-medium text-right">場所数</th>
                  <th className="px-4 py-2 font-medium text-right">勝</th>
                  <th className="px-4 py-2 font-medium text-right">敗</th>
                  <th className="px-4 py-2 font-medium text-right">休</th>
                  <th className="px-4 py-2 font-medium text-center">優勝</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {divisionStats.map(d => (
                  <tr key={d.name} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-bold text-slate-700">
                      {{
                        'Makuuchi':'幕内', 'Juryo':'十両', 'Makushita':'幕下', 
                        'Sandanme':'三段目', 'Jonidan':'序二段', 'Jonokuchi':'序ノ口', 'Maezumo':'前相撲'
                      }[d.name] || d.name}
                    </td>
                    <td className="px-4 py-2 text-right">{d.basho}</td>
                    <td className="px-4 py-2 text-right text-red-600 font-medium">{d.wins}</td>
                    <td className="px-4 py-2 text-right">{d.losses}</td>
                    <td className="px-4 py-2 text-right text-slate-400">{d.absent}</td>
                    <td className="px-4 py-2 text-center text-yellow-600 font-bold">{d.yusho > 0 ? d.yusho + '回' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 怪我ステータス */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-red-600">
             <Activity className="w-5 h-5 mr-2"/>
             引退時の身体状態 (古傷・最終的な怪我)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(status.injuries && status.injuries.length > 0) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {status.injuries.map(injury => {
                      let bgColor = 'bg-red-50 border-red-200';
                      let badgeColor = 'bg-red-100 text-red-700';
                      let statusText = '治療中';
                      
                      if (injury.status === 'CHRONIC') {
                          bgColor = 'bg-amber-50 border-amber-200';
                          badgeColor = 'bg-amber-100 text-amber-700';
                          statusText = '慢性';
                      } else if (injury.status === 'HEALED') {
                          bgColor = 'bg-slate-50 border-slate-200';
                          badgeColor = 'bg-slate-100 text-slate-500';
                          statusText = '完治';
                      }

                      return (
                      <div key={injury.id} className={`p-3 rounded border ${bgColor}`}>
                          <div className="flex justify-between items-center mb-1">
                              <span className={`font-bold ${injury.status === 'HEALED' ? 'text-slate-500' : 'text-slate-800'}`}>{injury.name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${badgeColor}`}>
                                  {statusText}
                              </span>
                          </div>
                          <div className="text-sm text-slate-600">
                              {injury.status === 'HEALED' ? '回復済み' : `重症度: ${injury.severity} / 10`}
                          </div>
                      </div>
                      );
                  })}
              </div>
          ) : (
              <p className="text-slate-500 py-4 text-center">引退時、深刻な怪我や古傷はありませんでした。</p>
          )}
        </CardContent>
      </Card>

      {/* タイムライン */}
      <Card>
        <CardHeader>
          <CardTitle>相撲人生記</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {history.events.map((ev, idx) => (
              <div key={idx} className="flex gap-4 items-start border-l-2 border-slate-200 pl-4 py-1 relative">
                <div className={`absolute -left-[9px] top-2 w-4 h-4 rounded-full border-2 border-white ${getEventColor(ev.type)}`}></div>
                <div className="w-20 font-mono text-sm text-slate-500 pt-0.5">{ev.year}年{ev.month}月</div>
                <div className="flex-1">
                    <p className="text-sm">{ev.description}</p>
                    {ev.type === 'YUSHO' && <Trophy className="w-4 h-4 text-yellow-500 inline mt-1" />}
                </div>
              </div>
            ))}
            {history.events.length === 0 && <p className="text-slate-500">記録なし</p>}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center gap-4 pt-8">
        <Button size="lg" onClick={onReset} variant="secondary">
          <ArrowLeft className="w-4 h-4 mr-2" />
          もう一度遊ぶ
        </Button>
        <Button size="lg" onClick={() => {
            import('../../logic/storage').then(({ saveRikishi }) => {
                saveRikishi(status);
                alert('保存しました！');
            });
        }}>
            <Trophy className="w-4 h-4 mr-2" />
            殿堂入り保存
        </Button>
      </div>
    </div>
  );
};
