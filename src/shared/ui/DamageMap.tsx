import React from 'react';
import { Injury, InjuryType, BodyType } from '../../logic/models';

type Point = { x: number; y: number };

interface DamageMapProps {
    injuries: Injury[];
    bodyType?: BodyType;
    className?: string;
}

type ViewConfig = {
    src: string;
    w: number;
    h: number;
    adjustY?: number; // ▼ 上下のズレ微調整（プラスでキャラが上に、マイナスで下に移動）
    adjustScale?: number; // ▼ 拡大縮小（1.0が基本。1.1で少し拡大、0.9で少し縮小）
    coords: Partial<Record<InjuryType, Point[]>>;
};

// ==========================================
// 体格別の画像・マーカー座標定義 (前面/背面)
// ==========================================
// それぞれの画像サイズ(w, h)に基づく絶対X, Y座標を定義しています。
// ズレがある場合はここの array 内の {x, y} を微調整してください。
// [0] がキャラクターの右側 (画面左), [1] がキャラクターの左側 (画面右)
// ==========================================

const BODY_TYPE_VIEWS: Record<BodyType, { front: ViewConfig; back: ViewConfig }> = {
    NORMAL: {
        front: {
            src: '/assets/nomal.PNG', w: 745, h: 1359,
            coords: {
                NECK: [{ x: 372, y: 300 }],
                SHOULDER: [{ x: 260, y: 350 }, { x: 500, y: 350 }],
                ELBOW: [{ x: 190, y: 510 }, { x: 554, y: 510 }],
                WRIST: [{ x: 105, y: 630 }, { x: 650, y: 630 }],
                RIB: [{ x: 300, y: 475 }, { x: 450, y: 475 }],
                HIP: [{ x: 300, y: 720 }, { x: 450, y: 720 }],
                KNEE: [{ x: 250, y: 930 }, { x: 490, y: 930 }],
                ANKLE: [{ x: 280, y: 1250 }, { x: 464, y: 1250 }],
            },
        },
        back: {
            src: '/assets/nomal_back.PNG', w: 277, h: 481,
            adjustY: -8, // ▼ 上下のズレ微調整
            adjustScale: 1.00, // ▼ 拡大縮小（正面より少し小さくする）
            coords: {
                NECK: [{ x: 140, y: 95 }],
                SHOULDER: [{ x: 90, y: 95 }, { x: 186, y: 95 }],
                BACK: [{ x: 140, y: 190 }],
                HIP: [{ x: 100, y: 240 }, { x: 176, y: 240 }],
                HAMSTRING: [{ x: 110, y: 310 }, { x: 170, y: 310 }],
                ELBOW: [{ x: 60, y: 195 }, { x: 220, y: 195 }],
                WRIST: [{ x: 40, y: 260 }, { x: 236, y: 260 }],
                KNEE: [{ x: 105, y: 360 }, { x: 171, y: 360 }],
                ANKLE: [{ x: 90, y: 440 }, { x: 192, y: 440 }],
            },
        }
    },
    SOPPU: {
        front: {
            src: '/assets/soep.PNG', w: 614, h: 1290,
            coords: {
                NECK: [{ x: 307, y: 95 }],
                SHOULDER: [{ x: 190, y: 340 }, { x: 420, y: 340 }],
                ELBOW: [{ x: 140, y: 580 }, { x: 475, y: 580 }],
                WRIST: [{ x: 75, y: 680 }, { x: 530, y: 680 }],
                RIB: [{ x: 250, y: 430 }, { x: 360, y: 430 }],
                HIP: [{ x: 230, y: 730 }, { x: 370, y: 730 }],
                KNEE: [{ x: 195, y: 930 }, { x: 410, y: 930 }],
                ANKLE: [{ x: 230, y: 1200 }, { x: 384, y: 1200 }],
            },
        },
        back: {
            src: '/assets/soep_back.PNG', w: 234, h: 482,
            adjustY: -30,  // ▼ 上下移動
            adjustScale: 1.14, // ▼ 拡大縮小
            coords: {
                NECK: [{ x: 117, y: 115 }],
                SHOULDER: [{ x: 70, y: 95 }, { x: 164, y: 95 }],
                BACK: [{ x: 117, y: 200 }],
                HIP: [{ x: 85, y: 240 }, { x: 149, y: 240 }],
                HAMSTRING: [{ x: 90, y: 310 }, { x: 145, y: 310 }],
                ELBOW: [{ x: 50, y: 210 }, { x: 185, y: 210 }],
                WRIST: [{ x: 30, y: 260 }, { x: 204, y: 260 }],
                KNEE: [{ x: 90, y: 360 }, { x: 144, y: 360 }],
                ANKLE: [{ x: 77, y: 420 }, { x: 160, y: 420 }],
            },
        }
    },
    ANKO: {
        front: {
            src: '/assets/anko.PNG', w: 687, h: 1281,
            coords: {
                NECK: [{ x: 343, y: 160 }],
                SHOULDER: [{ x: 200, y: 330 }, { x: 486, y: 330 }],
                ELBOW: [{ x: 150, y: 560 }, { x: 536, y: 560 }],
                WRIST: [{ x: 80, y: 660 }, { x: 620, y: 660 }],
                RIB: [{ x: 270, y: 430 }, { x: 416, y: 430 }],
                HIP: [{ x: 250, y: 740 }, { x: 450, y: 740 }],
                KNEE: [{ x: 195, y: 950 }, { x: 500, y: 950 }],
                ANKLE: [{ x: 250, y: 1180 }, { x: 466, y: 1180 }],
            },
        },
        back: {
            src: '/assets/anko_back.PNG', w: 271, h: 481,
            adjustY: -5, // ▼ 上下移動
            adjustScale: 1.05, // ▼ 拡大縮小
            coords: {
                NECK: [{ x: 133, y: 90 }],
                SHOULDER: [{ x: 80, y: 100 }, { x: 190, y: 100 }],
                BACK: [{ x: 133, y: 190 }],
                HIP: [{ x: 90, y: 250 }, { x: 180, y: 250 }],
                HAMSTRING: [{ x: 95, y: 310 }, { x: 170, y: 310 }],
                ELBOW: [{ x: 43, y: 190 }, { x: 220, y: 190 }],
                WRIST: [{ x: 40, y: 270 }, { x: 230, y: 270 }],
                KNEE: [{ x: 100, y: 360 }, { x: 170, y: 360 }],
                ANKLE: [{ x: 75, y: 430 }, { x: 195, y: 430 }],
            },
        }
    },
    MUSCULAR: {
        front: {
            src: '/assets/muscle.PNG', w: 682, h: 1281,
            coords: {
                NECK: [{ x: 341, y: 150 }],
                SHOULDER: [{ x: 210, y: 340 }, { x: 490, y: 340 }],
                ELBOW: [{ x: 140, y: 550 }, { x: 542, y: 550 }],
                WRIST: [{ x: 70, y: 720 }, { x: 610, y: 720 }],
                RIB: [{ x: 270, y: 440 }, { x: 420, y: 440 }],
                HIP: [{ x: 250, y: 750 }, { x: 420, y: 750 }],
                KNEE: [{ x: 200, y: 960 }, { x: 470, y: 960 }],
                ANKLE: [{ x: 250, y: 1180 }, { x: 432, y: 1180 }],
            },
        },
        back: {
            src: '/assets/muscle_back.PNG', w: 261, h: 451,
            adjustY: -20, // ▼ 上下移動
            adjustScale: 1.08, // ▼ 拡大縮小
            coords: {
                NECK: [{ x: 130, y: 90 }],
                SHOULDER: [{ x: 80, y: 90 }, { x: 180, y: 90 }],
                BACK: [{ x: 130, y: 180 }],
                HIP: [{ x: 90, y: 230 }, { x: 170, y: 230 }],
                HAMSTRING: [{ x: 95, y: 310 }, { x: 165, y: 310 }],
                ELBOW: [{ x: 35, y: 200 }, { x: 220, y: 200 }],
                WRIST: [{ x: 30, y: 250 }, { x: 230, y: 250 }],
                KNEE: [{ x: 100, y: 340 }, { x: 160, y: 340 }],
                ANKLE: [{ x: 80, y: 420 }, { x: 182, y: 420 }],
            },
        }
    },
};

/**
 * 背面(後)に表示すべき疾患タイプ
 */
const BACK_INJURIES = new Set<InjuryType>(['BACK', 'ELBOW', 'HAMSTRING', 'NECK', 'ANKLE']);

export const DamageMap: React.FC<DamageMapProps> = ({
    injuries,
    bodyType = 'NORMAL',
    className = ''
}) => {

    const viewData = BODY_TYPE_VIEWS[bodyType] || BODY_TYPE_VIEWS['NORMAL'];

    // フロント/バックで描画するマーカーを生成
    const renderInjuryOverlays = (config: ViewConfig, isBack: boolean) => {
        return injuries.map((injury, index) => {
            // 描画面の割り当て判定 (背面の怪我は isBack=true のみ、前面は false のみ)
            const isBackTarget = BACK_INJURIES.has(injury.type);
            if (isBack !== isBackTarget) return null;

            const allPoints = config.coords[injury.type];
            if (!allPoints || allPoints.length === 0) return null;

            // 怪我の名前から「右」「左」を判定して、表示するポイントを絞り込み
            let points = allPoints;
            if (allPoints.length === 2) {
                // バック（背面）視点の場合は、画面左＝キャラ左、画面右＝キャラ右 となるので左右逆転する
                const leftSideIdx = isBack ? 0 : 1;
                const rightSideIdx = isBack ? 1 : 0;

                if (injury.name.includes('右')) {
                    points = [allPoints[rightSideIdx]];
                } else if (injury.name.includes('左')) {
                    points = [allPoints[leftSideIdx]];
                }
            }

            const isChronic = injury.status === 'CHRONIC';
            const isHealed = injury.status === 'HEALED';
            const dotColor = isHealed ? '#64748b' : '#ef4444';
            const pulseClass = (isChronic && !isHealed) ? 'animate-pulse' : '';

            // 画像スケールに合わせたマーカーの大きさ調整用比率 (元の200幅ベースからスケーリング)
            const rScale = config.w / 200;

            return (
                <g key={`overlay-${injury.id}-${index}`} className={pulseClass}>
                    {points.map((p, idx) => (
                        <g key={`marker-${injury.id}-${idx}`}>
                            <circle cx={p.x} cy={p.y} r={4 * rScale} fill={dotColor} />
                            {!isHealed && (
                                <circle cx={p.x} cy={p.y} r={(4 + injury.severity * 1.5) * rScale} fill={dotColor} fillOpacity="0.3" filter="url(#glow)" />
                            )}
                            <circle cx={p.x} cy={p.y} r={1.5 * rScale} fill="#ffffff" />
                        </g>
                    ))}
                </g>
            );
        });
    };

    const renderPanel = (config: ViewConfig, isBack: boolean) => {
        // adjustScaleを使ってズーム機能を実現。1.0で等倍。1.2にするとキャラが1.2倍に大きくなる
        const scale = config.adjustScale || 1.0;
        const viewW = config.w / scale;
        const viewH = config.h / scale;

        // ズーム時に横が中心になるようにX起点をシフト
        const viewX = (config.w - viewW) / 2;
        // Y軸のズレ（マイナスならキャラが下がる、プラスならキャラが上がる）
        const viewY = config.adjustY ? -config.adjustY : 0;

        const viewBox = `${viewX} ${viewY} ${viewW} ${viewH}`;

        return (
            <div className="relative">
                <svg
                    viewBox={viewBox}
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-full drop-shadow-md"
                >
                    <defs>
                        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                    </defs>

                    <image
                        href={config.src}
                        x="0"
                        y="0"
                        width={config.w}
                        height={config.h}
                        preserveAspectRatio="xMidYMid meet"
                        opacity="1"
                        style={{ filter: 'drop-shadow(0px 0px 8px rgba(239, 68, 68, 0.25))' }}
                    />

                    {renderInjuryOverlays(config, isBack)}
                </svg>
            </div>
        );
    };

    return (
        <div className={`grid grid-cols-2 gap-4 ${className}`}>
            {/* 左: 正面 */}
            {renderPanel(viewData.front, false)}
            {/* 右: 背面 */}
            {renderPanel(viewData.back, true)}
        </div>
    );
};
