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
import { RefreshCw, Trophy, Sparkles } from "lucide-react";

interface ScoutScreenProps {
  onStart: (initialStats: RikishiStatus, oyakata: Oyakata | null) => void;
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
      onStart(initialStats, null);
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
    <div className="max-w-5xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
      <section className="border-4 border-sumi bg-washi p-4 space-y-4 shadow-[6px_6px_0px_0px_#2b2b2b]">
        <h2 className="text-lg font-black">スカウト管理局</h2>

        <div className="border-2 border-sumi bg-washi-dark p-3 space-y-1">
          <p className="text-sm font-black">所持ポイント: {wallet?.points ?? "..."} / {wallet?.cap ?? 500}</p>
          <p className="text-xs font-bold text-sumi-light">
            次の回復: {wallet ? formatCountdown(wallet.nextRegenInSec) : "--:--"}（1分で1pt）
          </p>
        </div>

        <button
          onClick={handleDraw}
          disabled={!canDraw}
          className={`w-full py-3 border-2 font-black flex items-center justify-center gap-2 ${
            canDraw
              ? "bg-sumi text-washi border-sumi hover:bg-shuiro hover:border-shuiro"
              : "bg-washi-dark text-sumi-light border-sumi-light"
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          {isDrawing ? "抽選中..." : `新弟子を抽選 (-${SCOUT_COST.DRAW}pt)`}
        </button>

        {errorMessage && (
          <p className="text-xs font-bold text-shuiro border border-shuiro p-2 bg-washi">{errorMessage}</p>
        )}

        {!editedDraft && (
          <p className="text-sm font-bold text-sumi-light border-2 border-dashed border-sumi p-3">
            まず抽選を実行してください。抽選後に有料上書き設定が可能になります。
          </p>
        )}

        {editedDraft && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-black">四股名（変更 +{SCOUT_COST.SHIKONA}pt）</label>
              <input
                value={editedDraft.shikona}
                onChange={(event) =>
                  setEditedDraft((prev) => (prev ? { ...prev, shikona: event.target.value } : prev))
                }
                className="w-full border-2 border-sumi px-3 py-2 bg-washi"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-black">本名（変更 +{SCOUT_COST.REAL_NAME}pt）</label>
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
                  className="w-full border-2 border-sumi px-3 py-2 bg-washi"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black">出身地（変更 +{SCOUT_COST.BIRTHPLACE}pt）</label>
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
                  className="w-full border-2 border-sumi px-3 py-2 bg-washi"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black">性格（変更 +{SCOUT_COST.PERSONALITY}pt）</label>
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
                className="w-full border-2 border-sumi px-3 py-2 bg-washi"
              >
                {(Object.keys(PERSONALITY_LABELS) as PersonalityType[]).map((personality) => (
                  <option key={personality} value={personality}>
                    {PERSONALITY_LABELS[personality]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black">体格（変更 +{SCOUT_COST.BODY_TYPE}pt）</label>
              <select
                value={editedDraft.bodyType}
                onChange={(event) => handleBodyTypeChange(event.target.value as BodyType)}
                className="w-full border-2 border-sumi px-3 py-2 bg-washi"
              >
                {(Object.keys(CONSTANTS.BODY_TYPE_DATA) as BodyType[]).map((bodyType) => (
                  <option key={bodyType} value={bodyType}>
                    {CONSTANTS.BODY_TYPE_DATA[bodyType].name}
                  </option>
                ))}
              </select>
              <p className="text-xs font-bold text-sumi-light">
                身長 {editedDraft.bodyMetrics.heightCm}cm / 体重 {editedDraft.bodyMetrics.weightKg}kg
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black">
                スキル枠（変更 +{resolveTraitSlotCost(editedDraft.traitSlots)}pt）
              </label>
              <select
                value={editedDraft.traitSlots}
                onChange={(event) => handleTraitSlotsChange(Number(event.target.value))}
                className="w-full border-2 border-sumi px-3 py-2 bg-washi"
              >
                {[0, 1, 2, 3, 4, 5].map((slot) => (
                  <option key={slot} value={slot}>
                    {slot} 枠 (+{resolveTraitSlotCost(slot)}pt)
                  </option>
                ))}
              </select>

              {editedDraft.traitSlots === 0 ? (
                <p className="text-xs font-bold text-sumi-light border border-dashed border-sumi p-2 bg-washi-dark">
                  スキルは非表示中です。枠を戻すと候補と選択は復元されます。
                </p>
              ) : (
                <div className="space-y-2">
                  {activeTraitSlotDrafts.map((slotDraft) => (
                    <div key={slotDraft.slotIndex} className="border border-sumi p-2 bg-washi-dark space-y-2">
                      <p className="text-xs font-black">
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
                              className={`text-[11px] px-2 py-1 border font-bold text-left ${
                                isSelected
                                  ? "border-shuiro text-shuiro bg-washi"
                                  : selectedElsewhere
                                    ? "border-sumi-light text-sumi-light bg-washi-dark"
                                    : "border-sumi bg-washi text-sumi hover:border-shuiro"
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

              <div className="flex flex-wrap gap-1.5 border border-sumi p-2 bg-washi-dark min-h-10">
                {editedDraft.traits.length === 0 ? (
                  <span className="text-xs font-bold text-sumi-light">採用スキルなし</span>
                ) : (
                  editedDraft.traits.map((trait) => (
                    <span key={trait} className="text-[11px] px-2 py-1 border border-sumi font-bold bg-washi">
                      {traitName(trait)}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black">経歴（変更 +{SCOUT_COST.HISTORY}pt）</label>
              <select
                value={editedDraft.history}
                onChange={(event) => handleHistoryChange(event.target.value as ScoutHistory)}
                className="w-full border-2 border-sumi px-3 py-2 bg-washi"
              >
                {(Object.keys(SCOUT_HISTORY_OPTIONS) as ScoutHistory[]).map((history) => (
                  <option key={history} value={history}>
                    {SCOUT_HISTORY_OPTIONS[history].label}
                  </option>
                ))}
              </select>

              {historyData?.canTsukedashi && (
                <div className="space-y-1">
                  <label className="text-xs font-black">付出指定（差分 +30/+60pt）</label>
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
                    className="w-full border-2 border-sumi px-3 py-2 bg-washi"
                  >
                    <option value="Maezumo">前相撲</option>
                    <option value="Makushita60">幕下最下位格 (+30pt)</option>
                    <option value="Sandanme90">三段目最下位格 (+60pt)</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="border-4 border-sumi bg-washi p-4 space-y-4 shadow-[6px_6px_0px_0px_#2b2b2b]">
        <h2 className="text-lg font-black flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          候補サマリー
        </h2>

        {editedDraft ? (
          <>
            <div className="space-y-1 text-sm font-bold border-2 border-sumi p-3 bg-washi-dark">
              <p>四股名: {editedDraft.shikona}</p>
              <p>本名: {editedDraft.profile.realName || "(未設定)"}</p>
              <p>出身地: {editedDraft.profile.birthplace || "(未設定)"}</p>
              <p>性格: {PERSONALITY_LABELS[editedDraft.profile.personality]}</p>
              <p>経歴: {SCOUT_HISTORY_OPTIONS[editedDraft.history].label}</p>
              <p>素質: {CONSTANTS.TALENT_ARCHETYPES[editedDraft.archetype].name}</p>
              <p>戦術: {editedDraft.tactics}</p>
              <p>得意技: {editedDraft.signatureMove}</p>
              <p>体格: {CONSTANTS.BODY_TYPE_DATA[editedDraft.bodyType].name}</p>
              <p>
                体格値: {editedDraft.bodyMetrics.heightCm}cm / {editedDraft.bodyMetrics.weightKg}kg
              </p>
            </div>

            <div className="border-2 border-sumi p-3 bg-washi-dark space-y-1 text-sm font-bold">
              <p>上書きコスト内訳</p>
              <p>四股名: {overrideCost.breakdown.shikona}pt</p>
              <p>本名: {overrideCost.breakdown.realName}pt</p>
              <p>出身地: {overrideCost.breakdown.birthplace}pt</p>
              <p>性格: {overrideCost.breakdown.personality}pt</p>
              <p>体格: {overrideCost.breakdown.bodyType}pt</p>
              <p>スキル枠: {overrideCost.breakdown.traitSlots}pt</p>
              <p>経歴: {overrideCost.breakdown.history}pt</p>
              <p>付出: {overrideCost.breakdown.tsukedashi}pt</p>
              <p className="text-base text-shuiro">合計: {overrideCost.total}pt</p>
            </div>

            <button
              onClick={handleRegister}
              disabled={isRegistering}
              className="w-full py-3 border-2 border-sumi bg-shuiro text-washi font-black hover:bg-sumi disabled:bg-washi-dark disabled:text-sumi-light disabled:border-sumi-light flex items-center justify-center gap-2"
            >
              <Trophy className="w-5 h-5" />
              {isRegistering ? "登録中..." : `力士登録（追加 ${overrideCost.total}pt）`}
            </button>
          </>
        ) : (
          <p className="text-sm font-bold text-sumi-light border-2 border-dashed border-sumi p-3">
            抽選後に候補の詳細と上書きコストが表示されます。
          </p>
        )}
      </section>
    </div>
  );
};
