import React from "react";
import { Oyakata, RikishiStatus, BodyType, PersonalityType, Trait } from "../../../logic/models";
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
  ScoutDraft,
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
import { RikishiPortrait } from "../../../shared/ui/RikishiPortrait";
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
const INPUT_CLASS = "w-full border border-white/10 bg-black/20 px-3 py-2.5 text-text text-sm focus:border-gold focus:bg-black/40 focus:ring-1 focus:ring-gold/30 transition-all";
const SELECT_CLASS = `${INPUT_CLASS} appearance-none cursor-pointer`;

export const ScoutScreen: React.FC<ScoutScreenProps> = ({ onStart }) => {

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


  const activeTraitSlotDrafts = editedDraft
    ? [...editedDraft.traitSlotDrafts]
      .filter((slot) => slot.slotIndex < editedDraft.traitSlots)
      .sort((a, b) => a.slotIndex - b.slotIndex)
    : [];

  return (
    <div className="space-y-5">
      {/* === ウェルカムヒーロー（抽選前のみ） === */}
      {!editedDraft && (
        <section className="dashboard-hero animate-in slide-in-from-bottom-4 duration-700">
          <div className="rpg-panel p-8 space-y-6 bg-asanoha">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-gold/60" />
                <p className="app-kicker text-gold">新弟子の入口</p>
              </div>
              <h2 className="text-4xl sm:text-6xl ui-text-decoration text-text leading-tight drop-shadow-md">
                運命の輪郭を<br />
                その手で整える。
              </h2>
              <p className="text-sm sm:text-lg text-text-dim max-w-2xl leading-relaxed font-serif italic">
                土俵に上がる前の「最初の一歩」を演出しましょう。<br />
                まず候補を呼び込み、その力士の将来性を見極めてから、必要な項目だけを魂込めて調整します。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
              <div className="washi-surface p-6 ink-border group hover:translate-y-[-4px] transition-all">
                <div className="text-[10px] ui-text-label text-gold/60 mb-1">所持ポイント</div>
                <div className="text-2xl ui-text-decoration text-sumi">{wallet?.points ?? "..."}<span className="text-xs ml-1">PT</span></div>
                <div className="mt-2 text-[10px] text-sumi/40 italic">上限 {wallet?.cap ?? 500}pt</div>
              </div>
              <div className="washi-surface p-6 ink-border group hover:translate-y-[-4px] transition-all">
                <div className="text-[10px] ui-text-label text-gold/60 mb-1">次回の回復</div>
                <div className="text-2xl ui-text-decoration text-sumi">{wallet ? formatCountdown(wallet.nextRegenInSec) : "--:--"}</div>
                <div className="mt-2 text-[10px] text-sumi/40 italic">一定間隔で気が満ちます</div>
              </div>
              <div className="washi-surface p-6 ink-border group hover:translate-y-[-4px] transition-all">
                <div className="text-[10px] ui-text-label text-gold/60 mb-1">呼び込み費用</div>
                <div className="text-2xl ui-text-decoration text-sumi">{SCOUT_COST.DRAW}<span className="text-xs ml-1">PT</span></div>
                <div className="mt-2 text-[10px] text-sumi/40 italic">新しい風を土俵に</div>
              </div>
            </div>

            <div className="pt-8">
              <Button
                size="lg"
                onClick={handleDraw}
                disabled={!canDraw}
                className="w-full sm:w-auto px-12 py-6 text-xl ui-text-decoration relative group overflow-hidden"
              >
                <div className="absolute inset-0 bg-gold/20 translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
                <RefreshCw className={`w-6 h-6 mr-3 relative z-10 ${isDrawing ? "animate-spin" : ""}`} />
                <span className="relative z-10 tracking-widest">{isDrawing ? "召集しています..." : "新弟子を呼び込む"}</span>
              </Button>
              {errorMessage && (
                <div className="mt-4 p-4 bg-danger/10 border-l-4 border-danger animate-in fade-in slide-in-from-left-4">
                   <p className="text-sm text-danger font-medium">{errorMessage}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* === 抽選後: 適応型レイアウト === */}
      {editedDraft && (
        <div className="lg:grid lg:grid-cols-[400px_1fr] lg:gap-10 items-start animate-in fade-in duration-500">
          {/* 左カラム: 力士プレビューとサマリー (DesktopではSticky) */}
          <aside className="lg:sticky lg:top-24 space-y-6 mb-8 lg:mb-0">
            <div className="rpg-panel p-2 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gold/5 pointer-events-none group-hover:bg-gold/10 transition-colors" />
              {/* RikishiPortrait の導入 */}
              <div className="relative h-[480px] w-full bg-seigaiha/10 overflow-hidden flex items-end justify-center">
                <RikishiPortrait 
                  bodyType={editedDraft.bodyType} 
                  className="h-full w-full"
                  innerClassName="bg-transparent border-none p-0 shadow-none"
                />
              </div>
            </div>

            <div className="washi-surface p-8 ink-border relative">
              <div className="absolute top-4 right-4 text-[10px] ui-text-label text-sumi/40">
                NO. {editedDraft.profile.realName.substring(0, 2).toUpperCase()}-{Math.floor(Math.random() * 900) + 100}
              </div>
              <div className="text-center space-y-3">
                <p className="text-xs ui-text-label text-gold/80 italic">西之海部屋 門下</p>
                <h2 className="text-5xl ui-text-decoration text-sumi border-b border-sumi/10 pb-4">
                  {editedDraft.shikona}
                </h2>
                <div className="inline-block px-4 py-1.5 bg-sumi/5 border border-sumi/10">
                  <span className="text-[10px] ui-text-label text-sumi/60 uppercase tracking-widest">
                    {CONSTANTS.TALENT_ARCHETYPES[editedDraft.archetype].name}
                  </span>
                </div>
              </div>

              <div className="mt-8 space-y-2">
                {[
                  { key: "本名", val: editedDraft.profile.realName || "不詳" },
                  { key: "生国", val: editedDraft.profile.birthplace || "日本" },
                  { key: "性格", val: PERSONALITY_LABELS[editedDraft.profile.personality] },
                  { key: "体格", val: `${CONSTANTS.BODY_TYPE_DATA[editedDraft.bodyType].name} (${editedDraft.bodyMetrics.heightCm}cm / ${editedDraft.bodyMetrics.weightKg}kg)` }
                ].map((row) => (
                  <div key={row.key} className="flex justify-between items-center text-xs py-1.5 border-b border-sumi/5">
                    <span className="ui-text-label text-sumi/60">{row.key}</span>
                    <span className="text-sumi font-medium">{row.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* モバイル表示時のアクションバーは別出しにするが、デスクトップではここにコストを表示 */}
            <div className="hidden lg:block washi-surface p-6 ink-border bg-seigaiha/5">
              <div className="flex justify-between items-end mb-6">
                <div className="space-y-1">
                   <p className="text-[10px] ui-text-label text-gold/60">構築費用 合計</p>
                   <p className="text-4xl ui-text-decoration text-sumi">
                     {overrideCost.total}<span className="text-xs ml-1">PT</span>
                   </p>
                </div>
                <div className="text-right text-[10px] text-sumi/40 font-serif italic">
                  現有: {wallet?.points ?? "..."}pt
                </div>
              </div>
              <Button
                size="lg"
                onClick={() => void handleRegister("skip_to_end")}
                disabled={isRegistering}
                className="w-full py-6 text-xl ui-text-decoration relative group overflow-hidden"
              >
                <div className="absolute inset-0 bg-gold/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <Trophy className="w-6 h-6 mr-3 relative z-10" />
                <span className="relative z-10">{isRegistering ? "入門手続中..." : "この内容で入門"}</span>
              </Button>
            </div>
          </aside>

          {/* 右カラム: 各種調整フォーム */}
          <div className="space-y-8">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="h-4 w-1 bg-gold" />
                <h3 className="ui-text-label text-gold text-sm tracking-widest uppercase">新弟子の調整</h3>
              </div>
              <Button
                onClick={handleDraw}
                disabled={!canDraw}
                variant="outline"
                size="sm"
                className="text-[10px] py-1 h-8"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isDrawing ? "animate-spin" : ""}`} />
                {isDrawing ? "探索中..." : `別の候補を呼び込む (${SCOUT_COST.DRAW}pt)`}
              </Button>
            </div>

            {/* 設定セクションをひとまとめにする */}
            <div className="space-y-6">
              {/* カード 1: 基本プロフィール */}
              <div className="washi-surface p-6 ink-border space-y-4 border-l-4 border-gold">
                <div className="flex items-center gap-3 mb-2 border-b border-sumi/5 pb-2">
                  <User className="w-4 h-4 text-gold" />
                  <h3 className="ui-text-label text-sm text-sumi">一、基本プロフィール</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className={LABEL_CLASS}>四股名（変更 +{SCOUT_COST.SHIKONA}pt）</label>
                    <input
                      value={editedDraft.shikona}
                      onChange={(e) =>
                        setEditedDraft((prev) => (prev ? { ...prev, shikona: e.target.value } : prev))
                      }
                      className="w-full border-2 border-gold-muted/30 bg-black/30 px-4 py-3 text-text text-2xl ui-text-decoration outline-none focus:border-gold focus:bg-black/50 transition-all"
                    />
                  </div>

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
              <div className="washi-surface p-6 ink-border space-y-4 border-l-4 border-action">
                <div className="flex items-center gap-3 mb-2 border-b border-sumi/5 pb-2">
                  <Zap className="w-4 h-4 text-action" />
                  <h3 className="ui-text-label text-sm text-sumi">二、身体構造とキャリア</h3>
                </div>

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className={LABEL_CLASS}>体格（+{SCOUT_COST.BODY_TYPE}pt）</label>
                    <div className="grid grid-cols-4 gap-2">
                       {(Object.keys(CONSTANTS.BODY_TYPE_DATA) as BodyType[]).map((bt) => (
                         <button
                           key={bt}
                           type="button"
                           onClick={() => handleBodyTypeChange(bt)}
                           className={`py-2 text-[10px] ui-text-label border-2 transition-all ${
                             editedDraft.bodyType === bt 
                               ? 'border-action bg-action/10 text-action' 
                               : 'border-sumi/10 text-sumi/40 hover:border-action/40'
                           }`}
                         >
                           {CONSTANTS.BODY_TYPE_DATA[bt].name}
                         </button>
                       ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className={LABEL_CLASS}>
                      スキル枠（+{resolveTraitSlotCost(editedDraft.traitSlots)}pt）
                    </label>
                    <div className="flex gap-2">
                      {[0, 1, 2, 3, 4, 5].map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => handleTraitSlotsChange(slot)}
                          className={`flex-1 py-2 text-xs border-2 transition-all ${
                            editedDraft.traitSlots === slot
                              ? 'border-gold bg-gold/10 text-gold'
                              : 'border-sumi/10 text-sumi/40 hover:border-gold/40'
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>

                    {editedDraft.traitSlots > 0 && (
                      <div className="space-y-3 animate-in fade-in duration-300">
                        {activeTraitSlotDrafts.map((slotDraft) => (
                          <div key={slotDraft.slotIndex} className="bg-sumi/5 p-3 border border-sumi/10 space-y-2">
                            <p className="text-[10px] ui-text-label text-sumi/40 uppercase tracking-wider">
                              秘められし力 {slotDraft.slotIndex + 1}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {slotDraft.options.map((option) => {
                                const isSelected = slotDraft.selected === option;
                                return (
                                  <button
                                    key={`${slotDraft.slotIndex}-${option}`}
                                    type="button"
                                    onClick={() => handleTraitSelection(slotDraft.slotIndex, option)}
                                    className={`text-[10px] px-2 py-2 border-2 text-center transition-all ${
                                      isSelected
                                        ? "border-gold bg-gold text-white"
                                        : "border-sumi/10 bg-white/40 text-sumi/60 hover:border-gold/60"
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
                </div>
              </div>

              {/* カード 3: 資質と志し */}
              <div className="washi-surface p-6 ink-border space-y-4 border-l-4 border-brand-line bg-asanoha/5">
                <div className="flex items-center gap-3 mb-2 border-b border-sumi/5 pb-2">
                  <Coins className="w-4 h-4 text-brand-line" />
                  <h3 className="ui-text-label text-sm text-sumi">三、資質と志し</h3>
                </div>

                <div className="space-y-6">
                  {/* 素養 */}
                  <div className="space-y-2">
                    <label className={LABEL_CLASS}>素養（背景）</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(Object.keys(SCOUT_BACKGROUNDS) as ScoutBackgroundId[]).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setEditedDraft(prev => prev ? { ...prev, selectedBackgroundId: id } : prev)}
                          className={`px-2 py-2 text-[10px] border-2 transition-all ${
                            editedDraft.selectedBackgroundId === id
                              ? "border-brand-line bg-brand-line/10 text-brand-line"
                              : "border-sumi/10 text-sumi/40 hover:border-brand-line/30"
                          }`}
                        >
                          {SCOUT_BACKGROUNDS[id].name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 体質 */}
                  <div className="space-y-2">
                    <label className={LABEL_CLASS}>体質（肉体的特徴）</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(Object.keys(SCOUT_PHYSICAL_TRAITS) as ScoutPhysicalTraitId[]).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setEditedDraft(prev => prev ? { ...prev, selectedPhysicalTraitId: id } : prev)}
                          className={`px-2 py-2 text-[10px] border-2 transition-all ${
                            editedDraft.selectedPhysicalTraitId === id
                              ? "border-brand-line bg-brand-line/10 text-brand-line"
                              : "border-sumi/10 text-sumi/40 hover:border-brand-line/30"
                          }`}
                        >
                          {SCOUT_PHYSICAL_TRAITS[id].name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
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
                  <div className="mt-6 p-4 washi-surface ink-border bg-action/5 border-l-4 border-action animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex justify-between items-start mb-2">
                       <p className="text-[10px] ui-text-label text-action tracking-widest uppercase">{helpInfo.title}の補足</p>
                       <button onClick={() => setHelpInfo(null)} className="text-sumi/40 hover:text-sumi">×</button>
                    </div>
                    <p className="text-xs text-sumi/70 leading-relaxed italic">{helpInfo.text}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      {/* モバイル専用: 下部アクションバー (画面下部に固定) */}
      {editedDraft && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 p-4 bg-bg-panel/95 backdrop-blur-lg border-t-2 border-gold shadow-[0_-12px_32px_rgba(0,0,0,0.5)] safe-area-bottom">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] ui-text-label text-gold/60">構築費用</span>
              <span className="text-2xl ui-text-decoration text-text">{overrideCost.total}PT</span>
            </div>
            <Button
              size="lg"
              variant="primary"
              onClick={() => void handleRegister("skip_to_end")}
              disabled={isRegistering}
              className="flex-1 max-w-[200px] h-14 ui-text-decoration text-lg"
            >
              {isRegistering ? "入門中" : "入門させる"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
