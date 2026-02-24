import React, { useEffect, useMemo, useState } from "react";
import { Oyakata, RikishiStatus, BodyType, EntryDivision, PersonalityType, Trait } from "../../../logic/models";
import { CONSTANTS } from "../../../logic/constants";
import {
  buildInitialRikishiFromDraft,
  PERSONALITY_LABELS,
  resizeTraitSlots,
  selectTraitForSlot,
  resolveTraitSlotCost,
  rollBodyMetricsForBodyType,
  rollScoutDraft,
  SCOUT_COST,
  SCOUT_HISTORY_OPTIONS,
  ScoutDraft,
  ScoutHistory,
  resolveScoutOverrideCost,
} from "../../../logic/scout/gacha";
import { getWalletState, spendWalletPoints, WalletState } from "../../../logic/persistence/wallet";
import { useSimulationStore } from "../../../features/simulation/store/simulationStore";
import type { SimulationSpeed } from "../../../features/simulation/store/simulationStore";
import { Button } from "../../../shared/ui/Button";
import { RefreshCw, Trophy, Coins, ChevronDown, User, Dna, Zap } from "lucide-react";

interface ScoutScreenProps {
  onStart: (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
  ) => void | Promise<void>;
}

// Manual testing mode: wallet points are not consumed in scout flow.
const SCOUT_FREE_SPEND_FOR_MANUAL_TEST = true;

const formatCountdown = (seconds: number): string => {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const traitName = (id: string): string => CONSTANTS.TRAIT_DATA[id as keyof typeof CONSTANTS.TRAIT_DATA]?.name ?? id;

// --- 共通スタイル定数 ---
const LABEL_CLASS = "text-xs font-pixel text-gold";
const INPUT_CLASS = "w-full border-2 border-gold-muted bg-bg px-3 py-2.5 text-text text-sm focus:border-gold focus:ring-1 focus:ring-gold/30 transition-all";
const SELECT_CLASS = `${INPUT_CLASS} appearance-none cursor-pointer`;

export const ScoutScreen: React.FC<ScoutScreenProps> = ({ onStart }) => {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [baseDraft, setBaseDraft] = useState<ScoutDraft | null>(null);
  const [editedDraft, setEditedDraft] = useState<ScoutDraft | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  // 演算モード
  const simulationSpeed = useSimulationStore((s) => s.simulationSpeed);
  const setSimulationSpeed = useSimulationStore((s) => s.setSimulationSpeed);

  useEffect(() => {
    let active = true;
    const refreshWallet = async () => {
      const next = await getWalletState();
      if (active) setWallet(next);
    };

    void refreshWallet();
    const timerId = setInterval(() => {
      void refreshWallet();
    }, 1000);

    return () => {
      active = false;
      clearInterval(timerId);
    };
  }, []);

  const overrideCost = useMemo(() => {
    if (!baseDraft || !editedDraft) {
      return {
        total: 0,
        breakdown: {
          shikona: 0, realName: 0, birthplace: 0, personality: 0,
          bodyType: 0, traitSlots: 0, history: 0, tsukedashi: 0, genome: 0,
        },
      };
    }
    return resolveScoutOverrideCost(baseDraft, editedDraft);
  }, [baseDraft, editedDraft]);

  const canDraw = Boolean(
    wallet &&
      (SCOUT_FREE_SPEND_FOR_MANUAL_TEST || wallet.points >= SCOUT_COST.DRAW) &&
      !isDrawing &&
      !isRegistering,
  );

  const handleDraw = async () => {
    setErrorMessage("");
    setIsDrawing(true);
    try {
      const spent = await spendWalletPoints(
        SCOUT_FREE_SPEND_FOR_MANUAL_TEST ? 0 : SCOUT_COST.DRAW,
      );
      setWallet(spent.state);
      if (!spent.ok) {
        setErrorMessage(`ポイント不足です（必要: ${SCOUT_COST.DRAW}pt）`);
        return;
      }
      const draft = rollScoutDraft();
      setBaseDraft(draft);
      setEditedDraft(draft);
    } finally {
      setIsDrawing(false);
    }
  };

  const handleHistoryChange = (history: ScoutHistory) => {
    setEditedDraft((prev) => {
      if (!prev) return prev;
      const historyData = SCOUT_HISTORY_OPTIONS[history];
      const nextEntryDivision: EntryDivision = historyData.canTsukedashi ? prev.entryDivision : "Maezumo";
      return { ...prev, history, entryDivision: nextEntryDivision };
    });
  };

  const handleBodyTypeChange = (bodyType: BodyType) => {
    setEditedDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, bodyType, bodyMetrics: rollBodyMetricsForBodyType(bodyType) };
    });
  };

  const handleTraitSlotsChange = (slots: number) => {
    setEditedDraft((prev) => {
      if (!prev) return prev;
      return resizeTraitSlots(prev, slots);
    });
  };

  const handleTraitSelection = (slotIndex: number, trait: Trait) => {
    setEditedDraft((prev) => {
      if (!prev) return prev;
      return selectTraitForSlot(prev, slotIndex, trait);
    });
  };

  const handleRegister = async () => {
    if (!editedDraft) return;
    setErrorMessage("");
    setIsRegistering(true);
    try {
      const spent = await spendWalletPoints(
        SCOUT_FREE_SPEND_FOR_MANUAL_TEST ? 0 : overrideCost.total,
      );
      setWallet(spent.state);
      if (!spent.ok) {
        setErrorMessage(`ポイント不足です（必要: ${overrideCost.total}pt）`);
        return;
      }
      const initialStats = buildInitialRikishiFromDraft(editedDraft);
      await onStart(initialStats, null);
    } finally {
      setIsRegistering(false);
    }
  };

  const historyData = editedDraft ? SCOUT_HISTORY_OPTIONS[editedDraft.history] : undefined;
  const activeTraitSlotDrafts = editedDraft
    ? [...editedDraft.traitSlotDrafts]
        .filter((slot) => slot.slotIndex < editedDraft.traitSlots)
        .sort((a, b) => a.slotIndex - b.slotIndex)
    : [];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* === ウェルカムヒーロー（抽選前のみ） === */}
      {!editedDraft && (
        <div className="rpg-panel p-5 sm:p-8 text-center animate-in">
          <p className="text-xs font-pixel tracking-[0.2em] text-gold mb-3">
            人生放置型・履歴書作成ゲーム
          </p>
          <h2 className="text-2xl sm:text-4xl font-pixel text-gold-bright mb-4 tracking-tight">
            新弟子の運命を<br className="sm:hidden" />デザインせよ
          </h2>
          <p className="text-xs sm:text-sm text-text-dim max-w-lg mx-auto leading-relaxed mb-6">
            あなたは相撲部屋の親方。新弟子の才能をデザインし、ボタン一つで入門から引退までの
            力士人生をシミュレーション。生涯成績やドラマを「力士履歴書」としてコレクションしよう。
          </p>

          {/* ウォレット */}
          <div className="inline-flex items-center gap-3 border-2 border-gold-muted bg-bg px-4 py-2.5 mb-6">
            <Coins className="w-4 h-4 sm:w-5 sm:h-5 text-gold" />
            <span className="text-base sm:text-lg font-pixel text-gold">{wallet?.points ?? "..."}</span>
            <span className="text-xs text-text-dim">/ {wallet?.cap ?? 500}</span>
            <span className="text-xs text-text-dim border-l-2 border-gold-muted pl-3">
              回復 {wallet ? formatCountdown(wallet.nextRegenInSec) : "--:--"}
            </span>
          </div>

          <div>
            <Button
              size="lg"
              onClick={handleDraw}
              disabled={!canDraw}
              className="w-full sm:w-auto sm:min-w-[280px]"
            >
              <RefreshCw className={`w-5 h-5 mr-2 ${isDrawing ? "animate-spin" : ""}`} />
              {isDrawing ? "抽選中..." : `新弟子を抽選 (-${SCOUT_COST.DRAW}pt)`}
            </Button>
          </div>

          {errorMessage && (
            <p className="mt-4 text-xs font-pixel text-crimson border-2 border-crimson/30 p-2 bg-crimson-dim/10 inline-block">
              {errorMessage}
            </p>
          )}
        </div>
      )}

      {/* === 抽選後: レイアウト === */}
      {editedDraft && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,340px] gap-4 animate-in">
          {/* 左パネル: スカウト管理局 */}
          <section className="rpg-panel p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="section-header">
                <span className="w-1 h-4 bg-gold inline-block" />
                スカウト管理局
              </h2>
              <div className="flex items-center gap-2 text-xs">
                <Coins className="w-3.5 h-3.5 text-gold" />
                <span className="font-pixel text-gold">{wallet?.points ?? "..."}</span>
                <span className="text-text-dim">/ {wallet?.cap ?? 500}</span>
              </div>
            </div>

            {/* 再抽選ボタン */}
            <Button
              onClick={handleDraw}
              disabled={!canDraw}
              className="w-full py-3"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isDrawing ? "animate-spin" : ""}`} />
              {isDrawing ? "抽選中..." : `新弟子を再抽選 (-${SCOUT_COST.DRAW}pt)`}
            </Button>

            {errorMessage && (
              <p className="text-xs font-pixel text-crimson border-2 border-crimson/30 p-2 bg-crimson-dim/10">{errorMessage}</p>
            )}

            {/* === フォーム === */}
            <div className="space-y-3">
              {/* 四股名 */}
              <div className="space-y-1.5">
                <label className={LABEL_CLASS}>四股名（変更 +{SCOUT_COST.SHIKONA}pt）</label>
                <input
                  value={editedDraft.shikona}
                  onChange={(e) =>
                    setEditedDraft((prev) => (prev ? { ...prev, shikona: e.target.value } : prev))
                  }
                  className={`${INPUT_CLASS} font-pixel text-base sm:text-lg text-gold`}
                />
              </div>

              {/* 本名・出身地 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className={LABEL_CLASS}>本名（+{SCOUT_COST.REAL_NAME}pt）</label>
                  <input
                    value={editedDraft.profile.realName}
                    onChange={(e) =>
                      setEditedDraft((prev) =>
                        prev ? { ...prev, profile: { ...prev.profile, realName: e.target.value } } : prev,
                      )
                    }
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={LABEL_CLASS}>出身地（+{SCOUT_COST.BIRTHPLACE}pt）</label>
                  <input
                    value={editedDraft.profile.birthplace}
                    onChange={(e) =>
                      setEditedDraft((prev) =>
                        prev ? { ...prev, profile: { ...prev.profile, birthplace: e.target.value } } : prev,
                      )
                    }
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              {/* 性格 */}
              <div className="space-y-1.5">
                <label className={LABEL_CLASS}>性格（+{SCOUT_COST.PERSONALITY}pt）</label>
                <div className="relative">
                  <select
                    value={editedDraft.profile.personality}
                    onChange={(e) =>
                      setEditedDraft((prev) =>
                        prev ? { ...prev, profile: { ...prev.profile, personality: e.target.value as PersonalityType } } : prev,
                      )
                    }
                    className={SELECT_CLASS}
                  >
                    {(Object.keys(PERSONALITY_LABELS) as PersonalityType[]).map((p) => (
                      <option key={p} value={p}>{PERSONALITY_LABELS[p]}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
                </div>
              </div>

              {/* 体格 */}
              <div className="space-y-1.5">
                <label className={LABEL_CLASS}>体格（+{SCOUT_COST.BODY_TYPE}pt）</label>
                <div className="relative">
                  <select
                    value={editedDraft.bodyType}
                    onChange={(e) => handleBodyTypeChange(e.target.value as BodyType)}
                    className={SELECT_CLASS}
                  >
                    {(Object.keys(CONSTANTS.BODY_TYPE_DATA) as BodyType[]).map((bt) => (
                      <option key={bt} value={bt}>{CONSTANTS.BODY_TYPE_DATA[bt].name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
                </div>
                <p className="text-xs text-text-dim">
                  身長 {editedDraft.bodyMetrics.heightCm}cm / 体重 {editedDraft.bodyMetrics.weightKg}kg
                </p>
              </div>

              {/* スキル枠 */}
              <div className="space-y-2">
                <label className={LABEL_CLASS}>
                  スキル枠（+{resolveTraitSlotCost(editedDraft.traitSlots)}pt）
                </label>
                <div className="relative">
                  <select
                    value={editedDraft.traitSlots}
                    onChange={(e) => handleTraitSlotsChange(Number(e.target.value))}
                    className={SELECT_CLASS}
                  >
                    {[0, 1, 2, 3, 4, 5].map((slot) => (
                      <option key={slot} value={slot}>
                        {slot} 枠 (+{resolveTraitSlotCost(slot)}pt)
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
                </div>

                {editedDraft.traitSlots === 0 ? (
                  <p className="text-xs text-text-dim border-2 border-dashed border-gold-muted p-2 bg-bg">
                    スキルは非表示中です。枠を戻すと候補と選択は復元されます。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeTraitSlotDrafts.map((slotDraft) => (
                      <div key={slotDraft.slotIndex} className="border-2 border-gold-muted p-2 bg-bg space-y-2">
                        <p className="text-xs font-pixel text-text-dim">
                          枠 {slotDraft.slotIndex + 1}
                          {slotDraft.selected ? `: ${traitName(slotDraft.selected)}` : ": 未選択"}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {slotDraft.options.map((option) => {
                            const selectedElsewhere = activeTraitSlotDrafts.some(
                              (other) => other.slotIndex !== slotDraft.slotIndex && other.selected === option,
                            );
                            const isSelected = slotDraft.selected === option;
                            return (
                              <button
                                key={`${slotDraft.slotIndex}-${option}`}
                                type="button"
                                onClick={() => handleTraitSelection(slotDraft.slotIndex, option)}
                                disabled={selectedElsewhere && !isSelected}
                                className={`text-xs px-2 py-2 border-2 text-left transition-colors ${
                                  isSelected
                                    ? "border-gold text-gold bg-gold/10"
                                    : selectedElsewhere
                                      ? "border-bg-light text-text-dim/40 bg-bg"
                                      : "border-gold-muted bg-bg text-text-dim hover:border-gold/50 hover:text-gold"
                                }`}
                              >
                                {isSelected && <span className="text-gold mr-1">▶</span>}
                                {traitName(option)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 border-2 border-gold-muted p-2 bg-bg min-h-10">
                  {editedDraft.traits.length === 0 ? (
                    <span className="text-xs text-text-dim">採用スキルなし</span>
                  ) : (
                    editedDraft.traits.map((trait) => (
                      <span key={trait} className="text-xs px-2 py-1 border-2 border-gold/40 font-pixel bg-gold/10 text-gold">
                        {traitName(trait)}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* 経歴 */}
              <div className="space-y-1.5">
                <label className={LABEL_CLASS}>経歴（+{SCOUT_COST.HISTORY}pt）</label>
                <div className="relative">
                  <select
                    value={editedDraft.history}
                    onChange={(e) => handleHistoryChange(e.target.value as ScoutHistory)}
                    className={SELECT_CLASS}
                  >
                    {(Object.keys(SCOUT_HISTORY_OPTIONS) as ScoutHistory[]).map((h) => (
                      <option key={h} value={h}>{SCOUT_HISTORY_OPTIONS[h].label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
                </div>

                {historyData?.canTsukedashi && (
                  <div className="space-y-1">
                    <label className={LABEL_CLASS}>付出指定（差分 +30/+60pt）</label>
                    <div className="relative">
                      <select
                        value={editedDraft.entryDivision}
                        onChange={(e) =>
                          setEditedDraft((prev) =>
                            prev ? { ...prev, entryDivision: e.target.value as EntryDivision } : prev,
                          )
                        }
                        className={SELECT_CLASS}
                      >
                        <option value="Maezumo">前相撲</option>
                        <option value="Makushita60">幕下最下位格 (+30pt)</option>
                        <option value="Sandanme90">三段目最下位格 (+60pt)</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>

              {/* DNA設定 */}
              <div className="space-y-2">
                <label className={LABEL_CLASS}>
                  <Dna className="w-3.5 h-3.5 inline mr-1" />
                  DNA設定（変更分コスト加算）
                </label>
                <details className="border-2 border-gold-muted bg-bg group">
                  <summary className="px-3 py-2.5 text-xs font-pixel cursor-pointer text-text-dim hover:text-gold transition-colors flex items-center gap-1">
                    <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                    DNA詳細を開く（初期能力・成長・耐久・変動）
                  </summary>
                  <div className="px-3 py-3 space-y-4 border-t-2 border-gold-muted">
                    {/* 初期能力 */}
                    <DnaSliderGroup
                      title="初期能力上限"
                      sliders={[
                        { key: 'powerCeiling', label: '筋力' },
                        { key: 'techCeiling', label: '技術' },
                        { key: 'speedCeiling', label: '速度' },
                        { key: 'ringSense', label: '土俵感覚' },
                        { key: 'styleFit', label: '戦術適性' },
                      ]}
                      values={editedDraft.genomeDraft.base as unknown as Record<string, number>}
                      onChange={(key, v) => setEditedDraft((prev) => prev ? {
                        ...prev,
                        genomeDraft: { ...prev.genomeDraft, base: { ...prev.genomeDraft.base, [key]: v } },
                      } : prev)}
                      min={0} max={100}
                    />
                    {/* 成長曲線 */}
                    <DnaSliderGroup
                      title="成長曲線"
                      sliders={[
                        { key: 'maturationAge', label: 'ピーク年齢', suffix: '歳' },
                        { key: 'peakLength', label: 'ピーク期間', suffix: '年' },
                      ]}
                      values={editedDraft.genomeDraft.growth as unknown as Record<string, number>}
                      onChange={(key, v) => setEditedDraft((prev) => prev ? {
                        ...prev,
                        genomeDraft: { ...prev.genomeDraft, growth: { ...prev.genomeDraft.growth, [key]: v } },
                      } : prev)}
                      min={key => key === 'maturationAge' ? 18 : 1}
                      max={key => key === 'maturationAge' ? 35 : 12}
                    />
                    {/* 衰退速度 */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs w-20 shrink-0 text-text-dim">衰退速度</span>
                      <input type="range" min={1} max={20} step={1}
                        value={Math.round(editedDraft.genomeDraft.growth.lateCareerDecay * 10)}
                        onChange={(e) => setEditedDraft((prev) => prev ? {
                          ...prev,
                          genomeDraft: { ...prev.genomeDraft, growth: { ...prev.genomeDraft.growth, lateCareerDecay: Number(e.target.value) / 10 } },
                        } : prev)}
                        className="flex-1 h-1.5"
                      />
                      <span className="text-xs w-10 text-right font-pixel text-gold">{editedDraft.genomeDraft.growth.lateCareerDecay.toFixed(1)}x</span>
                    </div>
                    {/* 耐久性 */}
                    <DnaSliderGroup
                      title="耐久性"
                      sliders={[
                        { key: 'baseInjuryRisk', label: '怪我リスク', scale: 10, suffix: 'x', precision: 1 },
                        { key: 'recoveryRate', label: '回復力', scale: 10, suffix: 'x', precision: 1 },
                        { key: 'chronicResistance', label: '慢性化耐性' },
                      ]}
                      values={editedDraft.genomeDraft.durability as unknown as Record<string, number>}
                      onChange={(key, v) => setEditedDraft((prev) => prev ? {
                        ...prev,
                        genomeDraft: { ...prev.genomeDraft, durability: { ...prev.genomeDraft.durability, [key]: v } },
                      } : prev)}
                      min={key => key === 'baseInjuryRisk' ? 3 : key === 'recoveryRate' ? 5 : 0}
                      max={key => key === 'chronicResistance' ? 100 : 20}
                    />
                    {/* 変動性 */}
                    <DnaSliderGroup
                      title="変動性"
                      sliders={[
                        { key: 'clutchBias', label: '勝負強さ' },
                        { key: 'formVolatility', label: '調子の振れ' },
                      ]}
                      values={editedDraft.genomeDraft.variance as unknown as Record<string, number>}
                      onChange={(key, v) => setEditedDraft((prev) => prev ? {
                        ...prev,
                        genomeDraft: { ...prev.genomeDraft, variance: { ...prev.genomeDraft.variance, [key]: v } },
                      } : prev)}
                      min={key => key === 'clutchBias' ? -50 : 0}
                      max={key => key === 'clutchBias' ? 50 : 100}
                    />
                  </div>
                </details>
              </div>
            </div>
          </section>

          {/* 右パネル: 候補サマリー */}
          <section className="rpg-panel p-4 sm:p-5 space-y-4 lg:sticky lg:top-16 lg:self-start">
            <h2 className="section-header">
              <User className="w-4 h-4 sm:w-5 sm:h-5" />
              候補プロフィール
            </h2>

            {/* 四股名ヒーロー */}
            <div className="text-center py-3 border-b-2 border-gold-muted">
              <p className="text-2xl sm:text-3xl font-pixel text-gold tracking-wider">
                {editedDraft.shikona}
              </p>
              <p className="text-xs text-text-dim mt-1">
                {CONSTANTS.TALENT_ARCHETYPES[editedDraft.archetype].name}
              </p>
            </div>

            {/* 基本情報 */}
            <div className="space-y-1 text-xs">
              {[
                ["本名", editedDraft.profile.realName || "(未設定)"],
                ["出身地", editedDraft.profile.birthplace || "(未設定)"],
                ["性格", PERSONALITY_LABELS[editedDraft.profile.personality]],
                ["経歴", SCOUT_HISTORY_OPTIONS[editedDraft.history].label],
                ["体格", `${CONSTANTS.BODY_TYPE_DATA[editedDraft.bodyType].name} (${editedDraft.bodyMetrics.heightCm}cm / ${editedDraft.bodyMetrics.weightKg}kg)`],
                ["戦術", editedDraft.tactics],
                ["得意技", editedDraft.signatureMove],
                ["ピーク", `${Math.round(editedDraft.genomeDraft.growth.maturationAge)}歳 (${Math.round(editedDraft.genomeDraft.growth.peakLength)}年間)`],
              ].map(([key, val]) => (
                <div key={key} className="data-row">
                  <span className="data-key">{key}</span>
                  <span className="data-val">{val}</span>
                </div>
              ))}
            </div>

            {/* コスト内訳 */}
            <div className="border-t-2 border-gold-muted pt-3 space-y-1">
              <p className="text-xs font-pixel text-gold mb-2">
                <Zap className="w-3.5 h-3.5 inline mr-1" />
                上書きコスト
              </p>
              <div className="space-y-0.5 text-xs">
                {[
                  ["四股名", overrideCost.breakdown.shikona],
                  ["本名", overrideCost.breakdown.realName],
                  ["出身地", overrideCost.breakdown.birthplace],
                  ["性格", overrideCost.breakdown.personality],
                  ["体格", overrideCost.breakdown.bodyType],
                  ["スキル枠", overrideCost.breakdown.traitSlots],
                  ["経歴", overrideCost.breakdown.history],
                  ["付出", overrideCost.breakdown.tsukedashi],
                  ["DNA変更", overrideCost.breakdown.genome],
                ].filter(([, v]) => (v as number) > 0).map(([key, val]) => (
                  <div key={key as string} className="data-row">
                    <span className="data-key">{key}</span>
                    <span className="data-val">{val}pt</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 mt-2 border-t-2 border-gold-muted flex justify-between items-center">
                <span className="text-xs font-pixel text-text-dim">合計コスト</span>
                <span className="text-lg font-pixel text-gold">{overrideCost.total}pt</span>
              </div>
            </div>

            {/* 演算モード選択 */}
            <div className="border-2 border-gold-muted bg-bg p-3 space-y-2">
              <p className="text-xs font-pixel text-gold">演算モード</p>
              <div className="space-y-1">
                {([
                  { value: "instant" as SimulationSpeed, label: "一括演算", desc: "結果だけ見る" },
                  { value: "yearly" as SimulationSpeed, label: "実況演算", desc: "年ごとに追う" },
                ]).map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setSimulationSpeed(mode.value)}
                    className={`w-full text-left text-xs px-3 py-2 border-2 transition-colors ${
                      simulationSpeed === mode.value
                        ? "border-gold text-gold bg-gold/10"
                        : "border-gold-muted text-text-dim hover:border-gold/50"
                    }`}
                  >
                    <span className="font-pixel">
                      {simulationSpeed === mode.value ? "▶ " : "　 "}
                      {mode.label}
                    </span>
                    <span className="text-text-dim ml-2">-- {mode.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 登録ボタン */}
            <Button
              variant="danger"
              size="lg"
              onClick={handleRegister}
              disabled={isRegistering}
              className="w-full"
            >
              <Trophy className="w-5 h-5 mr-2" />
              {isRegistering ? "登録中..." : `力士登録（追加 ${overrideCost.total}pt）`}
            </Button>
          </section>
        </div>
      )}

      {/* モバイル下部固定バー（抽選後のみ, lg以下） */}
      {editedDraft && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg-panel border-t-2 border-gold px-3 py-3 flex items-center justify-between gap-3 safe-area-bottom">
          <div className="text-xs font-pixel text-gold">
            {overrideCost.total}pt
          </div>
          <Button
            variant="danger"
            size="md"
            onClick={handleRegister}
            disabled={isRegistering}
            className="flex-1 max-w-[240px]"
          >
            <Trophy className="w-4 h-4 mr-1" />
            {isRegistering ? "登録中..." : "力士登録"}
          </Button>
        </div>
      )}
    </div>
  );
};

// --- DNAスライダーグループ(内部コンポーネント) ---
const DnaSliderGroup: React.FC<{
  title: string;
  sliders: Array<{
    key: string;
    label: string;
    scale?: number;
    suffix?: string;
    precision?: number;
  }>;
  values: Record<string, number>;
  onChange: (key: string, value: number) => void;
  min: number | ((key: string) => number);
  max: number | ((key: string) => number);
}> = ({ title, sliders, values, onChange, min, max }) => (
  <div className="space-y-1.5">
    <p className="text-xs font-pixel text-gold">{title}</p>
    {sliders.map(({ key, label, scale, suffix, precision }) => {
      const s = scale ?? 1;
      const rawVal = values[key] ?? 0;
      const sliderVal = Math.round(rawVal * s);
      const displayVal = precision != null ? (rawVal).toFixed(precision) : String(Math.round(rawVal));
      const minVal = typeof min === "function" ? min(key) : min;
      const maxVal = typeof max === "function" ? max(key) : max;

      return (
        <div key={key} className="flex items-center gap-2">
          <span className="text-xs w-20 shrink-0 text-text-dim">{label}</span>
          <input
            type="range"
            min={minVal}
            max={maxVal}
            step={1}
            value={sliderVal}
            onChange={(e) => onChange(key, Number(e.target.value) / s)}
            className="flex-1 h-1.5"
          />
          <span className="text-xs w-10 text-right font-pixel text-gold">
            {displayVal}{suffix ?? ""}
          </span>
        </div>
      );
    })}
  </div>
);
