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

// --- 共通スタイル定数 (プレミアム・ネオ和風) ---
const LABEL_CLASS = "text-xs ui-text-label text-gold/80 font-bold mb-2 flex items-center gap-2 uppercase tracking-[0.2em]";
const INPUT_CLASS = "w-full border-b border-gold/30 bg-gold/5 px-4 py-3 text-text text-base focus:border-gold focus:bg-gold/10 transition-all outline-none placeholder:text-text/20";
const SELECT_CLASS = "w-full border-b border-gold/30 bg-gold/5 px-4 py-3 text-text text-base focus:border-gold focus:bg-gold/10 transition-all outline-none appearance-none cursor-pointer";

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
        <div className="flex flex-col items-center justify-center py-20 min-h-[70vh] space-y-16 animate-in fade-in zoom-in duration-1000">
          {/* Majestic Header Section */}
          <div className="text-center space-y-8">
            <div className="flex items-center justify-center gap-6 mb-2">
              <span className="h-px w-16 bg-gradient-to-r from-transparent to-gold/40" />
              <p className="ui-text-label text-gold text-xs tracking-[0.5em] uppercase">Recruitment Portal</p>
              <span className="h-px w-16 bg-gradient-to-l from-transparent to-gold/40" />
            </div>
            <h2 className="text-5xl sm:text-8xl ui-text-heading text-text leading-tight drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
              一期一会の力士を<br />
              スカウトしよう。
            </h2>
            <p className="text-base sm:text-xl text-text-dim max-w-2xl mx-auto leading-relaxed opacity-80">
              相撲の歴史を塗り替える才能を、あなたの手で見つけ出す。<br />
              まずは「スカウト開始」ボタンを押して、新たな弟子を探しましょう。
            </p>
          </div>

          {/* Stats Bar (Premium Style) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 w-full max-w-5xl">
            {[
              { label: "所持ポイント", val: wallet?.points ?? "...", unit: "PT", note: `上限 ${wallet?.cap ?? 500}` },
              { label: "ポイント回復", val: wallet ? formatCountdown(wallet.nextRegenInSec) : "--:--", unit: "", note: "自動で貯まります" },
              { label: "スカウトコスト", val: SCOUT_COST.DRAW, unit: "PT", note: "1回につき消費" },
            ].map((card, i) => (
              <div key={i} className="premium-panel p-10 text-center group hover:translate-y-[-8px] transition-all duration-300 shadow-[0_15px_35px_rgba(0,0,0,0.4)]">
                <div className="corner-gold corner-top-left" />
                <div className="corner-gold corner-top-right" />
                <div className="corner-gold corner-bottom-left" />
                <div className="corner-gold corner-bottom-right" />
                <div className="text-[11px] ui-text-label text-gold/50 mb-4">{card.label}</div>
                <div className="text-4xl ui-text-heading text-text mb-2">
                  {card.val}<span className="text-sm ml-1 opacity-40 font-normal">{card.unit}</span>
                </div>
                <div className="text-[10px] text-text-faint italic opacity-60 tracking-wider text-gold/30">{card.note}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-8">
            <Button
              size="lg"
              onClick={handleDraw}
              disabled={!canDraw || isDrawing}
              className="group relative px-20 h-24 text-2xl ui-text-heading bg-gold text-bg font-bold overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-[0_10px_40px_rgba(212,175,55,0.4)] hover:shadow-[0_15px_60px_rgba(212,175,55,0.6)]"
            >
              <div className="absolute inset-0 bg-white/30 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              <div className="flex items-center gap-4 relative z-10">
                <RefreshCw className={`w-8 h-8 ${isDrawing ? "animate-spin" : ""}`} />
                <span className="tracking-[0.2em]">{isDrawing ? "探索中..." : "スカウトを開始する"}</span>
              </div>
            </Button>
            
            {errorMessage && (
              <p className="text-warning-bright text-sm animate-pulse ui-text-label tracking-widest">{errorMessage}</p>
            )}
            {!canDraw && !isDrawing && (
              <p className="text-text-faint text-xs italic tracking-widest">※ポイントが不足しています</p>
            )}
          </div>
        </div>
      )}

      {/* === 抽選後: 適応型レイアウト === */}
      {editedDraft && (
        <div className="lg:grid lg:grid-cols-[400px_1fr] lg:gap-10 items-start animate-in fade-in duration-500">
          {/* 左カラム: 力士プレビューとサマリー (DesktopではSticky) */}
          <aside className="lg:sticky lg:top-24 space-y-6 mb-8 lg:mb-0">
            <div className="premium-panel p-8 py-10 flex flex-col items-center justify-center text-center shadow-2xl relative animate-in zoom-in-95 duration-500">
              <div className="corner-gold corner-top-left" />
              <div className="corner-gold corner-top-right" />
              <div className="corner-gold corner-bottom-left" />
              <div className="corner-gold corner-bottom-right" />

              <div className="absolute top-6 right-8 text-[10px] ui-text-label text-gold/30 tracking-[0.3em]">
                NO. {editedDraft.shikona.charAt(0)}{editedDraft.profile.realName.length}-{Math.floor(Math.random() * 900) + 100}
              </div>
              
              <div className="mb-8 space-y-2">
                <div className="text-sm ui-text-label text-gold/60">
                  西之海部屋 スカウト候補
                </div>
                <h1 className="text-6xl sm:text-7xl ui-text-heading text-text tracking-widest drop-shadow-2xl py-2">
                  {editedDraft.shikona}
                </h1>
              </div>

              {/* 力士肖像画 */}
              <div className="relative h-[440px] w-full bg-gradient-to-b from-transparent via-gold/5 to-transparent overflow-hidden flex items-end justify-center border-y border-gold/10 my-4">
                <div className="absolute inset-0 bg-asanoha opacity-[0.05] pointer-events-none" />
                <RikishiPortrait 
                  bodyType={editedDraft.bodyType} 
                  className="h-full w-full drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)]"
                  innerClassName="bg-transparent border-none p-0 shadow-none"
                />
              </div>

              {/* 基本情報サマリー */}
              <div className="w-full mt-8 space-y-4">
                <div className="inline-block px-6 py-2 bg-gold/20 border border-gold/40 text-text ui-text-label text-xs tracking-[0.3em]">
                  {CONSTANTS.TALENT_ARCHETYPES[editedDraft.archetype].name}
                </div>
                
                <div className="grid grid-cols-1 gap-1 text-left">
                  {[
                    { key: "本名", val: editedDraft.profile.realName || "不明" },
                    { key: "生国", val: editedDraft.profile.birthplace || "日本" },
                    { key: "性格", val: PERSONALITY_LABELS[editedDraft.profile.personality] },
                    { key: "体格", val: `${CONSTANTS.BODY_TYPE_DATA[editedDraft.bodyType].name} (${editedDraft.bodyMetrics.heightCm}cm / ${editedDraft.bodyMetrics.weightKg}kg)` }
                  ].map((row) => (
                    <div key={row.key} className="flex justify-between items-center text-xs py-3 border-b border-gold/10">
                      <span className="ui-text-label text-gold/50">{row.key}</span>
                      <span className="text-text font-bold">{row.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* モバイル表示時のアクションバーは別出しにするが、デスクトップではここにコストを表示 */}
            <div className="hidden lg:block premium-panel p-6 border-gold/30 bg-gold/5">
              <div className="flex justify-between items-end mb-6">
                <div className="space-y-1">
                   <p className="text-[10px] ui-text-label text-gold/40">変更コスト 合計</p>
                   <p className="text-5xl ui-text-heading text-text">
                     {overrideCost.total}<span className="text-sm ml-2 opacity-60">PT</span>
                   </p>
                </div>
                <div className="text-right text-[10px] text-gold/40 italic">
                  現在の残高: {wallet?.points ?? "..."}pt
                </div>
              </div>
                <Button
                  size="lg"
                  onClick={() => void handleRegister()}
                  disabled={isRegistering}
                  className="w-full h-16 text-xl ui-text-heading bg-gold/80 text-bg shadow-2xl border-none hover:bg-gold"
                >
                  <Trophy className="w-6 h-6 mr-3 relative z-10" />
                  <span className="relative z-10 font-bold">{isRegistering ? "入門手続き中..." : "この内容で入門させる"}</span>
                </Button>
              </div>
            </aside>

          {/* 右カラム: 各種調整フォーム */}
          <div className="space-y-8">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="h-4 w-1 bg-gold" />
                <h3 className="ui-text-label text-gold-bright text-sm tracking-widest uppercase">新弟子の調整</h3>
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
              <div className="premium-panel p-6 border-gold/10 space-y-4 border-l-4 border-gold shadow-lg">
                <div className="corner-gold corner-top-left" />
                <div className="corner-gold corner-top-right" />
                <div className="flex items-center gap-3 mb-2 border-b border-gold/10 pb-2">
                  <User className="w-4 h-4 text-gold/60" />
                  <h3 className="ui-text-label text-sm text-gold font-bold">1. 基本プロフィール</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className={LABEL_CLASS}>四股名（変更 +{SCOUT_COST.SHIKONA}pt）</label>
                    <input
                      value={editedDraft.shikona}
                      onChange={(e) =>
                        setEditedDraft((prev) => (prev ? { ...prev, shikona: e.target.value } : prev))
                      }
                      className="w-full border-b-2 border-gold/40 bg-white/5 px-4 py-3 text-text text-2xl ui-text-heading outline-none focus:border-gold focus:bg-white/10 transition-all"
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

              {/* カード 2: 体格とスタイル */}
              <div className="premium-panel p-6 border-gold/10 space-y-4 border-l-4 border-secondary shadow-lg">
                <div className="corner-gold corner-top-left" />
                <div className="corner-gold corner-top-right" />
                <div className="flex items-center gap-3 mb-2 border-b border-gold/10 pb-2">
                  <Zap className="w-4 h-4 text-secondary/70" />
                  <h3 className="ui-text-label text-sm text-gold font-bold">2. 体格とスタイル</h3>
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
                               ? 'border-gold bg-gold/20 text-text ring-1 ring-gold/40' 
                               : 'border-gold/10 text-text/40 hover:border-gold/40'
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
                                ? 'border-gold bg-gold/20 text-text ring-1 ring-gold/40'
                                : 'border-gold/10 text-text/40 hover:border-gold/40'
                            }`}
                          >
                            {slot}
                          </button>
                      ))}
                    </div>

                    {editedDraft.traitSlots > 0 && (
                      <div className="space-y-3 animate-in fade-in duration-300">
                        {activeTraitSlotDrafts.map((slotDraft) => (
                          <div key={slotDraft.slotIndex} className="bg-bg/40 p-3 border border-gold/10 space-y-2">
                             <p className="text-[10px] ui-text-label text-gold/60 uppercase tracking-wider">
                               スキル枠 {slotDraft.slotIndex + 1}
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
                                        ? "border-gold bg-gold/20 text-text"
                                        : "border-gold/10 bg-bg/20 text-text/40 hover:border-gold/40"
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

              {/* カード 3: 素養と目標 */}
              <div className="premium-panel p-6 border-gold/10 space-y-4 border-l-4 border-brand-line shadow-lg">
                <div className="corner-gold corner-top-left" />
                <div className="corner-gold corner-top-right" />
                <div className="flex items-center gap-3 mb-2 border-b border-gold/10 pb-2">
                  <Coins className="w-4 h-4 text-brand-line" />
                  <h3 className="ui-text-label text-sm text-gold font-bold">3. 素養と目標</h3>
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
                          className={`px-2 py-2 text-xs border-2 transition-all ${
                            editedDraft.selectedBackgroundId === id
                              ? "border-brand-line bg-brand-line/20 text-brand-line"
                              : "border-gold/10 text-text/40 hover:border-brand-line/40"
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
                          className={`px-2 py-2 text-xs border-2 transition-all ${
                            editedDraft.selectedPhysicalTraitId === id
                              ? "border-brand-line bg-brand-line/20 text-brand-line"
                              : "border-gold/10 text-text/40 hover:border-brand-line/40"
                          }`}
                        >
                          {SCOUT_PHYSICAL_TRAITS[id].name}
                        </button>
                      ))}
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
                </div>

                <div className="corner-gold corner-bottom-left" />
                <div className="corner-gold corner-bottom-right" />

                {helpInfo && helpInfo.title !== "相撲型" && (
                  <div className="mt-6 p-4 washi-surface border-gold/20 bg-bg-panel/60 border-l-4 border-gold shadow-lg animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex justify-between items-start mb-2">
                       <p className="text-[10px] ui-text-label text-gold tracking-widest uppercase">{helpInfo.title}について</p>
                       <button onClick={() => setHelpInfo(null)} className="text-text/40 hover:text-text">×</button>
                    </div>
                    <p className="text-xs text-text/70 leading-relaxed italic">{helpInfo.text}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* モバイル専用: 下部アクションバー (画面下部に固定) */}
      {editedDraft && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 p-4 bg-bg-panel/95 backdrop-blur-lg border-t-2 border-gold shadow-[0_-12px_32px_rgba(0,0,0,0.5)] safe-area-bottom">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] ui-text-label text-gold/60">必要ポイント</span>
              <span className="text-2xl ui-text-metric text-text">{overrideCost.total}PT</span>
            </div>
            <Button
              size="lg"
              variant="primary"
              onClick={() => void handleRegister("skip_to_end")}
              disabled={isRegistering}
              className="flex-1 max-w-[200px] h-14 ui-text-heading text-lg"
            >
              {isRegistering ? "入門中..." : "入門させる"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
