import { Rank, Division, BashoRecord } from './models';
import { CONSTANTS } from './constants';

const DIVISIONS: Division[] = ['Makuuchi', 'Juryo', 'Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi', 'Maezumo'];

// ランクの強さを数値化（比較用）
// 小さいほど偉い
export const getRankValue = (rank: Rank): number => {
    // Makuuchiの場合、名前で判定
    if (rank.division === 'Makuuchi') {
        if (rank.name === '横綱') return 0;
        if (rank.name === '大関') return 10;
        if (rank.name === '関脇') return 20;
        if (rank.name === '小結') return 30;
        // 前頭は枚数
        return 40 + (rank.number || 1);
    }
    
    // 十両以下
    // 定数から基準値を取得、なければ安全策で大きい値
    const base = (CONSTANTS.RANK_VALUE[rank.division as keyof typeof CONSTANTS.RANK_VALUE] || 100) * 100;
    return base + (rank.number || 1);
};

// グラフ表示用ランク値（視認性重視のスケール）
export const getRankValueForChart = (rank: Rank): number => {
    if (rank.division === 'Makuuchi') {
        if (rank.name === '横綱') return 0;
        if (rank.name === '大関') return 10;
        if (rank.name === '関脇') return 20;
        if (rank.name === '小結') return 30;
        return 40 + (rank.number || 1); 
    }
    if (rank.division === 'Juryo') return 60 + (rank.number || 1); 
    if (rank.division === 'Makushita') return 80 + (rank.number || 1); 
    if (rank.division === 'Sandanme') return 150 + (rank.number || 1); 
    if (rank.division === 'Jonidan') return 260 + (rank.number || 1); 
    if (rank.division === 'Jonokuchi') return 470 + (rank.number || 1); 
    return 600; 
};

/**
 * 次の場所の番付を計算（厳格化版）
 * @param currentRecord 今場所の成績
 * @param pastRecords 直近の成績（新しい順: index 0 = 前場所, 1 = 前々場所...）
 * @param isOzekiKadoban 大関カド番フラグ
 */
export const calculateNextRank = (
    currentRecord: BashoRecord, 
    pastRecords: BashoRecord[], 
    isOzekiKadoban?: boolean
): { nextRank: Rank, event?: string, isKadoban?: boolean } => {
    
    const currentRank = currentRecord.rank;
    const wins = currentRecord.wins;
    //const losses = currentRecord.losses; // 未使用なら削除してよい
    //const diff = wins - losses; // 未使用

    // 1. 横綱 (Yokozuna)
    if (currentRank.name === '横綱') {
        // 横綱は陥落しない（引退勧告は別ロジック）
        return { nextRank: currentRank };
    }

    // 2. 大関 (Ozeki)
    if (currentRank.name === '大関') {
        // 横綱昇進判定 (厳格化: 2場所連続優勝 or 準ずる成績)
        // 準ずる成績 = 優勝同点、あるいは14勝以上などハイレベルな成績
        // ここでは「優勝」フラグを見る
        const prevRecord = pastRecords[0];
        
        if (currentRecord.yusho && prevRecord && prevRecord.yusho && prevRecord.rank.name === '大関') {
             return { 
                nextRank: { division: 'Makuuchi', name: '横綱', side: 'East' }, 
                event: 'PROMOTION_TO_YOKOZUNA', isKadoban: false 
            };
        }
        // 準ずる成績 (例: 前場所優勝14勝 -> 今場所14勝優勝ならず でも昇進可能性あり)
        if (wins >= 14 && prevRecord && prevRecord.yusho && prevRecord.rank.name === '大関') {
             // 審議対象だが、ここでは確率で昇進させる
             if (Math.random() < 0.8) {
                return { 
                    nextRank: { division: 'Makuuchi', name: '横綱', side: 'East' }, 
                    event: 'PROMOTION_TO_YOKOZUNA', isKadoban: false 
                };
             }
        }

        // カド番処理
        if (wins >= 8) {
            // 勝ち越し -> カド番解除
            return { nextRank: currentRank, isKadoban: false };
        } else {
            // 負け越し
            if (isOzekiKadoban) {
                // カド番で負け越し -> 関脇へ陥落
                return { 
                    nextRank: { division: 'Makuuchi', name: '関脇', side: 'East' }, 
                    event: 'DEMOTION_TO_SEKIWAKE', isKadoban: false
                };
            } else {
                // カド番へ
                return { nextRank: currentRank, isKadoban: true, event: 'KADOBAN' };
            }
        }
    }

    // 3. 関脇・小結 (Sanyaku)
    if (['関脇', '小結'].includes(currentRank.name)) {
        // 大関昇進判定 (厳格化: 直近3場所33勝)
        // 起点は三役であること
        // pastRecords[0] (前場所), pastRecords[1] (2場所前)
        const r1 = currentRecord;
        const r2 = pastRecords[0];
        const r3 = pastRecords[1];

        if (r2 && r3) {
            // 3場所とも三役(または大関陥落直後)であること (平幕からの33勝は起点にならないことが多い)
            // 簡易的に「3場所前が小結以上」かつ「合計33勝」
            const isSanyakuOrBetter = (r: Rank) => ['横綱', '大関', '関脇', '小結'].includes(r.name);
            
            if (isSanyakuOrBetter(r1.rank) && isSanyakuOrBetter(r2.rank) && isSanyakuOrBetter(r3.rank)) {
                const totalWins3 = r1.wins + r2.wins + r3.wins;
                if (totalWins3 >= 33) {
                    return { 
                        nextRank: { division: 'Makuuchi', name: '大関', side: 'East' }, 
                        event: 'PROMOTION_TO_OZEKI' 
                    };
                }
            }
        }
    }

    // 4. 幕内・十両・幕下etc (General Rank Logic)
    return calculateStandardRankChange(currentRecord);
};

// 標準的な番付移動 (各段位)
const calculateStandardRankChange = (record: BashoRecord): { nextRank: Rank, event?: string } => {
    const currentRank = record.rank;
    const wins = record.wins;
    // runner.tsの変更により、record.lossesには不戦敗（休場）が含まれていないため、absentを加算して実質的な負け数を計算する
    const losses = record.losses + record.absent; 
    const diff = wins - losses;
    
    //---------------------------------------------------------
    // 幕内 (Makuuchi)
    //---------------------------------------------------------
    if (currentRank.division === 'Makuuchi') {
        // 三役昇進 (関脇・小結)
        // 小結: 前頭上位で勝ち越し幅が大きい場合
        if (currentRank.name === '前頭') {
            const num = currentRank.number || 1;
            // 前頭筆頭で勝ち越し -> 小結のチャンス (8勝でも上がれることがある)
            if (num === 1 && wins >= 8) {
                // 枠の都合があるが、シミュレーションでは昇進
                 return { nextRank: { division: 'Makuuchi', name: '小結', side: 'East' }, event: 'PROMOTION_TO_KOMUSUBI' };
            }
            // 前頭3枚目以内で二桁勝利
            if (num <= 3 && wins >= 10) {
                 return { nextRank: { division: 'Makuuchi', name: '小結', side: 'East' }, event: 'PROMOTION_TO_KOMUSUBI' };
            }
        }
        
        // 小結 -> 関脇
        if (currentRank.name === '小結' && wins >= 8) {
             return { nextRank: { division: 'Makuuchi', name: '関脇', side: 'East' }, event: 'PROMOTION_TO_SEKIWAKE' };
        }

        // 平幕内の昇降 (1勝につき1枚程度、上位は詰まる)
        // 簡易計算: 新しい枚数 = 現在枚数 - (勝ち越し数)
        // 負け越しの場合は逆に下がる
        let move = diff; 
        if (diff > 0) {
             // 勝ち越しボーナス (上位ほど上がりにくいが、下位は上がりやすい)
             if ((currentRank.number || 1) > 10) move = Math.floor(diff * 1.5);
        } else {
             // 負け越しペナルティ (上位ほど落ちやすい)
             // 例: 5-10 (-5) -> 5枚以上落ちる
             if ((currentRank.number || 1) < 10) move = Math.floor(diff * 1.2);
        }

        // 現在が三役の場合の陥落処理
        // 関脇で負け越し -> 小結 or 平幕
        if (currentRank.name === '関脇' && diff < 0) {
             if (wins >= 5) return { nextRank: { division: 'Makuuchi', name: '小結', side: 'East' }, event: 'DEMOTION_TO_KOMUSUBI' };
             return { nextRank: { division: 'Makuuchi', name: '前頭', number: 3, side: 'East' }, event: 'DEMOTION_TO_MAEGASHIRA' };
        }
        if (currentRank.name === '小結' && diff < 0) {
             return { nextRank: { division: 'Makuuchi', name: '前頭', number: 1 - diff, side: 'East' }, event: 'DEMOTION_TO_MAEGASHIRA' };
        }

        let newNumber = (currentRank.number || 1) - move;
        
        // 境界チェック
        if (newNumber < 1) newNumber = 1; // 筆頭で頭打ち
        if (newNumber > 17) {
             // 十両陥落
             // M17相当より下 -> 十両
             const jNumber = newNumber - 17;
             return { nextRank: { division: 'Juryo', name: '十両', number: Math.max(1, Math.min(14, jNumber)), side: 'East' }, event: 'DEMOTION_TO_JURYO' };
        }
        
        return { nextRank: { ...currentRank, number: Math.floor(newNumber) } };
    }

    //---------------------------------------------------------
    // 十両 (Juryo)
    //---------------------------------------------------------
    if (currentRank.division === 'Juryo') {
        const num = currentRank.number || 1;
        
        // 幕内昇進 (十両筆頭で勝ち越し、または上位で好成績)
        if ((num === 1 && wins >= 8) || (num <= 5 && wins >= 11)) {
             // 昇進先の枚数目安
             let mNumber = 16 - (wins - 8); // 8勝ならM16, 10勝ならM14...
             if (mNumber < 12) mNumber = 12; // いきなり上位はない
             return { nextRank: { division: 'Makuuchi', name: '前頭', number: mNumber, side: 'East' }, event: 'PROMOTION_TO_MAKUUCHI' };
        }
        
        // 上がりやすく落ちやすい
        const move = Math.floor(diff * 1.2);
        
        const newNumber = num - move;
        
        if (newNumber < 1) {
            // 筆頭より上 -> 幕内昇進 (上のifで漏れた場合)
            return { nextRank: { division: 'Makuuchi', name: '前頭', number: 16, side: 'East' }, event: 'PROMOTION_TO_MAKUUCHI' };
        }
        if (newNumber > 14) {
            // 幕下陥落
            return { nextRank: { division: 'Makushita', name: '幕下', number: 1, side: 'East' }, event: 'DEMOTION_TO_MAKUSHITA' };
        }

        return { nextRank: { ...currentRank, number: Math.max(1, Math.floor(newNumber)) } };
    }

    //---------------------------------------------------------
    // 幕下以下 (Makushita and lower) - 7番勝負
    //---------------------------------------------------------
    return calculateLowerDivisionRankChange(record);
};

// 幕下以下の計算
const calculateLowerDivisionRankChange = (record: BashoRecord): { nextRank: Rank, event?: string } => {
    const currentRank = record.rank;
    const wins = record.wins;
    
    // Special Rule: 前相撲 -> 序ノ口
    if (currentRank.division === 'Maezumo') {
        if (wins >= 1) return { nextRank: { division: 'Jonokuchi', name: '序ノ口', number: 20, side: 'East' }, event: 'PROMOTION_TO_JONOKUCHI' };
        return { nextRank: currentRank };
    }
    
    // 勝数による移動量定義 (公式に近い目安)
    // 7勝: 大幅アップ
    // 6勝: 15-20枚アップ
    // 5勝: 7-10枚アップ
    // 4勝: 2-3枚アップ
    // 3勝: 3-4枚ダウン
    // ...
    let rankUpAmount = 0;
    if (wins === 7) rankUpAmount = 50; // 全勝
    else if (wins === 6) rankUpAmount = 15;
    else if (wins === 5) rankUpAmount = 7;
    else if (wins === 4) rankUpAmount = 2;
    else if (wins === 3) rankUpAmount = -4;
    else if (wins === 2) rankUpAmount = -8;
    else if (wins === 1) rankUpAmount = -15;
    else if (wins === 0) rankUpAmount = -30;

    const currentNum = currentRank.number || 50; // デフォルト50枚目
    let newNumber = currentNum - rankUpAmount;
    
    // 昇進判定 (Division Up)
    if (newNumber < 1) {
        // 現在のDivisionIndex
        const currentIndex = DIVISIONS.indexOf(currentRank.division);
        if (currentIndex > 2) { // Makushitaより下 (Makushita=2)
             const nextDiv = DIVISIONS[currentIndex - 1];
             const divNameMap: Record<string, string> = {
                 'Makushita': '幕下',
                 'Sandanme': '三段目',
                 'Jonidan': '序二段',
                 'Jonokuchi': '序ノ口'
             };
             // 昇進後の枚数 (残り枚数分を上位へ)
             // 例: 幕下60 -> 50枚アップ -> -10 -> 上位へ10枚分食い込む -> 50(定格) - 10 = 40 ??
             // 簡易的に「最下位の少し上」スタートにする
             let startNumber = 60; // 幕下・三段目は60枚、序二段は100枚くらいあるが
             if (nextDiv === 'Makushita') startNumber = 60;
             else if (nextDiv === 'Sandanme') startNumber = 100;

             return { nextRank: { division: nextDiv, name: divNameMap[nextDiv] || nextDiv, number: startNumber, side: 'East' }, event: 'PROMOTION' };
        } else if (currentRank.division === 'Makushita') {
            // 幕下 -> 十両の壁 (The Wall)
            // 幕下15枚目以内の全勝 (7-0) -> 無条件昇進
            if (currentNum <= 15 && wins === 7) {
                 return { nextRank: { division: 'Juryo', name: '十両', number: 13, side: 'East' }, event: 'PROMOTION_TO_JURYO' };
            }
            // 幕下筆頭〜5枚目の勝ち越し
            if (currentNum <= 5 && wins >= 4) {
                 // 筆頭の4-3は昇進濃厚、5枚目なら6-1が必要など
                 // 簡易シミュレーション
                 if (currentNum === 1 || wins >= 5) {
                     return { nextRank: { division: 'Juryo', name: '十両', number: 14, side: 'East' }, event: 'PROMOTION_TO_JURYO' };
                 }
            }
            // それ以外は幕下上位で留まる (筆頭へ)
            if (newNumber < 1) newNumber = 1;
        }
    }

    // 陥落判定
    // 序ノ口の底
    if (currentRank.division === 'Jonokuchi' && newNumber > 30) newNumber = 30;
    
    // Division Down (簡易: 数値が大きくなりすぎたら落とす)
    // しかし各段の枚数定義が曖昧なので、一旦省略して「枚数の最大値を設けない」か、
    // あるいは「一定以上で強制降格」させるか。
    // 今回は「負け越して枚数が溢れたら」次の段へ
    const BOUNDARY_MAP: Record<string, number> = {
        'Makushita': 60,
        'Sandanme': 100,
        'Jonidan': 200 // 序二段は多い
    };
    const bound = BOUNDARY_MAP[currentRank.division];
    if (bound && newNumber > bound) {
        // 陥落
        const currentIndex = DIVISIONS.indexOf(currentRank.division);
        if (currentIndex < 6) { // Jonokuchi(5)まで
            const nextDiv = DIVISIONS[currentIndex + 1];
            const divNameMap: Record<string, string> = {
                 'Sandanme': '三段目',
                 'Jonidan': '序二段',
                 'Jonokuchi': '序ノ口'
             };
             return { nextRank: { division: nextDiv, name: divNameMap[nextDiv] || nextDiv, number: 1, side: 'East' }, event: 'DEMOTION' };
        }
    }

    return { nextRank: { ...currentRank, number: Math.max(1, Math.floor(newNumber)) } };
};
