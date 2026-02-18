// State update if needed, but simple obj spread is fine
import { RikishiStatus, Rank, BashoRecord, Oyakata, Injury, InjuryType } from './models';
import { CONSTANTS } from './constants';
import { calculateBattleResult, generateEnemy } from './battle';
import { calculateNextRank, getRankValue } from './ranking';
import { applyGrowth, checkRetirement } from './growth';
import { generateTitle } from './title_generator';

export interface SimulationParams {
    initialStats: RikishiStatus;
    oyakata: Oyakata | null;
}

export const runSimulation = async (params: SimulationParams): Promise<RikishiStatus> => {
    // Deep copy to avoid reference sharing for nested objects like history
    let status: RikishiStatus = JSON.parse(JSON.stringify(params.initialStats));
    status.statHistory = [];
    if (!status.injuries) status.injuries = []; // Init injuries array
    
    let year = new Date().getFullYear(); // 開始年
    
    // 入門イベント
    status.history.events.push({
        year: year,
        month: 1, // 仮
        type: 'ENTRY',
        description: `新弟子として入門。四股名「${status.shikona}」。`
    });

    // 15歳の1月から開始と仮定（または status.age から）
    // 引退までループ
    while (true) {
        // 年6場所
        const months = [1, 3, 5, 7, 9, 11];
        
        for (const month of months) {
            // 1. 引退チェック（場所前）
            const retirementCheck = checkRetirement(status);
            if (retirementCheck.shouldRetire) {
                return finalizeCareer(status, year, month, retirementCheck.reason);
            }

            // 2. 場所の処理 (Battles)
            const bashoRecord = runBasho(status, year, month);
            status.history.records.push(bashoRecord);
            
            // 3. 履歴更新（勝数など）
            updateCareerStats(status, bashoRecord);

            // 4. イベント判定（優勝、昇進など）
            // 怪我ログ
            if (bashoRecord.absent > 0) {
                 status.history.events.push({
                    year, month, type: 'INJURY',
                    description: `怪我により休場 (${bashoRecord.wins}勝${bashoRecord.losses}敗${bashoRecord.absent}休)`
                 });
            }

            // 直近の成績のみ取得（新しい順: index 0 = 前場所, 1 = 前々場所）
            const records = status.history.records;
            const len = records.length;
            const pastRecords = len >= 2
                ? [records[len - 2], records[len - 3]].filter(Boolean)
                : len >= 1 ? [records[len - 2]].filter(Boolean) : [];
            
            const rankChange = calculateNextRank(bashoRecord, pastRecords, status.isOzekiKadoban);
            
            // 昇進などのイベントログ
            if (rankChange.event) {
                let eventType: 'PROMOTION' | 'DEMOTION';
                let description: string;
                const recordStr = `(${bashoRecord.wins}勝${bashoRecord.losses}敗${bashoRecord.absent > 0 ? bashoRecord.absent + '休' : ''})`;

                if (rankChange.event === 'KADOBAN') {
                    eventType = 'DEMOTION';
                    description = `大関カド番 ${recordStr}`;
                } else if (rankChange.event.includes('PROMOTION')) {
                    eventType = 'PROMOTION';
                    description = `${rankChange.nextRank.name}へ昇進 ${recordStr}`;
                } else if (rankChange.event.includes('DEMOTION')) {
                    eventType = 'DEMOTION';
                    description = `${rankChange.nextRank.name}へ陥落 ${recordStr}`;
                } else {
                    eventType = 'PROMOTION';
                    description = `${status.rank.name}から${rankChange.nextRank.name}へ移動 ${recordStr}`;
                }

                status.history.events.push({
                    year, month, 
                    type: eventType,
                    description
                });
            }
            if (bashoRecord.yusho) {
                const yushoTitle = status.rank.division === 'Makuuchi' ? '幕内優勝' : `${status.rank.name}優勝`;
                status.history.events.push({
                    year, month, type: 'YUSHO',
                    description: `${yushoTitle} (${bashoRecord.wins}勝)`
                });
            }

            // 5. ステータス更新（成長・番付・怪我）
            // 番付更新
            status.rank = rankChange.nextRank;
            // カド番状態更新
            status.isOzekiKadoban = rankChange.isKadoban;

            // 成長処理 (場所後の能力更新)
            // 怪我処理ロジック修正:
            // - 元々怪我(injuryLevel > 0)なら、今回の休場は休養(Healing)。-> injuryOccurred = false
            // - 元々健康(injuryLevel = 0)で、今回休場(absent > 0)なら、新規怪我。-> injuryOccurred = true
            const isNewInjury = (status.injuryLevel === 0) && (bashoRecord.absent > 0);
            status = applyGrowth(status, params.oyakata, isNewInjury);

        }

        // 年末処理（加齢・履歴保存）
        status.statHistory.push({
            age: status.age,
            stats: { ...status.stats }
        });

        status.age += 1;
        year += 1;
        
        // Yield to allow UI updates
        await new Promise(resolve => setTimeout(resolve, 0));
    }
};

const runBasho = (status: RikishiStatus, year: number, month: number): BashoRecord => {
    const numBouts = CONSTANTS.BOUTS_MAP[status.rank.division];
    let wins = 0;
    let losses = 0;
    let absent = 0;

    // 怪我による休場チェック（場所前）
    if (status.injuryLevel > 0) {
        // 全休
        return {
            year, month,
            rank: status.rank,
            wins: 0,
            losses: 0, // 全休なので敗け数は0（番付上は負け扱いだが表示は0）
            absent: numBouts,
            yusho: false,
            specialPrizes: []
        };
    }

    // 取組ループ
    for (let day = 1; day <= numBouts; day++) {
        // 場所中の怪我発生判定（不戦敗）
        if (Math.random() < CONSTANTS.PROBABILITY.INJURY_PER_BOUT) {
            losses++; // その日は不戦敗
            const remaining = numBouts - day; // 残り日程
            absent += remaining;
            
            // 怪我生成
            const newInjury = generateInjury(status, year, month);
            if (!status.injuries) status.injuries = [];

            // 同じ箇所の怪我が治っていないかチェック
            const existingIndex = status.injuries.findIndex(i => i.type === newInjury.type && i.status !== 'HEALED');
            
            if (existingIndex >= 0) {
                // 既存の怪我を悪化させる（再発）
                const existing = status.injuries[existingIndex];
                existing.severity = Math.min(10, existing.severity + newInjury.severity);
                existing.status = 'ACUTE'; // 急性期に戻る
            } else {
                status.injuries.push(newInjury);
            }

            // 従来のinjuryLevelも一応更新（互換性）
            status.injuryLevel += newInjury.severity; 

            break;
        }

        // 敵生成
        const enemy = generateEnemy(status.rank.division, year);
        
        // 勝敗決定
        const result = calculateBattleResult(status, enemy);
        
        if (result.isWin) {
            wins++;
        } else {
            losses++;
        }
    }

    // 優勝判定（簡易：全勝 or 1敗かつ上位）
    let yusho = false;
    // 幕内: 13勝以上でチャンス
    if (status.rank.division === 'Makuuchi') {
        if (wins === 15) yusho = true;
        else if (wins === 14 && Math.random() < CONSTANTS.PROBABILITY.YUSHO.MAKUUCHI_14) yusho = true;
        else if (wins === 13 && Math.random() < CONSTANTS.PROBABILITY.YUSHO.MAKUUCHI_13) yusho = true;
    } else {
        // 十両以下: 全勝ならほぼ優勝
        if (numBouts === 15 && wins >= 14) yusho = Math.random() < CONSTANTS.PROBABILITY.YUSHO.JURYO_14;
        if (numBouts === 7 && wins === 7) yusho = Math.random() < CONSTANTS.PROBABILITY.YUSHO.LOWER_7;
    }

    return {
        year, month,
        rank: status.rank,
        wins, losses, absent,
        yusho,
        specialPrizes: [] // 省略
    };
};

const updateCareerStats = (status: RikishiStatus, record: BashoRecord) => {
    status.history.totalWins += record.wins;
    status.history.totalLosses += record.losses;
    status.history.totalAbsent += record.absent;
    
    if (record.yusho) {
        if (status.rank.division === 'Makuuchi') status.history.yushoCount.makuuchi++;
        else if (status.rank.division === 'Juryo') status.history.yushoCount.juryo++;
        else if (status.rank.division === 'Makushita') status.history.yushoCount.makushita++;
        else status.history.yushoCount.others++;
    }

    // 値が小さい方が偉い
    // 同じDivisionならNameで、同じNameならNumberで
    // ここでは簡易的にDivisionとNameだけで判定（Numberまで見ると履歴が細かい）
    // 厳密には RankingLogic の getRankValue を使うべき
    // maxRank は初期値で更新される
    
    // 厳密比較
     if (isHigherRank(status.rank, status.history.maxRank)) {
         status.history.maxRank = { ...status.rank };
     }
};

const isHigherRank = (r1: Rank, r2: Rank): boolean => {
    const v1 = getRankValue(r1);
    const v2 = getRankValue(r2);
    return v1 < v2;
}


const finalizeCareer = (status: RikishiStatus, year: number, month: number, reason?: string): RikishiStatus => {
    status.history.events.push({
        year, month,
        type: 'RETIREMENT',
        description: `引退 (${reason || '理由不明'})`
    });
    
    // 称号生成
    status.history.title = generateTitle(status.history);

    return status;
};

const generateInjury = (_status: RikishiStatus, year: number, month: number): Injury => {
    // Generate type based on weighted probability
    const types = Object.keys(CONSTANTS.INJURY_DATA) as InjuryType[];
    let totalWeight = 0;
    types.forEach(t => totalWeight += CONSTANTS.INJURY_DATA[t].weight);
    
    let r = Math.random() * totalWeight;
    let selectedType: InjuryType = types[0];
    for(const t of types) {
        r -= CONSTANTS.INJURY_DATA[t].weight;
        if(r <= 0) {
            selectedType = t;
            break;
        }
    }
    
    const data = CONSTANTS.INJURY_DATA[selectedType];
    // Random severity within range
    const severity = Math.floor(Math.random() * (data.severityMax - data.severityMin + 1)) + data.severityMin;
    
    return {
        id: crypto.randomUUID(),
        type: selectedType,
        name: data.name,
        severity,
        status: 'ACUTE',
        occurredAt: { year, month }
    };
};
