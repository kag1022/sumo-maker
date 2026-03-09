import React from 'react';
import { BodyType, Injury, InjuryStatusType, InjuryType } from '../../logic/models';

interface DamageMapProps {
  injuries: Injury[];
  historicRecords?: string[];
  bodyType?: BodyType;
  className?: string;
}

const parseHistoricInjury = (desc: string): Injury | null => {
  let type: InjuryType | null = null;
  if (desc.includes('首') && !desc.includes('手首') && !desc.includes('足首')) type = 'NECK';
  else if (desc.includes('肩')) type = 'SHOULDER';
  else if (desc.includes('肘')) type = 'ELBOW';
  else if (desc.includes('手首')) type = 'WRIST';
  else if (desc.includes('背')) type = 'BACK';
  else if (desc.includes('太もも') || desc.includes('ハムストリング') || desc.includes('肉離れ')) type = 'HAMSTRING';
  else if (desc.includes('膝') || desc.includes('半月板') || desc.includes('靭帯')) type = 'KNEE';
  else if (desc.includes('足首') || desc.includes('アキレス')) type = 'ANKLE';
  else if (desc.includes('肋') || desc.includes('胸')) type = 'RIB';
  else if (desc.includes('腰')) type = 'HIP';
  else return null;

  return {
    id: `hist-${Math.random().toString(36).substring(7)}`,
    type,
    name: desc,
    severity: 1, // History markers are small
    status: 'HEALED',
    occurredAt: { year: 0, month: 0 }
  };
};

type MarkerPoint = { x: string; y: string; side: 'front' | 'back' };

const STATUS_STYLE: Record<InjuryStatusType, { fill: string; stroke: string; label: string }> = {
  ACUTE: { fill: 'rgba(154,67,53,0.5)', stroke: '#9a4335', label: '治療中' },
  SUBACUTE: { fill: 'rgba(196,114,64,0.5)', stroke: '#c47240', label: '回復中' },
  CHRONIC: { fill: 'rgba(110,93,164,0.5)', stroke: '#6e5da4', label: '慢性' },
  HEALED: { fill: 'rgba(88,114,136,0.3)', stroke: '#587288', label: '完治痕' },
};

// ひとまず大まかなパーセンテージでプロットし、適宜調整します。
const BASE_FRONT_POINTS: Record<InjuryType, MarkerPoint[]> = {
  NECK: [{ x: '50%', y: '20%', side: 'front' }],
  SHOULDER: [{ x: '35%', y: '28%', side: 'front' }, { x: '65%', y: '28%', side: 'front' }],
  ELBOW: [{ x: '25%', y: '45%', side: 'front' }, { x: '75%', y: '45%', side: 'front' }],
  WRIST: [{ x: '20%', y: '55%', side: 'front' }, { x: '80%', y: '55%', side: 'front' }],
  RIB: [{ x: '42%', y: '40%', side: 'front' }, { x: '58%', y: '40%', side: 'front' }],
  HIP: [{ x: '40%', y: '55%', side: 'front' }, { x: '60%', y: '55%', side: 'front' }],
  KNEE: [{ x: '42%', y: '75%', side: 'front' }, { x: '58%', y: '75%', side: 'front' }],
  ANKLE: [{ x: '40%', y: '90%', side: 'front' }, { x: '60%', y: '90%', side: 'front' }],
  BACK: [{ x: '50%', y: '40%', side: 'back' }],
  HAMSTRING: [{ x: '42%', y: '68%', side: 'back' }, { x: '58%', y: '68%', side: 'back' }],
};

const BASE_BACK_POINTS: Record<InjuryType, MarkerPoint[]> = {
  ...BASE_FRONT_POINTS,
  NECK: [{ x: '50%', y: '20%', side: 'back' }],
  SHOULDER: [{ x: '35%', y: '28%', side: 'back' }, { x: '65%', y: '28%', side: 'back' }],
  ELBOW: [{ x: '25%', y: '45%', side: 'back' }, { x: '75%', y: '45%', side: 'back' }],
  WRIST: [{ x: '20%', y: '55%', side: 'back' }, { x: '80%', y: '55%', side: 'back' }],
  HIP: [{ x: '40%', y: '55%', side: 'back' }, { x: '60%', y: '55%', side: 'back' }],
  KNEE: [{ x: '42%', y: '75%', side: 'back' }, { x: '58%', y: '75%', side: 'back' }],
  ANKLE: [{ x: '40%', y: '90%', side: 'back' }, { x: '60%', y: '90%', side: 'back' }],
};

const resolvePoints = (injury: Injury, side: 'front' | 'back'): MarkerPoint[] => {
  // TODO: 体型に応じた微調整を後で行う場合、引数にbodyTypeを追加して処理を分岐できます
  const table = side === 'front' ? BASE_FRONT_POINTS : BASE_BACK_POINTS;
  const points = table[injury.type] ?? [];
  const filtered = points.filter((point) => point.side === side);
  if (filtered.length <= 1) return filtered;

  if (injury.name.includes('右')) {
    return [filtered[1] ?? filtered[0]];
  }
  if (injury.name.includes('左')) {
    return [filtered[0]];
  }
  return filtered;
};

const getBodyImagePath = (bodyType: BodyType, side: 'front' | 'back'): string => {
  const typeStr = bodyType.toLowerCase();
  return `/images/rikishi/${typeStr}_${side}.png`;
};

const BodyImageOverlay = ({
  side,
  injuries,
  bodyType,
}: {
  side: 'front' | 'back';
  injuries: Injury[];
  bodyType: BodyType;
}) => (
  <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
    <img
      src={getBodyImagePath(bodyType, side)}
      alt={side === 'front' ? '前面' : '背面'}
      className="object-contain max-h-full max-w-full drop-shadow-md pixelated"
      style={{ imageRendering: 'pixelated' }}
    />
    {injuries.flatMap((injury) =>
      resolvePoints(injury, side).map((point, index) => {
        const statusStyle = STATUS_STYLE[injury.status];
        const size = Math.max(16, 12 + injury.severity * 3); // Slightly larger for retro visibility
        return (
          <div
            key={`${side}-${injury.id}-${index}`}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 shadow-sm animate-pulse flex items-center justify-center pointer-events-none"
            style={{
              left: point.x,
              top: point.y,
              width: `${size}px`,
              height: `${size}px`,
              zIndex: 10,
              imageRendering: 'pixelated',
            }}
          >
            <svg viewBox="0 0 5 5" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              {/* Retro Band-aid / Cross representing injury */}
              <rect x="1" y="2" width="3" height="1" fill={statusStyle.fill} />
              <rect x="2" y="1" width="1" height="3" fill={statusStyle.fill} />
              <rect x="2" y="2" width="1" height="1" fill={statusStyle.stroke} />
            </svg>
          </div>
        );
      }),
    )}
  </div>
);

const LegendSwatch = ({ status }: { status: InjuryStatusType }) => {
  const style = STATUS_STYLE[status];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-text-dim font-bold">
      <span className="h-4 w-4 relative flex items-center justify-center border-none" style={{ imageRendering: 'pixelated' }}>
        <svg viewBox="0 0 5 5" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="2" width="3" height="1" fill={style.fill} />
          <rect x="2" y="1" width="1" height="3" fill={style.fill} />
          <rect x="2" y="2" width="1" height="1" fill={style.stroke} />
        </svg>
      </span>
      {style.label}
    </span>
  );
};

export const DamageMap: React.FC<DamageMapProps> = ({
  injuries,
  historicRecords = [],
  bodyType = 'NORMAL',
  className = '',
}) => {
  const allInjuries = React.useMemo(() => {
    // 過去の怪我テキストから該当部位をパース
    const parsed = historicRecords.map(parseHistoricInjury).filter((i): i is Injury => i !== null);
    // 現在アクティブな怪我はそちらを優先（重複部位のHEALEDを排除するため単純に結合）
    // 簡易的にすべて結合して描画します
    return [...injuries, ...parsed];
  }, [injuries, historicRecords]);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="grid grid-cols-2 gap-4">
        <div className="scoreboard-panel p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#8ea9cb]">前面</div>
          <div className="relative aspect-[3/4] border-[2px] border-[rgba(122,148,171,0.24)] bg-[rgba(9,11,14,0.75)]">
            <BodyImageOverlay side="front" injuries={allInjuries} bodyType={bodyType} />
          </div>
        </div>
        <div className="scoreboard-panel p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#8ea9cb]">背面</div>
          <div className="relative aspect-[3/4] border-[2px] border-[rgba(122,148,171,0.24)] bg-[rgba(9,11,14,0.75)]">
            <BodyImageOverlay side="back" injuries={allInjuries} bodyType={bodyType} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 border-t-[2px] border-[rgba(255,224,176,0.12)] pt-2">
        <LegendSwatch status="ACUTE" />
        <LegendSwatch status="SUBACUTE" />
        <LegendSwatch status="CHRONIC" />
        <LegendSwatch status="HEALED" />
      </div>
    </div>
  );
};
