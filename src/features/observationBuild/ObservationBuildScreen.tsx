import React from 'react';
import { Sparkles, Eye, Coins, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '../../shared/ui/Button';
import surface from '../../shared/styles/surface.module.css';
import typography from '../../shared/styles/typography.module.css';
import { cn } from '../../shared/lib/cn';
import {
  rollScoutDraft,
  buildInitialRikishiFromDraft,
} from '../../logic/scout/gacha';
import {
  Oyakata,
  RikishiStatus,
  SimulationRunOptions,
} from '../../logic/models';
import type { SimulationPacing } from '../simulation/store/simulationStore';
import type { ObservationPointState } from '../../logic/persistence/observationPoints';
import type { GenerationTokenState } from '../../logic/persistence/generationTokens';
import {
  listObservationThemes,
} from '../../logic/archive/observationThemes';
import {
  listObservationModifiers,
  computeBuildCost,
  validateBuild,
  buildObservationConfig,
  OBSERVATION_MODIFIERS,
} from '../../logic/archive/observationBuild';
import { OBSERVATION_THEMES } from '../../logic/archive/observationThemes';
import { applyObservationBuildBias } from '../../logic/archive/applyObservationBuildBias';
import { selectRandomEraSnapshot, toEraRunMetadata } from '../../logic/era/eraSnapshot';
import {
  spendObservationPoints,
  getObservationPointState,
} from '../../logic/persistence/observationPoints';
import type {
  ObservationModifierDefinition,
  ObservationModifierGroup,
  ObservationModifierId,
  ObservationThemeId,
} from '../../logic/archive/types';

interface ObservationBuildScreenProps {
  generationTokens: GenerationTokenState | null;
  observationPoints: ObservationPointState | null;
  onStart: (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
    initialPacing?: SimulationPacing,
    runOptions?: SimulationRunOptions,
  ) => void | Promise<void>;
  onRefreshMeta?: () => void | Promise<void>;
}

// Short, user-facing intent hint per theme. Avoids leaking numeric weights.
const THEME_INTENT_HINT: Record<ObservationThemeId, string> = {
  random: '寄せずに、そのままの揺らぎを観測する。',
  realistic: '実データ寄りに寄せる。下位止まり・短命キャリアも普通に出る。',
  featured: '素質と地力をやや上に寄せる。それでも保証はない。',
  makushita_wall: '幕下帯の停滞を観測しやすくする。十両届かないキャリア向け。',
  late_bloomer: '晩成寄りに寄せる。序盤は伸びにくく、開花前の引退もある。',
};

const THEME_DISPLAY_COPY: Record<ObservationThemeId, string> = {
  random: '特別な方向づけを置かず、力士人生の揺らぎをそのまま読む。',
  realistic: '現実寄りの厳しさを残し、下位止まりや短い一代も含めて読む。',
  featured: '注目を集めそうな入口条件に寄せる。大成は保証されない。',
  makushita_wall: '幕下前後で足踏みする一代を読みやすくする。',
  late_bloomer: '序盤の停滞から、後年の伸びが見えるかを読む。',
};

const MODIFIER_DISPLAY_COPY: Record<ObservationModifierId, { description: string; riskText?: string }> = {
  small_body: {
    description: '小兵らしい速さや技の見せ場が出やすい。大型相手には苦しい場面も残る。',
  },
  large_body: {
    description: '体の大きさを生かした圧力が読みやすい。動きの鈍さや故障は起こり得る。',
  },
  oshizumo_style: {
    description: '前に出る相撲や押し切る展開を読みやすくする。',
  },
  technical_style: {
    description: '組み合いや技で局面を変える一代を読みやすくする。',
  },
  late_growth_bias: {
    description: '序盤は伸び悩みやすいが、後半に味が出る一代を読みやすくする。',
  },
  stable_temperament: {
    description: '大きく荒れにくい一代を読みやすくする。劇的な跳ね方はやや控えめ。',
  },
  volatile_temperament: {
    description: '上振れと下振れがどちらも目立つ一代を読みやすくする。',
    riskText: '怪我・短期失速・連敗も発生しやすくなる。',
  },
  injury_risk_high: {
    description: '怪我や休場がキャリアの読みどころになりやすい。',
    riskText: '長期休場や早期引退の確率が上がる。',
  },
};

const GROUP_META: Record<ObservationModifierGroup, { label: string; hint: string }> = {
  body: { label: '体格', hint: '択一' },
  style: { label: '取り口', hint: '択一' },
  growth: { label: '成長', hint: '択一' },
  risk: { label: 'リスク傾向', hint: '複数可' },
};

const GROUP_ORDER: ObservationModifierGroup[] = ['body', 'style', 'growth', 'risk'];

export const ObservationBuildScreen: React.FC<ObservationBuildScreenProps> = ({
  generationTokens,
  observationPoints,
  onStart,
  onRefreshMeta,
}) => {
  const themes = React.useMemo(() => listObservationThemes(), []);
  const modifiers = React.useMemo(() => listObservationModifiers(), []);
  const [themeId, setThemeId] = React.useState<ObservationThemeId>('random');
  const [modifierIds, setModifierIds] = React.useState<ObservationModifierId[]>([]);
  const [isStarting, setIsStarting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const totalCost = computeBuildCost(themeId, modifierIds);
  const validation = validateBuild(themeId, modifierIds);
  const opBalance = observationPoints?.points ?? 0;
  const tokenBalance = generationTokens?.tokens ?? 0;
  const insufficientOp = totalCost > opBalance;
  const insufficientToken = tokenBalance <= 0;
  const canStart = validation.ok && !insufficientOp && !insufficientToken && !isStarting;
  const remainingOp = Math.max(0, opBalance - totalCost);

  const modifiersByGroup = React.useMemo(() => {
    const map: Record<ObservationModifierGroup, ObservationModifierDefinition[]> = {
      body: [],
      style: [],
      growth: [],
      risk: [],
    };
    for (const m of modifiers) {
      const g = m.exclusiveGroup ?? 'risk';
      map[g].push(m);
    }
    return map;
  }, [modifiers]);

  const toggleModifier = (id: ObservationModifierId) => {
    const def = OBSERVATION_MODIFIERS[id];
    setModifierIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Exclusive groups (body/style/growth): replace any existing pick in same group.
      if (def?.exclusiveGroup && def.exclusiveGroup !== 'risk') {
        const filtered = prev.filter((other) => {
          const od = OBSERVATION_MODIFIERS[other];
          return od?.exclusiveGroup !== def.exclusiveGroup;
        });
        return [...filtered, id];
      }
      return [...prev, id];
    });
  };

  const handleStart = async () => {
    if (!canStart) return;
    setIsStarting(true);
    setErrorMessage(null);
    try {
      if (totalCost > 0) {
        const spend = await spendObservationPoints(totalCost, 'OBSERVE_THEME');
        if (!spend.ok) {
          setErrorMessage('観測ポイントが不足しています。');
          return;
        }
      }
      if (onRefreshMeta) await onRefreshMeta();

      const draft = rollScoutDraft();
      const baseStatus = buildInitialRikishiFromDraft(draft);
      const config = buildObservationConfig(themeId, modifierIds);
      const { status: biasedStatus } = applyObservationBuildBias(baseStatus, config);

      const eraSnapshot = selectRandomEraSnapshot();
      const runOptions: SimulationRunOptions = {
        observationRuleMode: 'STANDARD',
        observationStanceId: 'PROMOTION_EXPECTATION',
        observationThemeId: themeId,
        observationModifierIds: modifierIds,
        ...toEraRunMetadata(eraSnapshot),
      };

      await onStart(biasedStatus, null, 'skip_to_end', runOptions);
      await getObservationPointState();
      if (onRefreshMeta) await onRefreshMeta();
    } finally {
      setIsStarting(false);
    }
  };

  const selectedTheme = OBSERVATION_THEMES[themeId];
  const selectedModifiers = modifierIds
    .map((id) => OBSERVATION_MODIFIERS[id])
    .filter(Boolean);

  const insufficientReason: string | null = (() => {
    if (insufficientToken) return `生成札が足りません (現在 ${tokenBalance})。`;
    if (insufficientOp) return `観測ポイントが足りません (あと ${totalCost - opBalance} OP 必要)。`;
    if (validation.errors.length > 0) return '選べない組み合わせが含まれています。選択を見直してください。';
    return null;
  })();

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-32">
      {/* Header */}
      <section className={cn(surface.panel, 'space-y-4 p-6')}>
        <div className="flex items-center gap-3">
          <Eye className="h-6 w-6 text-action" />
          <div>
            <div className={typography.kicker}>観測設計</div>
            <h2 className={cn(typography.heading, 'text-3xl text-text')}>どんな相撲人生を観測しますか</h2>
          </div>
        </div>

        <div className="grid gap-2 border-l-2 border-amber-300/30 bg-amber-300/[0.04] px-4 py-3 text-xs text-amber-100/85">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 select-none text-amber-200/80">・</span>
            <span>テーマと読み口の調整は、キャリアの傾向を少し寄せるだけです。</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 select-none text-amber-200/80">・</span>
            <span>番付環境・怪我・成長の揺らぎで、思った通りには進みません。</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 select-none text-amber-200/80">・</span>
            <span>思い通りにならないキャリアも、資料館の一部になります。</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border border-gold/15 bg-bg/20 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-gold" />
            <span className="text-xs text-text-dim">観測ポイント</span>
            <span className="text-text">{opBalance}</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-action" />
            <span className="text-xs text-text-dim">生成札</span>
            <span className="text-text">{tokenBalance}</span>
          </div>
        </div>
      </section>

      {/* Themes */}
      <section className={cn(surface.panel, 'space-y-3 p-5')}>
        <div className="flex items-baseline justify-between">
          <h3 className={cn(typography.heading, 'text-xl text-text')}>観測テーマ</h3>
          <div className="text-[11px] text-text-dim">迷ったら 0 OP の「完全ランダム」から。</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {themes.map((theme) => {
            const active = theme.id === themeId;
            const intent = THEME_INTENT_HINT[theme.id];
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => setThemeId(theme.id)}
                className={cn(
                  'group relative flex flex-col gap-2 border px-4 py-4 text-left transition',
                  active
                    ? 'border-action bg-action/15 shadow-[0_0_0_1px_rgba(255,159,64,0.35)]'
                    : 'border-white/10 bg-white/[0.02] hover:border-gold/40',
                )}
              >
                {active ? (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 border border-action/60 bg-action/20 px-1.5 py-0.5 text-[10px] tracking-wider text-action">
                    <CheckCircle2 className="h-3 w-3" />
                    選択中
                  </span>
                ) : null}
                <div className="flex items-baseline gap-2 pr-16">
                  <span className={cn('text-lg', active ? 'text-text' : 'text-text/90')}>{theme.label}</span>
                  <span className={cn('ml-auto text-sm', active ? 'text-gold' : 'text-gold/80')}>
                    {theme.cost === 0 ? '無料' : `${theme.cost} OP`}
                  </span>
                </div>
                <div className="text-xs text-text-dim leading-relaxed">{THEME_DISPLAY_COPY[theme.id]}</div>
                {intent ? (
                  <div className="text-[11px] text-action/80 leading-relaxed">→ {intent}</div>
                ) : null}
                <div className="text-[11px] text-amber-300/70">{theme.riskText}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Modifiers grouped */}
      <section className={cn(surface.panel, 'space-y-5 p-5')}>
        <div className="flex items-baseline justify-between">
          <h3 className={cn(typography.heading, 'text-xl text-text')}>読み口の調整</h3>
          <div className="text-[11px] text-text-dim">体格・取り口・成長は択一、リスクは複数可。</div>
        </div>

        {GROUP_ORDER.map((group) => {
          const list = modifiersByGroup[group];
          if (!list || list.length === 0) return null;
          const meta = GROUP_META[group];
          return (
            <div key={group} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className={cn(typography.label, 'text-[10px] tracking-[0.3em] text-text-dim uppercase')}>
                  {meta.label}
                </span>
                <span className="text-[10px] text-text-dim/70">({meta.hint})</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((mod) => {
                  const active = modifierIds.includes(mod.id);
                  const isDiscount = mod.cost < 0;
                  const displayCopy = MODIFIER_DISPLAY_COPY[mod.id];
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => toggleModifier(mod.id)}
                      className={cn(
                        'flex flex-col gap-1.5 border px-4 py-3 text-left transition',
                        active
                          ? 'border-action bg-action/12 shadow-[0_0_0_1px_rgba(255,159,64,0.3)]'
                          : 'border-white/10 bg-white/[0.02] hover:border-gold/40',
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm text-text">{mod.label}</span>
                        <div className="flex items-center gap-1.5">
                          {isDiscount ? (
                            <span className="border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] tracking-wider text-emerald-300">
                              割引
                            </span>
                          ) : null}
                          {mod.riskText ? (
                            <span className="border border-amber-300/40 bg-amber-300/10 px-1.5 py-0.5 text-[9px] tracking-wider text-amber-200">
                              リスク
                            </span>
                          ) : null}
                          <span className={cn('text-xs', isDiscount ? 'text-emerald-400' : 'text-gold')}>
                            {mod.cost > 0 ? `+${mod.cost}` : mod.cost} OP
                          </span>
                        </div>
                      </div>
                      <div className="text-[11px] text-text-dim leading-relaxed">{displayCopy.description}</div>
                      {displayCopy.riskText ? (
                        <div className="text-[10px] text-amber-300/70">{displayCopy.riskText}</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* Validation errors (if any) */}
      {validation.errors.length > 0 ? (
        <section className={cn(surface.panel, 'p-4')}>
          <ul className="space-y-1 text-xs text-red-300">
            {validation.errors.map((err, i) => (
              <li key={`${err}-${i}`} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>選べない組み合わせが含まれています。選択を見直してください。</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {errorMessage ? (
        <section className={cn(surface.panel, 'p-4 text-xs text-red-300')}>{errorMessage}</section>
      ) : null}

      {/* Sticky bottom summary */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-bg/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex flex-1 flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-text-dim">あなたの観測:</span>
            {selectedTheme ? (
              <span className="border border-action/40 bg-action/10 px-2 py-0.5 text-text">
                {selectedTheme.label}
              </span>
            ) : null}
            {selectedModifiers.map((mod) => (
              <span
                key={mod.id}
                className="border border-white/15 bg-white/[0.03] px-2 py-0.5 text-text-dim"
              >
                {mod.label}
              </span>
            ))}
            {selectedModifiers.length === 0 ? (
              <span className="text-text-dim/60">読み口の調整なし</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <div>
              <span className="text-text-dim">消費</span>{' '}
              <span className={cn(insufficientOp ? 'text-red-400' : 'text-gold')}>{totalCost} OP</span>
            </div>
            <div>
              <span className="text-text-dim">観測後</span>{' '}
              <span className="text-text">{remainingOp} OP</span>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-1 sm:items-end">
            <Button size="lg" disabled={!canStart} onClick={() => void handleStart()}>
              <Eye className="mr-2 h-4 w-4" />
              {isStarting ? '観測開始中…' : `観測を開始 (${totalCost} OP)`}
            </Button>
            {!canStart && insufficientReason ? (
              <div className="text-[11px] text-red-300">{insufficientReason}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
