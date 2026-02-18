import React, { useState } from 'react';
import { Button } from '../common/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../common/Card';
import { RikishiStatus, Oyakata, TacticsType, TalentArchetype, EntryDivision } from '../../logic/models';
import { CONSTANTS } from '../../logic/constants';
import { generateShikona } from '../../logic/title_generator';
import { UserPlus, RefreshCw, Trophy, Star } from 'lucide-react';

const STAT_LABELS: Record<string, string> = {
  tsuki: '突', oshi: '押', kumi: '組', nage: '投',
  koshi: '腰', deashi: '出足', waza: '技', power: '力'
};

const TACTICS_LABELS: Record<TacticsType, string> = {
  'PUSH': '突き押し',
  'GRAPPLE': '四つ',
  'TECHNIQUE': '技巧派',
  'BALANCE': 'バランス'
};

type ScoutHistory = 'JHS_GRAD' | 'HS_GRAD' | 'HS_YOKOZUNA' | 'UNI_YOKOZUNA';

const HISTORY_OPTIONS: Record<ScoutHistory, { label: string, age: number, bonus: number, canTsukedashi?: boolean }> = {
    'JHS_GRAD': { label: '中学卒業', age: 15, bonus: 0 },
    'HS_GRAD': { label: '高校卒業', age: 18, bonus: 5 },
    'HS_YOKOZUNA': { label: '高校横綱', age: 18, bonus: 15 },
    'UNI_YOKOZUNA': { label: '学生横綱', age: 22, bonus: 25, canTsukedashi: true }
};

// 素質選択肢（ユーザー指定の2種類 + HardWorkerをデフォルト扱いにするか？）
// User said "Potential is Genius, Monster 2 types".
const TALENT_OPTIONS: { key: TalentArchetype, label: string, description: string }[] = [
    { key: 'MONSTER', label: '怪物', description: '規格外のパワーを持つ逸材。' },
    { key: 'GENIUS', label: '天才', description: '天性のセンスを持つ若武者。' },
    { key: 'HARD_WORKER', label: '指定なし', description: '標準的な能力を持つ入門者。' }
];

interface ScoutScreenProps {
  onStart: (initialStats: RikishiStatus, oyakata: Oyakata | null) => void;
}

export const ScoutScreen: React.FC<ScoutScreenProps> = ({ onStart }) => {
  const [shikona, setShikona] = useState(generateShikona());
  const [archetype, setArchetype] = useState<TalentArchetype>('HARD_WORKER');
  const [history, setHistory] = useState<ScoutHistory>('HS_GRAD');
  const [entryDivision, setEntryDivision] = useState<EntryDivision>('Maezumo');
  const [tactics, setTactics] = useState<TacticsType>('BALANCE');
  const [signatureMove, setSignatureMove] = useState<string>('寄り切り');

  const handleStart = () => {
    // 1. 素質データの取得
    const archData = CONSTANTS.TALENT_ARCHETYPES[archetype];
    const historyData = HISTORY_OPTIONS[history];

    // 2. 年齢と地位
    const age = historyData.age;
    let rank = { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 };
    
    // 入門区分
    if (historyData.canTsukedashi) {
        if (entryDivision === 'Makushita10') {
            rank = { division: 'Makushita', name: '幕下', side: 'East', number: 10 };
        } else if (entryDivision === 'Makushita15') {
            rank = { division: 'Makushita', name: '幕下', side: 'East', number: 15 };
        }
    }

    // 3. 潜在能力 (Potential)
    const [minPot, maxPot] = archData.potentialRange;
    const potential = minPot + Math.floor(Math.random() * (maxPot - minPot + 1));

    // 4. 初期能力値
    const stats: RikishiStatus['stats'] = {
        tsuki: 20, oshi: 20, kumi: 20, nage: 20,
        koshi: 20, deashi: 20, waza: 20, power: 20
    };
    
    // 素質ボーナス
    const archBonus = archData.initialStatBonus;
    
    // 経歴ボーナス
    const histBonus = historyData.bonus;

    (Object.keys(stats) as (keyof typeof stats)[]).forEach(k => {
        stats[k] += archBonus + histBonus;
    });

    // 戦術ボーナス
    const tacticMods = CONSTANTS.TACTICAL_GROWTH_MODIFIERS[tactics];
    (Object.keys(stats) as (keyof typeof stats)[]).forEach(k => {
        if (tacticMods[k] > 1.0) {
            stats[k] += 10;
        } else if (tacticMods[k] < 1.0) {
            stats[k] -= 5;
        }
    });

    // 乱数揺らぎ
    (Object.keys(stats) as (keyof typeof stats)[]).forEach(k => {
        stats[k] += Math.floor(Math.random() * 11) - 5;
        stats[k] = Math.max(1, stats[k]);
    });
    
    // RikishiStatus 初期化
    const initialStatus: RikishiStatus = {
        heyaId: 'my-heya',
        shikona,
        age,
        rank: rank as any,
        stats,
        potential,
        growthType: 'NORMAL',
        archetype, 
        entryDivision: (historyData.canTsukedashi && entryDivision !== 'Maezumo') ? entryDivision : undefined,
        tactics,
        signatureMoves: [signatureMove],
        durability: 80,
        currentCondition: 50,
        injuryLevel: 0,
        injuries: [],
        history: {
            records: [],
            events: [],
            maxRank: rank as any,
            totalWins: 0, totalLosses: 0, totalAbsent: 0,
            yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 }
        },
        statHistory: []
    };

    onStart(initialStatus, null);
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-6 h-6" />
            スカウト・新弟子検査
          </CardTitle>
          <CardDescription>
              期待の大型新人をスカウトし、入門させます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
            {/* 四股名 */}
            <div className="space-y-2">
                <label className="text-sm font-medium">四股名</label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={shikona} 
                        onChange={e => setShikona(e.target.value)}
                        className="flex-1 px-3 py-2 border rounded-md font-bold text-lg"
                    />
                    <Button variant="outline" onClick={() => setShikona(generateShikona())}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        おまかせ
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column: Talent & History */}
                <div className="space-y-6">
                    {/* 素質選択 */}
                    <div>
                        <h3 className="text-lg font-bold mb-3 border-b pb-2">1. 素質 (才能)</h3>
                        <div className="grid grid-cols-1 gap-3">
                            {TALENT_OPTIONS.map(opt => {
                                const isSelected = archetype === opt.key;
                                return (
                                    <div 
                                        key={opt.key}
                                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${isSelected ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}
                                        onClick={() => setArchetype(opt.key)}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-lg">{opt.label}</span>
                                            {isSelected && <Star className="w-5 h-5 text-indigo-600 fill-current" />}
                                        </div>
                                        <div className="text-xs text-slate-600 mt-1">
                                            {opt.description}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 経歴選択 */}
                    <div>
                        <h3 className="text-lg font-bold mb-3 border-b pb-2">2. 経歴・過去の実績</h3>
                        <div className="grid grid-cols-1 gap-3">
                            {(Object.keys(HISTORY_OPTIONS) as ScoutHistory[]).map(key => {
                                const data = HISTORY_OPTIONS[key];
                                const isSelected = history === key;
                                return (
                                    <div 
                                        key={key}
                                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${isSelected ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}
                                        onClick={() => {
                                            setHistory(key);
                                            // Reset entry division if capability changes
                                            if (!data.canTsukedashi) setEntryDivision('Maezumo');
                                        }}
                                    >
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold">{data.label}</span>
                                            {isSelected && <div className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">選択中</div>}
                                        </div>
                                        {/* Tsukedashi Options */}
                                        {isSelected && data.canTsukedashi && (
                                            <div className="mt-3 pt-2 border-t border-indigo-200 space-y-2">
                                                <div className="text-xs font-bold text-indigo-800 mb-1">入門地位:</div>
                                                <div className="grid grid-cols-1 gap-1">
                                                     <label className="flex items-center space-x-2 text-xs cursor-pointer">
                                                        <input 
                                                            type="radio" 
                                                            checked={entryDivision === 'Maezumo'} 
                                                            onChange={() => setEntryDivision('Maezumo')}
                                                            className="accent-indigo-600"
                                                        />
                                                        <span>前相撲 (通常)</span>
                                                     </label>
                                                     <label className="flex items-center space-x-2 text-xs cursor-pointer">
                                                        <input 
                                                            type="radio" 
                                                            checked={entryDivision === 'Makushita15'} 
                                                            onChange={() => setEntryDivision('Makushita15')}
                                                            className="accent-indigo-600"
                                                        />
                                                        <span>幕下15枚目格 (ベスト4)</span>
                                                     </label>
                                                    <label className="flex items-center space-x-2 text-xs cursor-pointer">
                                                        <input 
                                                            type="radio" 
                                                            checked={entryDivision === 'Makushita10'} 
                                                            onChange={() => setEntryDivision('Makushita10')}
                                                            className="accent-indigo-600"
                                                        />
                                                        <span>幕下10枚目格 (優勝)</span>
                                                    </label>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right Column: Style & Moves */}
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-bold mb-3 border-b pb-2">3. 戦術と得意技</h3>
                        
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">戦術タイプ</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['PUSH', 'GRAPPLE', 'TECHNIQUE', 'BALANCE'] as TacticsType[]).map(type => (
                                        <Button 
                                            key={type}
                                            variant={tactics === type ? 'primary' : 'outline'}
                                            onClick={() => setTactics(type)}
                                            size="sm"
                                            className="h-10"
                                        >
                                            {TACTICS_LABELS[type]}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">得意技（シグネチャームーブ）</label>
                                <select 
                                    className="w-full p-2 border rounded bg-white"
                                    value={signatureMove} 
                                    onChange={(e) => setSignatureMove(e.target.value)}
                                >
                                    {Object.entries(CONSTANTS.SIGNATURE_MOVE_DATA).map(([move, data]) => (
                                        <option key={move} value={move}>
                                            {move} ({data.relatedStats.map(s => STAT_LABELS[s]).join('/')} 成長+)
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-500">
                                    ※ 選択した技の勝率アップ & 関連ステータスの成長ボーナス
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border text-sm space-y-2">
                        <div className="font-bold border-b pb-1 mb-2">作成情報</div>
                        <div className="grid grid-cols-2 gap-2">
                            <div><span className="text-slate-500">四股名:</span> {shikona}</div>
                            <div><span className="text-slate-500">年齢:</span> {HISTORY_OPTIONS[history].age}歳</div>
                            <div><span className="text-slate-500">素質:</span> {TALENT_OPTIONS.find(t => t.key === archetype)?.label}</div>
                            <div><span className="text-slate-500">経歴:</span> {HISTORY_OPTIONS[history].label}</div>
                            <div><span className="text-slate-500">開始:</span> {
                                entryDivision === 'Makushita10' ? '幕下10枚目格' :
                                entryDivision === 'Makushita15' ? '幕下15枚目格' : '前相撲'
                            }</div>
                            <div><span className="text-slate-500">戦術:</span> {TACTICS_LABELS[tactics]}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="pt-4 border-t">
                <Button onClick={handleStart} className="w-full py-6 text-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg">
                    入門させる <Trophy className="w-5 h-5 ml-2" />
                </Button>
            </div>
        </CardContent>
      </Card>
    </div>
  );
};
