import React from "react";
import { Archive, LibraryBig, ScrollText, Settings, Waypoints } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "../../../shared/ui/Button";
import { StatCard } from "../../../shared/ui/StatCard";

interface HomeScreenProps {
  savedCount: number;
  unshelvedCount: number;
  currentShikona?: string | null;
  resumeLabel?: string;
  onResume?: () => void;
  onOpenScout: () => void;
  onOpenArchive: () => void;
  onOpenCollection: () => void;
  onOpenSettings: () => void;
}

const NAV_CARDS: Array<{
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
  actionLabel: string;
  key: string;
  accent?: string;
}> = [
  {
    key: "scout",
    title: "新弟子設計",
    body: "入口の条件を決め、新しい相撲人生を始める。体格・気質・出自から一人の力士像を作る。",
    icon: ScrollText,
    actionLabel: "新弟子設計へ",
    accent: "border-[var(--ui-brand-line)]/30 hover:border-[var(--ui-brand-line)]/50",
  },
  {
    key: "archive",
    title: "保存済み記録",
    body: "残しておいた一代を読み返す。戦績・番付推移・宿敵関係を読む。",
    icon: Archive,
    actionLabel: "記録を開く",
    accent: "border-[var(--ui-action)]/20 hover:border-[var(--ui-action)]/35",
  },
  {
    key: "collection",
    title: "資料館",
    body: "解放済みの決まり手・実績・希少記録をまとめて確認する。",
    icon: LibraryBig,
    actionLabel: "資料館を開く",
    accent: "border-[var(--chart-makushita)]/20 hover:border-[var(--chart-makushita)]/35",
  },
  {
    key: "settings",
    title: "設定",
    body: "保存データの整理や全削除を行う。",
    icon: Settings,
    actionLabel: "設定へ",
    accent: "border-white/10 hover:border-white/18",
  },
];

const stagger = {
  container: {
    animate: { transition: { staggerChildren: 0.07 } },
  },
  item: {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.24 } },
  },
};

export const HomeScreen: React.FC<HomeScreenProps> = ({
  savedCount,
  unshelvedCount,
  currentShikona,
  resumeLabel,
  onResume,
  onOpenScout,
  onOpenArchive,
  onOpenCollection,
  onOpenSettings,
}) => {
  const handlers: Record<string, () => void> = {
    scout: onOpenScout,
    archive: onOpenArchive,
    collection: onOpenCollection,
    settings: onOpenSettings,
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.section
        className="relative overflow-hidden border border-[var(--ui-brand-line)]/22 px-8 py-10 sm:px-10 sm:py-12"
        style={{
          background:
            "linear-gradient(135deg, rgba(12,18,26,0.95) 0%, rgba(16,22,32,0.92) 50%, rgba(10,14,20,0.98) 100%)",
        }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
      >
        {/* Radial glows */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute -top-16 -right-16 h-72 w-72 rounded-full opacity-15 blur-3xl"
            style={{ background: "radial-gradient(circle, var(--ui-brand-line), transparent 70%)" }}
          />
          <div
            className="absolute -bottom-8 -left-8 h-48 w-48 rounded-full opacity-10 blur-3xl"
            style={{ background: "radial-gradient(circle, var(--ui-action), transparent 70%)" }}
          />
        </div>
        {/* Gold left accent line */}
        <div className="absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b from-[var(--ui-brand-line)]/60 via-[var(--ui-brand-line)]/30 to-transparent" />

        <div className="relative">
          <div className="mb-4 inline-flex items-center gap-2 border border-[var(--ui-brand-line)]/25 bg-[var(--ui-brand-line)]/8 px-3 py-1.5">
            <span className="text-[9px] ui-text-label tracking-[0.45em] text-[var(--ui-brand-line)] uppercase">
              相撲記録帳 · SUMO MAKER
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl ui-text-heading text-text leading-tight tracking-wide">
            一人の力士の一生を、<br />記録として読む。
          </h2>
          <p className="mt-4 max-w-xl text-sm sm:text-base text-text-dim leading-relaxed">
            新弟子の出自と素地を設計し、フルキャリアを即座にシミュレートする。
            番付・戦績・宿敵・怪我——整理された記録から人物像が立ち上がる。
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" onClick={onOpenScout}>
              <ScrollText className="mr-2 h-4 w-4" />
              新弟子設計を始める
            </Button>
            {onResume && resumeLabel ? (
              <Button variant="secondary" size="lg" onClick={onResume}>
                <Waypoints className="mr-2 h-4 w-4" />
                {resumeLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </motion.section>

      {/* KPI strip */}
      <motion.div
        className="grid gap-4 sm:grid-cols-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.08 }}
      >
        <StatCard
          label="保存済み記録"
          value={savedCount}
          subtext="読み返せる一代"
          tone="gold"
        />
        <StatCard
          label="未保存の一代"
          value={unshelvedCount}
          subtext={unshelvedCount > 0 ? "まだシミュレーション中" : "進行中なし"}
          tone={unshelvedCount > 0 ? "action" : "default"}
        />
        <StatCard
          label="現在の注目"
          value={currentShikona ?? "—"}
          subtext={currentShikona ? "キャリア閲覧中" : "新弟子設計から開始"}
        />
      </motion.div>

      {/* Resume banner */}
      {onResume && resumeLabel && currentShikona ? (
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, delay: 0.14 }}
          className="flex flex-col gap-4 border border-[var(--ui-brand-line)]/30 bg-[var(--ui-brand-line)]/6 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div className="text-[9px] ui-text-label tracking-[0.4em] text-[var(--ui-brand-line)]/60 uppercase mb-2">
              続きから
            </div>
            <div className="text-lg ui-text-heading text-text">{currentShikona}</div>
            <div className="mt-1 text-sm text-text-dim">前回の記録を続きから開けます。</div>
          </div>
          <Button variant="secondary" onClick={onResume}>
            <Waypoints className="mr-2 h-4 w-4" />
            {resumeLabel}
          </Button>
        </motion.div>
      ) : null}

      {/* Nav cards */}
      <div>
        <div className="mb-4 text-[9px] ui-text-label tracking-[0.4em] text-[var(--ui-brand-line)]/50 uppercase">
          メニュー
        </div>
        <motion.section
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          variants={stagger.container}
          initial="initial"
          animate="animate"
        >
          {NAV_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <motion.article
                key={card.key}
                className={`group flex flex-col justify-between gap-5 border bg-[rgba(14,20,28,0.7)] p-6 transition-all duration-200 hover:bg-[rgba(16,22,30,0.85)] ${card.accent ?? "border-white/10"}`}
                variants={stagger.item}
              >
                <div className="space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center border border-[var(--ui-brand-line)]/25 bg-[var(--ui-brand-line)]/8 transition-colors group-hover:border-[var(--ui-brand-line)]/40">
                    <Icon className="h-5 w-5 text-[var(--ui-brand-line)]/70" />
                  </div>
                  <div className="text-sm ui-text-heading text-text">{card.title}</div>
                  <p className="text-xs text-text-dim leading-relaxed">{card.body}</p>
                </div>
                <button
                  type="button"
                  className="w-full border border-white/12 bg-white/[0.03] px-3 py-2 text-xs text-text-dim transition-all hover:border-[var(--ui-brand-line)]/30 hover:text-text ui-text-label tracking-wide"
                  onClick={handlers[card.key]}
                >
                  {card.actionLabel} →
                </button>
              </motion.article>
            );
          })}
        </motion.section>
      </div>
    </div>
  );
};
