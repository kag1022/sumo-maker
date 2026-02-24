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
import { RefreshCw, Trophy, Sparkles, Coins, ChevronDown } from "lucide-react";

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

export const ScoutScreen: React.FC<ScoutScreenProps> = ({ onStart }) => {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [baseDraft, setBaseDraft] = useState<ScoutDraft | null>(null);
  const [editedDraft, setEditedDraft] = useState<ScoutDraft | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

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
          shikona: 0,
          realName: 0,
          birthplace: 0,
          personality: 0,
          bodyType: 0,
          traitSlots: 0,
          history: 0,
          tsukedashi: 0,
          genome: 0,
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
      return {
        ...prev,
        history,
        entryDivision: nextEntryDivision,
      };
    });
  };

  const handleBodyTypeChange = (bodyType: BodyType) => {
    setEditedDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        bodyType,
        bodyMetrics: rollBodyMetricsForBodyType(bodyType),
      };
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

  // 共通のラベルスタイル
  const labelClass = "text-xs font-bold text-kiniro-muted";
  // 共通のインプットスタイル
  const inputClass = "w-full border border-kiniro-muted/20 bg-washi/80 px-3 py-2 text-sumi text-sm focus:border-kiniro/40 focus:ring-1 focus:ring-kiniro/30 transition-colors";
  const selectClass = `${inputClass} appearance-none cursor-pointer`;

  return (
    <div className="max-w-5xl mx-auto p-2 sm:p-4 grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-5">
      {/* === 左パネル: スカウト管理局 === */}
      <section className="game-panel p-5 space-y-5">
        <h2 className="text-lg font-black tracking-wider text-kiniro font-serif flex items-center gap-2">
          <span className="w-1 h-5 bg-kiniro inline-block" />
          スカウト管理局
        </h2>

        {/* ウォレット表示 */}
        <div className="border border-kiniro-muted/15 bg-washi/60 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-kiniro" />
            <span className="text-sm font-black text-kiniro">{wallet?.points ?? "..."}</span>
            <span className="text-xs text-sumi-light">/ {wallet?.cap ?? 500}</span>
          </div>
          <span className="text-xs font-bold text-sumi-light/60">
            次の回復: {wallet ? formatCountdown(wallet.nextRegenInSec) : "--:--"}
          </span>
        </div>

        {/* 抽選ボタン */}
        <button
          onClick={handleDraw}
          disabled={!canDraw}
          className={`w-full py-3.5 border font-black flex items-center justify-center gap-2 text-sm transition-all ${
            canDraw
              ? "bg-gradient-to-b from-kiniro to-kiniro-dark text-washi border-kiniro/60 hover:from-kiniro-light hover:to-kiniro shadow-game active:scale-[0.98]"
              : "bg-washi-light text-sumi-light/40 border-washi-light"
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${isDrawing ? "animate-spin" : ""}`} />
          {isDrawing ? "抽選中..." : `新弟子を抽選 (-${SCOUT_COST.DRAW}pt)`}
        </button>

        {errorMessage && (
          <p className="text-xs font-bold text-shuiro border border-shuiro/30 p-2 bg-shuiro/10">{errorMessage}</p>
        )}

        {!editedDraft && (
          <p className="text-sm font-bold text-sumi-light/60 border border-dashed border-kiniro-muted/20 p-4 text-center">
            まず抽選を実行してください。抽選後に有料上書き設定が可能になります。
          </p>
        )}

        {editedDraft && (
          <div className="space-y-4 animate-in">
            {/* 四股名 */}
            <div className="space-y-1.5">
              <label className={labelClass}>四股名（変更 +{SCOUT_COST.SHIKONA}pt）</label>
              <input
                value={editedDraft.shikona}
                onChange={(event) =>
                  setEditedDraft((prev) => (prev ? { ...prev, shikona: event.target.value } : prev))
                }
                className={`${inputClass} font-serif text-lg font-bold`}
              />
            </div>

            {/* 本名・出身地 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={labelClass}>本名（変更 +{SCOUT_COST.REAL_NAME}pt）</label>
                <input
                  value={editedDraft.profile.realName}
                  onChange={(event) =>
                    setEditedDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            profile: { ...prev.profile, realName: event.target.value },
                          }
                        : prev,
                    )
                  }
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>出身地（変更 +{SCOUT_COST.BIRTHPLACE}pt）</label>
                <input
                  value={editedDraft.profile.birthplace}
                  onChange={(event) =>
                    setEditedDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            profile: { ...prev.profile, birthplace: event.target.value },
                          }
                        : prev,
                    )
                  }
                  className={inputClass}
                />
              </div>
            </div>

            {/* 性格 */}
            <div className="space-y-1.5">
              <label className={labelClass}>性格（変更 +{SCOUT_COST.PERSONALITY}pt）</label>
              <div className="relative">
                <select
                  value={editedDraft.profile.personality}
                  onChange={(event) =>
                    setEditedDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            profile: {
                              ...prev.profile,
                              personality: event.target.value as PersonalityType,
                            },
                          }
                        : prev,
                    )
                  }
                  className={selectClass}
                >
                  {(Object.keys(PERSONALITY_LABELS) as PersonalityType[]).map((personality) => (
                    <option key={personality} value={personality}>
                      {PERSONALITY_LABELS[personality]}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sumi-light pointer-events-none" />
              </div>
            </div>

            {/* 体格 */}
            <div className="space-y-1.5">
              <label className={labelClass}>体格（変更 +{SCOUT_COST.BODY_TYPE}pt）</label>
              <div className="relative">
                <select
                  value={editedDraft.bodyType}
                  onChange={(event) => handleBodyTypeChange(event.target.value as BodyType)}
                  className={selectClass}
                >
                  {(Object.keys(CONSTANTS.BODY_TYPE_DATA) as BodyType[]).map((bodyType) => (
                    <option key={bodyType} value={bodyType}>
                      {CONSTANTS.BODY_TYPE_DATA[bodyType].name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sumi-light pointer-events-none" />
              </div>
              <p className="text-xs font-bold text-sumi-light/60">
                身長 {editedDraft.bodyMetrics.heightCm}cm / 体重 {editedDraft.bodyMetrics.weightKg}kg
              </p>
            </div>

            {/* スキル枠 */}
            <div className="space-y-2">
              <label className={labelClass}>
                スキル枠（変更 +{resolveTraitSlotCost(editedDraft.traitSlots)}pt）
              </label>
              <div className="relative">
                <select
                  value={editedDraft.traitSlots}
                  onChange={(event) => handleTraitSlotsChange(Number(event.target.value))}
                  className={selectClass}
                >
                  {[0, 1, 2, 3, 4, 5].map((slot) => (
                    <option key={slot} value={slot}>
                      {slot} 枠 (+{resolveTraitSlotCost(slot)}pt)
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sumi-light pointer-events-none" />
              </div>

              {editedDraft.traitSlots === 0 ? (
                <p className="text-xs font-bold text-sumi-light/50 border border-dashed border-kiniro-muted/15 p-2 bg-washi/40">
                  スキルは非表示中です。枠を戻すと候補と選択は復元されます。
                </p>
              ) : (
                <div className="space-y-2">
                  {activeTraitSlotDrafts.map((slotDraft) => (
                    <div key={slotDraft.slotIndex} className="border border-kiniro-muted/15 p-2 bg-washi/40 space-y-2">
                      <p className="text-xs font-black text-sumi-light">
                        枠 {slotDraft.slotIndex + 1}
                        {slotDraft.selected ? `: ${traitName(slotDraft.selected)}` : ": 未選択"}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {slotDraft.options.map((option) => {
                          const selectedElsewhere = activeTraitSlotDrafts.some(
                            (other) =>
                              other.slotIndex !== slotDraft.slotIndex && other.selected === option,
                          );
                          const isSelected = slotDraft.selected === option;
                          return (
                            <button
                              key={`${slotDraft.slotIndex}-${option}`}
                              type="button"
                              onClick={() => handleTraitSelection(slotDraft.slotIndex, option)}
                              disabled={selectedElsewhere && !isSelected}
                              className={`text-[11px] px-2 py-1.5 border font-bold text-left transition-colors ${
                                isSelected
                                  ? "border-kiniro/50 text-kiniro bg-kiniro/10"
                                  : selectedElsewhere
                                    ? "border-washi-light text-sumi-light/30 bg-washi/20"
                                    : "border-kiniro-muted/20 bg-washi/40 text-sumi-light hover:border-kiniro/30 hover:text-kiniro"
                              }`}
                            >
                              {traitName(option)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 border border-kiniro-muted/15 p-2 bg-washi/40 min-h-10">
                {editedDraft.traits.length === 0 ? (
                  <span className="text-xs font-bold text-sumi-light/40">採用スキルなし</span>
                ) : (
                  editedDraft.traits.map((trait) => (
                    <span key={trait} className="text-[11px] px-2 py-1 border border-kiniro/30 font-bold bg-kiniro/10 text-kiniro">
                      {traitName(trait)}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* 経歴 */}
            <div className="space-y-1.5">
              <label className={labelClass}>経歴（変更 +{SCOUT_COST.HISTORY}pt）</label>
              <div className="relative">
                <select
                  value={editedDraft.history}
                  onChange={(event) => handleHistoryChange(event.target.value as ScoutHistory)}
                  className={selectClass}
                >
                  {(Object.keys(SCOUT_HISTORY_OPTIONS) as ScoutHistory[]).map((history) => (
                    <option key={history} value={history}>
                      {SCOUT_HISTORY_OPTIONS[history].label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sumi-light pointer-events-none" />
              </div>

              {historyData?.canTsukedashi && (
                <div className="space-y-1">
                  <label className={labelClass}>付出指定（差分 +30/+60pt）</label>
                  <div className="relative">
                    <select
                      value={editedDraft.entryDivision}
                      onChange={(event) =>
                        setEditedDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                entryDivision: event.target.value as EntryDivision,
                              }
                            : prev,
                        )
                      }
                      className={selectClass}
                    >
                      <option value="Maezumo">前相撲</option>
                      <option value="Makushita60">幕下最下位格 (+30pt)</option>
                      <option value="Sandanme90">三段目最下位格 (+60pt)</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sumi-light pointer-events-none" />
                  </div>
                </div>
              )}
            </div>

            {/* DNA設定 */}
            <div className="space-y-2">
              <label className={labelClass}>DNA設定（変更分コスト加算）</label>
              <details className="border border-kiniro-muted/20 bg-washi/40 group">
                <summary className="px-3 py-2 text-xs font-black cursor-pointer text-sumi-light hover:text-kiniro transition-colors flex items-center gap-1">
                  <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                  DNA詳細を開く（初期能力・成長・耐久・変動）
                </summary>
                <div className="px-3 py-3 space-y-4 border-t border-kiniro-muted/15">
                  {/* 初期能力 */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-black text-kiniro-muted">初期能力上限</p>
                    {[
                      { key: 'powerCeiling', label: '筋力' },
                      { key: 'techCeiling', label: '技術' },
                      { key: 'speedCeiling', label: '速度' },
                      { key: 'ringSense', label: '土俵感覚' },
                      { key: 'styleFit', label: '戦術適性' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold w-16 shrink-0 text-sumi-light">{label}</span>
                        <input
                          type="range"
                          min={0} max={100}
                          value={Math.round((editedDraft.genomeDraft.base as unknown as Record<string, number>)[key])}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setEditedDraft((prev) => prev ? {
                              ...prev,
                              genomeDraft: {
                                ...prev.genomeDraft,
                                base: { ...prev.genomeDraft.base, [key]: v },
                              },
                            } : prev);
                          }}
                          className="flex-1 h-1.5"
                        />
                        <span className="text-[10px] font-bold w-8 text-right text-kiniro">
                          {Math.round((editedDraft.genomeDraft.base as unknown as Record<string, number>)[key])}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* 成長曲線 */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-black text-kiniro-muted">成長曲線</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold w-16 shrink-0 text-sumi-light">ピーク年齢</span>
                      <input type="range" min={18} max={35}
                        value={Math.round(editedDraft.genomeDraft.growth.maturationAge)}
                        onChange={(e) => setEditedDraft((prev) => prev ? {
                          ...prev,
                          genomeDraft: { ...prev.genomeDraft, growth: { ...prev.genomeDraft.growth, maturationAge: Number(e.target.value) } },
                        } : prev)}
                        className="flex-1 h-1.5"
                      />
                      <span className="text-[10px] font-bold w-8 text-right text-kiniro">{Math.round(editedDraft.genomeDraft.growth.maturationAge)}歳</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold w-16 shrink-0 text-sumi-light">ピーク期間</span>
                      <input type="range" min={1} max={12}
                        value={Math.round(editedDraft.genomeDraft.growth.peakLength)}
                        onChange={(e) => setEditedDraft((prev) => prev ? {
                          ...prev,
                          genomeDraft: { ...prev.genomeDraft, growth: { ...prev.genomeDraft.growth, peakLength: Number(e.target.value) } },
                        } : prev)}
                        className="flex-1 h-1.5"
                      />
                      <span className="text-[10px] font-bold w-8 text-right text-kiniro">{Math.round(editedDraft.genomeDraft.growth.peakLength)}年</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold w-16 shrink-0 text-sumi-light">衰退速度</span>
                      <input type="range" min={1} max={20} step={1}
                        value={Math.round(editedDraft.genomeDraft.growth.lateCareerDecay * 10)}
                        onChange={(e) => setEditedDraft((prev) => prev ? {
                          ...prev,
                          genomeDraft: { ...prev.genomeDraft, growth: { ...prev.genomeDraft.growth, lateCareerDecay: Number(e.target.value) / 10 } },
                        } : prev)}
                        className="flex-1 h-1.5"
                      />
                      <span className="text-[10px] font-bold w-8 text-right text-kiniro">{editedDraft.genomeDraft.growth.lateCareerDecay.toFixed(1)}x</span>
                    </div>
                  </div>

                  {/* 耐久性 */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-black text-kiniro-muted">耐久性</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold w-16 shrink-0 text-sumi-light">怪我リスク</span>
                      <input type="range" min={3} max={20} step={1}
                        value={Math.round(editedDraft.genomeDraft.durability.baseInjuryRisk * 10)}
                        onChange={(e) => setEditedDraft((prev) => prev ? {
                          ...prev,
                          genomeDraft: { ...prev.genomeDraft, durability: { ...prev.genomeDraft.durability, baseInjuryRisk: Number(e.target.value) / 10 } },
                        } : prev)}
                        className="flex-1 h-1.5"
                      />
                      <span className="text-[10px] font-bold w-8 text-right text-kiniro">{editedDraft.genomeDraft.durability.baseInjuryRisk.toFixed(1)}x</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold w-16 shrink-0 text-sumi-light">回復力</span>
                      <input type="range" min={5} max={20} step={1}
                        value={Math.round(editedDraft.genomeDraft.durability.recoveryRate * 10)}
                        onChange={(e) => setEditedDraft((prev) => prev ? {
                          ...prev,
                          genomeDraft: { ...prev.genomeDraft, durability: { ...prev.genomeDraft.durability, recoveryRate: Number(e.target.value) / 10 } },
                        } : prev)}
                        className="flex-1 h-1.5"
                      />
                      <span className="text-[10px] font-bold w-8 text-right text-kiniro">{editedDraft.genomeDraft.durability.recoveryRate.toFixed(1)}x</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold w-16 shrink-0 text-sumi-light">慢性化耐性</span>
                      <input type="range" min={0} max={100}
                        value={Math.round(editedDraft.genomeDraft.durability.chronicResistance)}
                        onChange={(e) => setEditedDraft((prev) => prev ? {
                          ...prev,
                          genomeDraft: { ...prev.genomeDraft, durability: { ...prev.genomeDraft.durability, chronicResistance: Number(e.target.value) } },
                        } : prev)}
                        className="flex-1 h-1.5"
                      />
                      <span className="text-[10px] font-bold w-8 text-right text-kiniro">{Math.round(editedDraft.genomeDraft.durability.chronicResistance)}</span>
                    </div>
                  </div>

                  {/* 変動性 */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-black text-kiniro-muted">変動性</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold w-16 shrink-0 text-sumi-light">勝負強さ</span>
                      <input type="range" min={-50} max={50}
                        value={Math.round(editedDraft.genomeDraft.variance.clutchBias)}
                        onChange={(e) => setEditedDraft((prev) => prev ? {
                          ...prev,
                          genomeDraft: { ...prev.genomeDraft, variance: { ...prev.genomeDraft.variance, clutchBias: Number(e.target.value) } },
                        } : prev)}
                        className="flex-1 h-1.5"
                      />
                      <span className="text-[10px] font-bold w-8 text-right text-kiniro">{Math.round(editedDraft.genomeDraft.variance.clutchBias)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold w-16 shrink-0 text-sumi-light">調子の振れ</span>
                      <input type="range" min={0} max={100}
                        value={Math.round(editedDraft.genomeDraft.variance.formVolatility)}
                        onChange={(e) => setEditedDraft((prev) => prev ? {
                          ...prev,
                          genomeDraft: { ...prev.genomeDraft, variance: { ...prev.genomeDraft.variance, formVolatility: Number(e.target.value) } },
                        } : prev)}
                        className="flex-1 h-1.5"
                      />
                      <span className="text-[10px] font-bold w-8 text-right text-kiniro">{Math.round(editedDraft.genomeDraft.variance.formVolatility)}</span>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </div>
        )}
      </section>

      {/* === 右パネル: 候補サマリー === */}
      <section className="game-panel p-5 space-y-4 lg:sticky lg:top-20 lg:self-start">
        <h2 className="text-lg font-black flex items-center gap-2 text-kiniro font-serif">
          <Sparkles className="w-5 h-5" />
          候補サマリー
        </h2>

        {editedDraft ? (
          <>
            {/* ステータスサマリー */}
            <div className="space-y-2 text-sm font-bold border border-kiniro-muted/15 p-3 bg-washi/40">
              <p className="text-kiniro font-serif text-base">{editedDraft.shikona}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-sumi-light">
                <span>本名</span><span className="text-sumi">{editedDraft.profile.realName || "(未設定)"}</span>
                <span>出身地</span><span className="text-sumi">{editedDraft.profile.birthplace || "(未設定)"}</span>
                <span>性格</span><span className="text-sumi">{PERSONALITY_LABELS[editedDraft.profile.personality]}</span>
                <span>経歴</span><span className="text-sumi">{SCOUT_HISTORY_OPTIONS[editedDraft.history].label}</span>
                <span>素質</span><span className="text-sumi">{CONSTANTS.TALENT_ARCHETYPES[editedDraft.archetype].name}</span>
                <span>戦術</span><span className="text-sumi">{editedDraft.tactics}</span>
                <span>得意技</span><span className="text-sumi">{editedDraft.signatureMove}</span>
                <span>体格</span><span className="text-sumi">{CONSTANTS.BODY_TYPE_DATA[editedDraft.bodyType].name}</span>
                <span>体格値</span><span className="text-sumi">{editedDraft.bodyMetrics.heightCm}cm / {editedDraft.bodyMetrics.weightKg}kg</span>
                <span>ピーク</span><span className="text-sumi">{Math.round(editedDraft.genomeDraft.growth.maturationAge)}歳 ({Math.round(editedDraft.genomeDraft.growth.peakLength)}年間)</span>
                <span>怪我/勝負</span><span className="text-sumi">{editedDraft.genomeDraft.durability.baseInjuryRisk.toFixed(1)}x / {Math.round(editedDraft.genomeDraft.variance.clutchBias)}</span>
              </div>
            </div>

            {/* コスト */}
            <div className="border border-kiniro-muted/15 p-3 bg-washi/40 space-y-1.5">
              <p className="text-xs font-black text-kiniro-muted mb-2">上書きコスト内訳</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-sumi-light">
                <span>四股名</span><span className="text-sumi">{overrideCost.breakdown.shikona}pt</span>
                <span>本名</span><span className="text-sumi">{overrideCost.breakdown.realName}pt</span>
                <span>出身地</span><span className="text-sumi">{overrideCost.breakdown.birthplace}pt</span>
                <span>性格</span><span className="text-sumi">{overrideCost.breakdown.personality}pt</span>
                <span>体格</span><span className="text-sumi">{overrideCost.breakdown.bodyType}pt</span>
                <span>スキル枠</span><span className="text-sumi">{overrideCost.breakdown.traitSlots}pt</span>
                <span>経歴</span><span className="text-sumi">{overrideCost.breakdown.history}pt</span>
                <span>付出</span><span className="text-sumi">{overrideCost.breakdown.tsukedashi}pt</span>
                <span>DNA変更</span><span className="text-sumi">{overrideCost.breakdown.genome}pt</span>
              </div>
              <div className="pt-2 mt-2 border-t border-kiniro-muted/15 flex justify-between items-center">
                <span className="text-xs font-black text-sumi-light">合計コスト</span>
                <span className="text-base font-black text-kiniro">{overrideCost.total}pt</span>
              </div>
            </div>

            {/* 登録ボタン */}
            <button
              onClick={handleRegister}
              disabled={isRegistering}
              className="w-full py-3.5 border font-black flex items-center justify-center gap-2 text-sm transition-all bg-gradient-to-b from-shuiro to-shuiro-dark text-white border-shuiro/60 hover:from-shuiro-light hover:to-shuiro shadow-glow-red disabled:from-washi-light disabled:to-washi-light disabled:text-sumi-light/40 disabled:border-washi-light disabled:shadow-none active:scale-[0.98]"
            >
              <Trophy className="w-5 h-5" />
              {isRegistering ? "登録中..." : `力士登録（追加 ${overrideCost.total}pt）`}
            </button>
          </>
        ) : (
          <p className="text-sm font-bold text-sumi-light/50 border border-dashed border-kiniro-muted/20 p-4 text-center">
            抽選後に候補の詳細と上書きコストが表示されます。
          </p>
        )}
      </section>
    </div>
  );
};
