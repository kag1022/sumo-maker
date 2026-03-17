import React from "react";
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
import {
  SCOUT_BACKGROUNDS,
  SCOUT_PHYSICAL_TRAITS,
  SCOUT_STYLES,
  ScoutBackgroundId,
  ScoutPhysicalTraitId,
  ScoutStyleId,
} from "../../../logic/scout/choices";
import { getWalletState, spendWalletPoints, WalletState } from "../../../logic/persistence/wallet";
import type { SimulationPacing } from "../../simulation/store/simulationStore";
import { Button } from "../../../shared/ui/Button";
import { RefreshCw, Trophy, Coins, ChevronDown, User, Zap } from "lucide-react";

interface ScoutScreenProps {
  onStart: (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
    initialPacing?: SimulationPacing,
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
const LABEL_CLASS = "text-xs ui-text-label text-gold";
const INPUT_CLASS = "w-full border-2 border-gold-muted bg-bg px-3 py-2.5 text-text text-sm focus:border-gold focus:ring-1 focus:ring-gold/30 transition-all";
const SELECT_CLASS = `${INPUT_CLASS} appearance-none cursor-pointer`;

export const ScoutScreen: React.FC<ScoutScreenProps> = ({ onStart }) => {
  const isDev = import.meta.env.DEV;
  const [wallet, setWallet] = React.useState<WalletState | null>(null);
  const [baseDraft, setBaseDraft] = React.useState<ScoutDraft | null>(null);
  const [editedDraft, setEditedDraft] = React.useState<ScoutDraft | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string>("");
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [isRegistering, setIsRegistering] = React.useState(false);
  const [helpInfo, setHelpInfo] = React.useState<{ title: string; text: string } | null>(null);

  React.useEffect(() => {
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

  const overrideCost = React.useMemo(() => {
    if (!baseDraft || !editedDraft) {
      return {
        total: 0,
        breakdown: {
          shikona: 0, realName: 0, birthplace: 0, personality: 0,
          bodyType: 0, traitSlots: 0, history: 0, tsukedashi: 0,
          background: 0, physicalTrait: 0, style: 0,
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

  const handleRegister = async (initialPacing: SimulationPacing = "skip_to_end") => {
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
      await onStart(initialStats, null, initialPacing);
    } finally {
      setIsRegistering(false);
    }
  };

  const showHelp = (title: string, text: string) => {
    setHelpInfo((prev) => (prev?.title === title ? null : { title, text }));
  };

  const historyData = editedDraft ? SCOUT_HISTORY_OPTIONS[editedDraft.history] : undefined;
  const activeTraitSlotDrafts = editedDraft
    ? [...editedDraft.traitSlotDrafts]
        .filter((slot) => slot.slotIndex < editedDraft.traitSlots)
        .sort((a, b) => a.slotIndex - b.slotIndex)
    : [];

  return (
    <div className="space-y-5">
      {/* === ウェルカムヒーロー（抽選前のみ） === */}
      {!editedDraft && (
        <section className="dashboard-hero animate-in">
          <div className="surface-panel space-y-5">
            <div className="space-y-3">
              <p className="app-kicker">新弟子の入口</p>
              <h2 className="text-3xl sm:text-5xl ui-text-heading text-text leading-tight">
                候補の輪郭を見てから、
                <br className="hidden sm:block" />
                必要な項目だけ整える
              </h2>
              <p className="text-sm sm:text-base text-text-dim max-w-2xl leading-relaxed">
                まず候補を引き、その候補の体格、来歴、持ち味を見てから細部を整えます。
                長い入力フォームを最初に全部埋める流れにはしません。
              </p>
            </div>

            <div className="metric-strip">
              <div className="metric-card">
                <div className="metric-label">所持ポイント</div>
                <div className="metric-value">{wallet?.points ?? "..."}ポイント</div>
                <div className="metric-note">上限 {wallet?.cap ?? 500}ポイント</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">次の回復</div>
                <div className="metric-value">{wallet ? formatCountdown(wallet.nextRegenInSec) : "--:--"}</div>
                <div className="metric-note">一定時間ごとにポイントが回復します。</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">候補を引く費用</div>
                <div className="metric-value">{SCOUT_COST.DRAW}ポイント</div>
                <div className="metric-note">気に入らなければ引き直せます。</div>
              </div>
            </div>
          </div>

          <div className="surface-panel space-y-4">
            <div>
              <p className="panel-title">最初の一手</p>
              <p className="panel-caption">
                まず1人だけ候補を引き、その候補を起点に調整を始めます。
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleDraw}
              disabled={!canDraw}
              className="w-full"
            >
              <RefreshCw className={`w-5 h-5 mr-2 ${isDrawing ? "animate-spin" : ""}`} />
              {isDrawing ? "候補を引いています..." : "候補を引く"}
            </Button>

            {errorMessage && (
              <div className="status-callout" data-tone="danger">
                <div className="status-callout-title">操作できません</div>
                <div className="status-callout-text">{errorMessage}</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* === 抽選後: レイアウト === */}
      {editedDraft && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_340px] gap-5 animate-in">
          {/* 左パネル: スカウト管理局 */}
          <section className="surface-panel space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="panel-title">候補の調整</p>
                <p className="panel-caption">候補の輪郭を見ながら必要な項目だけを上書きします。</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-dim">
                <Coins className="w-3.5 h-3.5 text-brand-line" />
                <span className="ui-text-label text-text">{wallet?.points ?? "..."}</span>
                <span>/ {wallet?.cap ?? 500}ポイント</span>
              </div>
            </div>

            {/* 再抽選ボタン */}
            <Button
              onClick={handleDraw}
              disabled={!canDraw}
              variant="secondary"
              className="w-full py-3"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isDrawing ? "animate-spin" : ""}`} />
              {isDrawing ? "引き直しています..." : `候補を引き直す（${SCOUT_COST.DRAW}ポイント）`}
            </Button>

            {errorMessage && (
              <div className="status-callout" data-tone="danger">
                <div className="status-callout-title">登録できません</div>
                <div className="status-callout-text">{errorMessage}</div>
              </div>
            )}

            {/* === フォームセクション === */}
            <div className="space-y-6">
              {/* カード 1: 基本プロフィール */}
              <div className="surface-card p-5 space-y-4 border-l-4 border-gold">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-gold" />
                  <h3 className="ui-text-label text-sm text-text">基本プロフィール</h3>
                </div>
                
                <div className="space-y-4">
                  {/* 四股名 */}
                  <div className="space-y-1.5">
                    <label className={LABEL_CLASS}>四股名（変更 +{SCOUT_COST.SHIKONA}pt）</label>
                    <input
                      value={editedDraft.shikona}
                      onChange={(e) =>
                        setEditedDraft((prev) => (prev ? { ...prev, shikona: e.target.value } : prev))
                      }
                      className={`${INPUT_CLASS} ui-text-label text-lg sm:text-xl text-gold bg-bg-light/30`}
                    />
                  </div>

                  {/* 本名・出身地 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                </div>
              </div>

              {/* カード 2: 身体構造とキャリア */}
              <div className="surface-card p-5 space-y-4 border-l-4 border-action">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-action" />
                  <h3 className="ui-text-label text-sm text-text">身体構造とキャリア</h3>
                </div>

                <div className="space-y-5">
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
                    <div className="flex justify-between items-center px-1">
                      <p className="text-[11px] text-text-dim">
                        身長 <span className="text-text">{editedDraft.bodyMetrics.heightCm}</span> cm
                      </p>
                      <p className="text-[11px] text-text-dim">
                        体重 <span className="text-text">{editedDraft.bodyMetrics.weightKg}</span> kg
                      </p>
                    </div>
                  </div>

                  {/* スキル枠 */}
                  <div className="space-y-3">
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

                    {editedDraft.traitSlots > 0 && (
                      <div className="space-y-3 animate-in fade-in duration-300">
                        {activeTraitSlotDrafts.map((slotDraft) => (
                          <div key={slotDraft.slotIndex} className="bg-bg-light/20 p-3 border border-gold-muted/30 space-y-2">
                            <p className="text-[10px] ui-text-label text-text-dim uppercase tracking-wider">
                              Slot {slotDraft.slotIndex + 1}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
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
                                    className={`text-xs px-2 py-2.5 border-2 text-center transition-all duration-200 ${
                                      isSelected
                                        ? "border-gold bg-gold/15 text-gold shadow-[0_0_10px_rgba(212,175,55,0.2)]"
                                        : selectedElsewhere
                                          ? "border-bg-light text-text-dim/30 bg-bg cursor-not-allowed opacity-50"
                                          : "border-gold-muted/40 bg-bg/50 text-text-dim hover:border-gold/60 hover:text-text"
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
                  </div>

                  {/* 経歴 */}
                  <div className="space-y-4 pt-2 border-t border-gold-muted/20">
                    <div className="space-y-1.5">
                      <label className={LABEL_CLASS}>来歴（+{SCOUT_COST.HISTORY}pt）</label>
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
                    </div>

                    {historyData?.canTsukedashi && (
                      <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                        <label className={LABEL_CLASS}>付出制度の利用（差分 +30/+60pt）</label>
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
                            <option value="Maezumo">前相撲を希望</option>
                            <option value="Makushita60">幕下最下位格付出 (+30pt)</option>
                            <option value="Sandanme90">三段目最下位格付出 (+60pt)</option>
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* カード 3: 資質と志しの選択 */}
              <div className="surface-card p-5 space-y-4 border-l-4 border-brand-line">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-brand-line" />
                    <h3 className="ui-text-label text-sm text-text">資質と志し</h3>
                  </div>
                  <span className="text-[10px] text-text-dim uppercase tracking-widest">Genome Resolution</span>
                </div>

                <div className="space-y-6">
                  {/* 素養 */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className={LABEL_CLASS}>素養</label>
                      <button
                        type="button"
                        onClick={() => showHelp("素養", "力士の出身背景やスポーツ歴です。初期能力や成長の限界値、得意とする技術に影響します。")}
                        className={`text-[10px] px-2 py-0.5 border transition-colors ${helpInfo?.title === "素養" ? "bg-brand-line border-brand-line text-bg" : "text-brand-line border-brand-line/30 hover:bg-brand-line/10"}`}
                      >
                        {helpInfo?.title === "素養" ? "閉じる" : "解説を表示"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(Object.keys(SCOUT_BACKGROUNDS) as ScoutBackgroundId[]).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setEditedDraft(prev => prev ? { ...prev, selectedBackgroundId: id } : prev)}
                          className={`px-2 py-2.5 text-xs border-2 transition-all duration-200 ${
                            editedDraft.selectedBackgroundId === id
                              ? "border-gold bg-gold/15 text-gold shadow-[0_0_8px_rgba(212,175,55,0.15)]"
                              : "border-gold-muted/30 bg-bg text-text-dim hover:border-gold/50"
                          }`}
                        >
                          {SCOUT_BACKGROUNDS[id].name}
                        </button>
                      ))}
                    </div>
                    {helpInfo?.title === "素養" && (
                      <div className="text-[11px] text-text-dim bg-brand-line/5 p-3 border-l-2 border-brand-line animate-in zoom-in-95 duration-200">
                        {SCOUT_BACKGROUNDS[editedDraft.selectedBackgroundId].help}
                        <p className="mt-2 text-action opacity-80 leading-relaxed italic">
                          ※{helpInfo.text}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 体質 */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className={LABEL_CLASS}>体質</label>
                      <button
                        type="button"
                        onClick={() => showHelp("体質", "生まれ持った肉体的な特徴です。ステータスの伸びやすさや、怪我への耐性を決定付けます。")}
                        className={`text-[10px] px-2 py-0.5 border transition-colors ${helpInfo?.title === "体質" ? "bg-brand-line border-brand-line text-bg" : "text-brand-line border-brand-line/30 hover:bg-brand-line/10"}`}
                      >
                        {helpInfo?.title === "体質" ? "閉じる" : "解説を表示"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(Object.keys(SCOUT_PHYSICAL_TRAITS) as ScoutPhysicalTraitId[]).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setEditedDraft(prev => prev ? { ...prev, selectedPhysicalTraitId: id } : prev)}
                          className={`px-2 py-2.5 text-xs border-2 transition-all duration-200 ${
                            editedDraft.selectedPhysicalTraitId === id
                              ? "border-gold bg-gold/15 text-gold shadow-[0_0_8px_rgba(212,175,55,0.15)]"
                              : "border-gold-muted/30 bg-bg text-text-dim hover:border-gold/50"
                          }`}
                        >
                          {SCOUT_PHYSICAL_TRAITS[id].name}
                        </button>
                      ))}
                    </div>
                    {helpInfo?.title === "体質" && (
                      <div className="text-[11px] text-text-dim bg-brand-line/5 p-3 border-l-2 border-brand-line animate-in zoom-in-95 duration-200">
                        {SCOUT_PHYSICAL_TRAITS[editedDraft.selectedPhysicalTraitId].help}
                        <p className="mt-2 text-action opacity-80 leading-relaxed italic">
                          ※{helpInfo.text}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 相撲型 */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className={LABEL_CLASS}>相撲型</label>
                      <button
                        type="button"
                        onClick={() => showHelp("相撲型", "将来どのような取り口を目指すかの志向です。成長曲線や、土壇場での勝負強さに影響します。")}
                        className={`text-[10px] px-2 py-0.5 border transition-colors ${helpInfo?.title === "相撲型" ? "bg-brand-line border-brand-line text-bg" : "text-brand-line border-brand-line/30 hover:bg-brand-line/10"}`}
                      >
                        {helpInfo?.title === "相撲型" ? "閉じる" : "解説を表示"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(Object.keys(SCOUT_STYLES) as ScoutStyleId[]).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setEditedDraft(prev => prev ? { ...prev, selectedStyleId: id } : prev)}
                          className={`px-2 py-2.5 text-xs border-2 transition-all duration-200 ${
                            editedDraft.selectedStyleId === id
                              ? "border-gold bg-gold/15 text-gold shadow-[0_0_8px_rgba(212,175,55,0.15)]"
                              : "border-gold-muted/30 bg-bg text-text-dim hover:border-gold/50"
                          }`}
                        >
                          {SCOUT_STYLES[id].name}
                        </button>
                      ))}
                    </div>
                    {helpInfo?.title === "相撲型" && (
                      <div className="text-[11px] text-text-dim bg-brand-line/5 p-3 border-l-2 border-brand-line animate-in zoom-in-95 duration-200">
                        {SCOUT_STYLES[editedDraft.selectedStyleId].help}
                        <p className="mt-2 text-action opacity-80 leading-relaxed italic">
                          ※{helpInfo.text}
                        </p>
                      </div>
                    )}
                  </div>

                  {helpInfo && (
                    <div className="mt-2 p-3 bg-action/5 border border-action/20 relative animate-in slide-in-from-bottom-2 duration-300">
                      <button
                        onClick={() => setHelpInfo(null)}
                        className="absolute top-1 right-2 text-text-dim hover:text-text text-sm"
                      >
                        ×
                      </button>
                      <p className="text-[10px] ui-text-label text-action mb-1">{helpInfo.title}の補足</p>
                      <p className="text-[11px] text-text-dim leading-relaxed">{helpInfo.text}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 右パネル: 候補サマリー */}
          <section className="lg:sticky lg:top-6 lg:self-start space-y-4">
            <div className="surface-panel space-y-4 shadow-xl border-t-4 border-gold">
              <div className="flex items-center justify-between border-b border-gold-muted/30 pb-2">
                <h2 className="ui-text-label text-sm text-gold flex items-center gap-2">
                  <User className="w-4 h-4" />
                  新弟子カルテ
                </h2>
                <span className="text-[10px] text-text-dim px-2 py-0.5 bg-bg-light/40 border border-gold-muted/20">
                  ID: {editedDraft.shikona.substring(0, 4).toUpperCase()}-{Math.floor(Math.random() * 9000) + 1000}
                </span>
              </div>

              {/* 四股名ヒーロー */}
              <div className="text-center py-4 bg-gradient-to-b from-gold/10 to-transparent rounded-t-lg">
                <p className="text-xs ui-text-label text-brand-line mb-1">西之海部屋 門下</p>
                <p className="text-3xl sm:text-4xl ui-text-heading text-text tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                  {editedDraft.shikona}
                </p>
                <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-bg/60 border border-gold-muted/30">
                  <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
                  <span className="text-[10px] ui-text-label text-gold uppercase tracking-tighter">
                    {CONSTANTS.TALENT_ARCHETYPES[editedDraft.archetype].name}
                  </span>
                </div>
              </div>

              {/* 基本情報グリッド */}
              <div className="grid grid-cols-1 gap-1 pt-2">
                {[
                  { key: "本名", val: editedDraft.profile.realName || "不詳", icon: <User className="w-3 h-3" /> },
                  { key: "出身", val: editedDraft.profile.birthplace || "日本", icon: <Trophy className="w-3 h-3" /> },
                  { key: "性格", val: PERSONALITY_LABELS[editedDraft.profile.personality], icon: <Zap className="w-3 h-3" /> },
                  { key: "体格", val: `${CONSTANTS.BODY_TYPE_DATA[editedDraft.bodyType].name}型`, icon: <Zap className="w-3 h-3" /> },
                  { key: "身長/体重", val: `${editedDraft.bodyMetrics.heightCm}cm / ${editedDraft.bodyMetrics.weightKg}kg`, icon: <Zap className="w-3 h-3" /> },
                ].map((item) => (
                  <div key={item.key} className="flex justify-between items-center py-1.5 border-b border-gold-muted/10 text-[11px]">
                    <span className="text-text-dim flex items-center gap-1.5 ui-text-label">
                      {item.icon}
                      {item.key}
                    </span>
                    <span className="text-text font-medium">{item.val}</span>
                  </div>
                ))}
              </div>

              {/* 素養・体質・型カード */}
              <div className="bg-bg-light/30 border border-gold-muted/20 p-3 space-y-2">
                <p className="text-[10px] ui-text-label text-gold/70 border-b border-gold/10 pb-1 mb-2">資質と型</p>
                <div className="space-y-1.5">
                  {[
                    { key: "素養", val: SCOUT_BACKGROUNDS[editedDraft.selectedBackgroundId].name },
                    { key: "体質", val: SCOUT_PHYSICAL_TRAITS[editedDraft.selectedPhysicalTraitId].name },
                    { key: "相撲型", val: SCOUT_STYLES[editedDraft.selectedStyleId].name },
                  ].map((item) => (
                    <div key={item.key} className="flex justify-between items-center text-[10px]">
                      <span className="text-text-dim italic">{item.key}</span>
                      <span className="text-gold border border-gold/20 px-1.5 bg-gold/5">{item.val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* コストサマリー */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] ui-text-label text-text-dim">構築費用 合計</span>
                  <div className="text-right">
                    {overrideCost.total > 0 && (
                      <p className="text-[10px] text-brand-line line-through opacity-50 mb-[-2px]">
                        {overrideCost.total + 50}pt
                      </p>
                    )}
                    <p className="text-2xl ui-text-metric text-text leading-none">
                      {overrideCost.total}<span className="text-xs ml-1">PT</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* 登録アクション */}
              <div className="space-y-2 pt-2">
                <Button
                  size="lg"
                  onClick={() => void handleRegister("skip_to_end")}
                  disabled={isRegistering}
                  className="w-full py-4 relative group overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gold/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                  <Trophy className="w-5 h-5 mr-2 relative z-10" />
                  <span className="relative z-10">
                    {isRegistering ? "門出を祝っています..." : "この内容で入門させる"}
                  </span>
                </Button>
                
                {isDev && (
                  <Button
                    variant="outline"
                    onClick={() => void handleRegister("observe")}
                    disabled={isRegistering}
                    className="w-full text-xs opacity-60 hover:opacity-100"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                    開発者メニュー: 観測モード
                  </Button>
                )}
              </div>
            </div>
            
            {/* 最後に調整した日時などの補助情報 */}
            <p className="text-[10px] text-text-dim text-center italic">
              ※入門後の基本能力値は、選択した資質に基づき算出されます。
            </p>
          </section>
        </div>
      )}

      {/* モバイル下部固定バー（抽選後のみ, lg以下） */}
      {editedDraft && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg-panel border-t-2 border-gold px-3 py-3 safe-area-bottom">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs ui-text-label text-gold">
              {overrideCost.total}pt
            </div>
            <Button
              variant="danger"
              size="md"
              onClick={() => void handleRegister("skip_to_end")}
              disabled={isRegistering}
              className="flex-1 max-w-[240px]"
            >
              <Trophy className="w-4 h-4 mr-1" />
              {isRegistering ? "演算中..." : "結果を見る"}
            </Button>
          </div>
          {isDev && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRegister("observe")}
              disabled={isRegistering}
              className="mt-2 w-full"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {isRegistering ? "観測モードを準備しています..." : "観測モードで始める"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
