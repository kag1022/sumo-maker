import React from "react";
import { Archive, LibraryBig, ScrollText, Settings, Waypoints } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "../../../shared/ui/Button";
import { StatCard } from "../../../shared/ui/StatCard";
import { cn } from "../../../shared/lib/cn";
import { useLocale } from "../../../shared/hooks/useLocale";
import type { LocaleCode } from "../../../shared/lib/locale";
import typography from "../../../shared/styles/typography.module.css";
import styles from "./HomeScreen.module.css";

interface HomeScreenProps {
  savedCount: number;
  lifetimeCount: number;
  currentShikona?: string | null;
  resumeLabel?: string;
  onResume?: () => void;
  onOpenScout: () => void;
  onOpenArchive: () => void;
  onOpenCollection: () => void;
  onOpenSettings: () => void;
}

const NAV_CARDS: Array<{
  title: Record<LocaleCode, string>;
  body: Record<LocaleCode, string>;
  icon: React.ComponentType<{ className?: string }>;
  actionLabel: Record<LocaleCode, string>;
  key: string;
}> = [
  {
    key: "scout",
    title: { ja: "観測する", en: "Observe" },
    body: {
      ja: "観測テーマとビルド設定で方向性を少し寄せ、新しい相撲人生を観測する。結果は保証されない。",
      en: "Set a theme and optional build hints, then observe a new sumo career. Nothing is guaranteed.",
    },
    icon: ScrollText,
    actionLabel: { ja: "観測設計へ", en: "Open setup" },
  },
  {
    key: "archive",
    title: { ja: "保存済み記録", en: "Archive" },
    body: {
      ja: "残しておいた一代を読み返す。戦績・番付推移・宿敵関係を読む。",
      en: "Reopen saved careers and review records, rank movement, and rivalries.",
    },
    icon: Archive,
    actionLabel: { ja: "記録を開く", en: "Open records" },
  },
  {
    key: "collection",
    title: { ja: "記録 / 偉業", en: "Records" },
    body: {
      ja: "解放済みの決まり手・実績・希少記録をまとめて確認する。",
      en: "Review unlocked kimarite, achievements, and rare records.",
    },
    icon: LibraryBig,
    actionLabel: { ja: "記録を開く", en: "Open records" },
  },
  {
    key: "settings",
    title: { ja: "設定", en: "Settings" },
    body: {
      ja: "テーマの切り替えや保存データの管理を行う。",
      en: "Change theme, language, and local data settings.",
    },
    icon: Settings,
    actionLabel: { ja: "設定へ", en: "Open settings" },
  },
];

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.07 } } },
  item: {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.24 } },
  },
};

export const HomeScreen: React.FC<HomeScreenProps> = ({
  savedCount,
  lifetimeCount,
  currentShikona,
  resumeLabel,
  onResume,
  onOpenScout,
  onOpenArchive,
  onOpenCollection,
  onOpenSettings,
}) => {
  const { locale } = useLocale();
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
        className={cn(styles.hero, "relative overflow-hidden border border-[var(--ui-brand-line)]/22 px-8 py-10 sm:px-10 sm:py-12")}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
      >
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
        <div className="absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b from-[var(--ui-brand-line)]/60 via-[var(--ui-brand-line)]/30 to-transparent" />
        <div className="relative">
          <div className="mb-4 inline-flex items-center gap-2 border border-[var(--ui-brand-line)]/25 bg-[var(--ui-brand-line)]/8 px-3 py-1.5">
            <span className={cn(typography.label, "text-[9px] tracking-[0.45em] text-[var(--ui-brand-line)] uppercase")}>
              {locale === "en" ? "SUMO MAKER · CAREER RECORDS" : "相撲記録帳 · SUMO MAKER"}
            </span>
          </div>
          <h2 className={cn(typography.heading, "text-3xl sm:text-4xl lg:text-5xl text-text leading-tight tracking-wide")}>
            {locale === "en" ? (
              <>Read one rikishi's life<br />as a career record.</>
            ) : (
              <>一人の力士の一生を、<br />記録として読む。</>
            )}
          </h2>
          <p className="mt-4 max-w-xl text-sm sm:text-base text-text-dim leading-relaxed">
            {locale === "en"
              ? "Choose an observation theme, nudge the starting conditions, and watch a full sumo career resolve into ranks, records, rivals, and injuries."
              : "観測テーマとビルド設定で方向性を少し寄せ、一人の相撲人生を観測する。番付・戦績・宿敵・怪我——整理された記録から人物像が立ち上がる。"}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" onClick={onOpenScout}>
              <ScrollText className="mr-2 h-4 w-4" />
              {locale === "en" ? "Start Observation" : "観測を始める"}
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

      {/* KPI */}
      <motion.div
        className="grid gap-4 sm:grid-cols-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.08 }}
      >
        <StatCard
          label={locale === "en" ? "Saved Records" : "保存済み記録"}
          value={savedCount}
          subtext={locale === "en" ? "Careers to reread" : "読み返せる一代"}
          tone="gold"
        />
        <StatCard
          label={locale === "en" ? "Observed Careers" : "観測した一代"}
          value={lifetimeCount}
          subtext={lifetimeCount > 0
            ? locale === "en" ? "All-time careers" : "これまでの一代"
            : locale === "en" ? "Start observing" : "観測を始めてみる"}
          tone={lifetimeCount > 0 ? "action" : "default"}
        />
        <StatCard
          label={locale === "en" ? "Current Focus" : "現在の注目"}
          value={currentShikona ?? "—"}
          subtext={currentShikona
            ? locale === "en" ? "Viewing career" : "キャリア閲覧中"
            : locale === "en" ? "Start from setup" : "観測設計から開始"}
        />
      </motion.div>

      {/* Resume banner */}
      {onResume && resumeLabel && currentShikona ? (
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, delay: 0.14 }}
          className={cn(styles.resumeBanner, "flex flex-col gap-4 border border-[var(--ui-brand-line)]/30 px-6 py-5 sm:flex-row sm:items-center sm:justify-between")}
        >
          <div>
            <div className={cn(typography.label, "mb-2 text-[9px] tracking-[0.4em] text-[var(--ui-brand-line)]/60 uppercase")}>{locale === "en" ? "Resume" : "続きから"}</div>
            <div className={cn(typography.heading, "text-lg text-text")}>{currentShikona}</div>
            <div className="mt-1 text-sm text-text-dim">{locale === "en" ? "Continue from the previous record." : "前回の記録を続きから開けます。"}</div>
          </div>
          <Button variant="secondary" onClick={onResume}>
            <Waypoints className="mr-2 h-4 w-4" />
            {resumeLabel}
          </Button>
        </motion.div>
      ) : null}

      {/* Nav cards */}
      <div>
        <div className={cn(typography.label, "mb-4 text-[9px] tracking-[0.4em] text-[var(--ui-brand-line)]/50 uppercase")}>
          {locale === "en" ? "Menu" : "メニュー"}
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
                className={cn(styles.navCard, "group flex flex-col justify-between gap-5 border p-6 transition-all duration-200")}
                variants={stagger.item}
              >
                <div className="space-y-3">
                  <div className={cn(styles.navCardIcon, "flex h-10 w-10 items-center justify-center border border-[var(--ui-brand-line)]/25 bg-[var(--ui-brand-line)]/8 transition-colors group-hover:border-[var(--ui-brand-line)]/40")}>
                    <Icon className="h-5 w-5 text-[var(--ui-brand-line)]/70" />
                  </div>
                  <div className={cn(typography.heading, "text-sm text-text")}>{card.title[locale]}</div>
                  <p className="text-xs text-text-dim leading-relaxed">{card.body[locale]}</p>
                </div>
                <button
                  type="button"
                  className={cn(styles.navAction, typography.label, "w-full px-3 py-2 text-xs transition-all tracking-wide")}
                  onClick={handlers[card.key]}
                >
                  {card.actionLabel[locale]} →
                </button>
              </motion.article>
            );
          })}
        </motion.section>
      </div>
    </div>
  );
};
