import React, { useMemo } from 'react';
import { Injury, InjuryType } from '../../logic/models';

type Point = { x: number; y: number };

interface DamageMapProps {
    injuries: Injury[];
    heightCm?: number; // 未使用ですが互換性のため残す
    weightKg?: number; // 未使用ですが互換性のため残す
    className?: string; // コンテナのスタイリング用
}

/**
 * 力士の生涯の怪我履歴を詳細に視覚化するメディカル・ダメージマップ
 */
export const DamageMap: React.FC<DamageMapProps> = ({
    injuries,
    className = ''
}) => {
    // 画像の実際のサイズに合わせたViewBox
    // これにより無駄な余白がなくなり、座標指定が正確になります
    const VIEWBOX_W = 290;
    const VIEWBOX_H = 339;

    // --- 1. 画像に対する関節座標（ViewBox 290x339 に対する絶対座標） ---
    const injuryLocations: Record<InjuryType, Point[]> = useMemo(() => {
        // 画像の中心 X 座標
        const cx = 145;

        // 左右がある部位は [右側(画面左), 左側(画面右)] の順で定義する
        return {
            NECK: [{ x: cx, y: 70 }],                   // 首
            SHOULDER: [{ x: 100, y: 85 }, { x: 190, y: 85 }],  // 肩
            ELBOW: [{ x: 85, y: 125 }, { x: 205, y: 125 }],    // 肘
            WRIST: [{ x: 55, y: 165 }, { x: 235, y: 165 }],    // 手首
            RIB: [{ x: 115, y: 130 }, { x: 175, y: 130 }],     // 肋骨
            BACK: [{ x: cx, y: 120 }],                  // 背中
            HIP: [{ x: 110, y: 175 }, { x: 180, y: 175 }],     // 腰
            HAMSTRING: [{ x: 120, y: 210 }, { x: 170, y: 210 }], // 太もも裏
            KNEE: [{ x: 120, y: 255 }, { x: 170, y: 255 }],    // 膝
            ANKLE: [{ x: 120, y: 300 }, { x: 170, y: 300 }],   // 足首
        };
    }, []);

    // 怪我ごとに円（染み）を描画する処理
    const renderInjuryOverlays = () => {
        return injuries.map((injury, index) => {
            const allPoints = injuryLocations[injury.type];
            if (!allPoints || allPoints.length === 0) return null;

            // 怪我の名前から「右」「左」を判定して、表示するポイントを絞り込む
            // [0] がキャラクターの右側 (画面左), [1] がキャラクターの左側 (画面右)
            let points = allPoints;
            if (allPoints.length === 2) {
                if (injury.name.includes('右')) {
                    points = [allPoints[0]]; // 右側のみ
                } else if (injury.name.includes('左')) {
                    points = [allPoints[1]]; // 左側のみ
                }
            }

            const isChronic = injury.status === 'CHRONIC';
            const isHealed = injury.status === 'HEALED';

            const dotColor = isHealed ? '#64748b' : '#ef4444'; // healed: slate-500, active: red-500
            const pulseClass = (isChronic && !isHealed) ? 'animate-pulse' : '';

            return (
                <g key={`overlay-${injury.id}-${index}`} className={pulseClass}>
                    {/* 画像上のポイントマーカー */}
                    {points.map((p, idx) => (
                        <g key={`marker-${injury.id}-${idx}`}>
                            <circle cx={p.x} cy={p.y} r="4" fill={dotColor} />
                            {/* アクティブな怪我にはぼんやりしたオーラ */}
                            {!isHealed && (
                                <circle cx={p.x} cy={p.y} r={4 + injury.severity * 1.5} fill={dotColor} fillOpacity="0.3" filter="url(#glow)" />
                            )}
                            {/* 正確なポイント */}
                            <circle cx={p.x} cy={p.y} r="1.5" fill="#ffffff" />
                        </g>
                    ))}
                </g>
            );
        });
    };

    return (
        <div className={`relative ${className}`}>
            {/* SVGキャンバス */}
            <svg
                viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full drop-shadow-md"
            >
                <defs>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                {/* --- 背景画像 --- */}
                {/* 透過画像が背景(黒系)に沈まないよう、かすかなシャドウ効果を入れる */}
                <image
                    href="/assets/damage-base-body.png"
                    x="0"
                    y="0"
                    width={VIEWBOX_W}
                    height={VIEWBOX_H}
                    preserveAspectRatio="xMidYMid meet"
                    opacity="1"
                    style={{ filter: 'drop-shadow(0px 0px 8px rgba(239, 68, 68, 0.25))' }}
                />

                {/* --- ダメージオーバーレイ --- */}
                {renderInjuryOverlays()}
            </svg>
        </div>
    );
};
