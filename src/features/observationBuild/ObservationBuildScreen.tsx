import React from 'react';
import { Sparkles, Eye, AlertTriangle, Coins } from 'lucide-react';
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
} from '../../logic/archive/observationBuild';
import { applyObservationBuildBias } from '../../logic/archive/applyObservationBuildBias';
import {
  spendObservationPoints,
  getObservationPointState,
} from '../../logic/persistence/observationPoints';
import type {
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

  const toggleModifier = (id: ObservationModifierId) => {
    setModifierIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const handleStart = async () => {
    if (!canStart) return;
    setIsStarting(true);
    setErrorMessage(null);
    try {
      // Spend OP first.
      if (totalCost > 0) {
        const spend = await spendObservationPoints(totalCost, 'OBSERVE_THEME');
        if (!spend.ok) {
          setErrorMessage('観測ポイントが不足しています。');
          return;
        }
      }
      if (onRefreshMeta) await onRefreshMeta();

      // Roll a base rikishi via existing scout pipeline, then apply biases.
      const draft = rollScoutDraft();
      const baseStatus = buildInitialRikishiFromDraft(draft);
      const config = buildObservationConfig(themeId, modifierIds);
      const { status: biasedStatus } = applyObservationBuildBias(baseStatus, config);

      const runOptions: SimulationRunOptions = {
        observationRuleMode: 'STANDARD',
        observationStanceId: 'PROMOTION_EXPECTATION',
        observationThemeId: themeId,
        observationModifierIds: modifierIds,
      };

      await onStart(biasedStatus, null, 'skip_to_end', runOptions);
      // Refresh OP balance after simulation start picks up its own state.
      await getObservationPointState();
      if (onRefreshMeta) await onRefreshMeta();
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className={cn(surface.panel, 'space-y-4 p-6')}>
        <div className="flex items-center gap-3">
          <Eye className="h-6 w-6 text-action" />
          <div>
            <div className={typography.kicker}>観測設計</div>
            <h2 className={cn(typography.heading, 'text-3xl text-text')}>観測ビルド</h2>
          </div>
        </div>
        <p className="text-sm text-text-dim">
          どんな相撲人生を観測したいか、テーマと追加ビルドで方向性を寄せます。
          結果は保証されません。怪我・番付環境・成長の揺らぎで期待通りに進まないことがあります。
        </p>
        <div className="flex flex-wrap items-center gap-4 border border-gold/15 bg-bg/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-gold" />
            <span className="text-xs text-text-dim">観測ポイント</span>
            <span className="text-base text-text">{opBalance}</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-action" />
            <span className="text-xs text-text-dim">生成札</span>
            <span className="text-base text-text">{tokenBalance}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-text-dim">合計コスト</span>
            <span className={cn('text-lg', insufficientOp ? 'text-red-400' : 'text-gold')}>
              {totalCost} OP
            </span>
          </div>
        </div>
      </section>

      <section className={cn(surface.panel, 'space-y-3 p-5')}>
        <h3 className={cn(typography.heading, 'text-xl text-text')}>観測テーマ</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {themes.map((theme) => {
            const active = theme.id === themeId;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => setThemeId(theme.id)}
                className={cn(
                  'flex flex-col gap-2 border px-4 py-3 text-left transition',
                  active
                    ? 'border-action bg-action/10'
                    : 'border-white/10 bg-white/[0.02] hover:border-gold/40',
                )}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-base text-text">{theme.label}</span>
                  <span className="text-sm text-gold">{theme.cost} OP</span>
                </div>
                <div className="text-xs text-text-dim">{theme.description}</div>
                <div className="text-[11px] text-amber-300/80">{theme.riskText}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className={cn(surface.panel, 'space-y-3 p-5')}>
        <h3 className={cn(typography.heading, 'text-xl text-text')}>追加ビルド</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {modifiers.map((mod) => {
            const active = modifierIds.includes(mod.id);
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => toggleModifier(mod.id)}
                className={cn(
                  'flex flex-col gap-1.5 border px-4 py-3 text-left transition',
                  active
                    ? 'border-action bg-action/10'
                    : 'border-white/10 bg-white/[0.02] hover:border-gold/40',
                )}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-base text-text">{mod.label}</span>
                  <span className={cn('text-sm', mod.cost < 0 ? 'text-emerald-400' : 'text-gold')}>
                    {mod.cost > 0 ? `+${mod.cost}` : mod.cost} OP
                  </span>
                </div>
                <div className="text-xs text-text-dim">{mod.description}</div>
                {mod.riskText ? (
                  <div className="text-[11px] text-amber-300/80">{mod.riskText}</div>
                ) : null}
                {mod.exclusiveGroup ? (
                  <div className="text-[10px] text-text-dim/70">系統: {mod.exclusiveGroup}</div>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className={cn(surface.panel, 'space-y-3 p-5')}>
        <div className="flex items-start gap-2 text-xs text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            この設定はキャリアの方向性を少し寄せるだけで、結果を保証しません。怪我、番付環境、同期、成長の揺らぎによって期待通りに進まない場合があります。
          </div>
        </div>
        {validation.errors.length > 0 ? (
          <ul className="space-y-1 text-xs text-red-300">
            {validation.errors.map((err, i) => (
              <li key={i}>・{err}</li>
            ))}
          </ul>
        ) : null}
        {errorMessage ? <div className="text-xs text-red-300">{errorMessage}</div> : null}
        {insufficientOp ? (
          <div className="text-xs text-red-300">観測ポイントが不足しています ({totalCost} OP 必要)。</div>
        ) : null}
        {insufficientToken ? (
          <div className="text-xs text-red-300">生成札が不足しています。</div>
        ) : null}
        <div className="flex items-center justify-end gap-3">
          <Button
            size="lg"
            disabled={!canStart}
            onClick={() => void handleStart()}
          >
            <Eye className="mr-2 h-4 w-4" />
            {isStarting ? '観測開始中…' : `観測を開始する (${totalCost} OP)`}
          </Button>
        </div>
      </section>
    </div>
  );
};
