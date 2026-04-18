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
  variant?: "primary" | "secondary";
}> = [
  {
    key: "scout",
    title: "新弟子設計",
    body: "入口の条件を決め、新しい相撲人生を始める。体格・気質・出自から一人の力士像を作る。",
    icon: ScrollText,
    actionLabel: "新弟子設計へ →",
    variant: "primary",
  },
  {
    key: "archive",
    title: "保存済み記録",
    body: "残しておいた一代を読み返す。戦績・番付推移・宿敵関係を読む。",
    icon: Archive,
    actionLabel: "保存済み記録を開く",
  },
  {
    key: "collection",
    title: "資料館",
    body: "解放済みの決まり手・実績・希少記録をまとめて確認する。",
    icon: LibraryBig,
    actionLabel: "資料館を開く",
  },
  {
    key: "settings",
    title: "設定",
    body: "保存データの整理や全削除を行う。",
    icon: Settings,
    actionLabel: "設定へ",
  },
];

const stagger = {
  container: { transition: { staggerChildren: 0.06 } },
  item: { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22 } },
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
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.section
        className="relative overflow-hidden border border-[var(--ui-brand-line)]/20 bg-gradient-to-br from-[#0d1520] to-[#0a0f14] px-6 py-8 sm:px-8 sm:py-10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 h-48 w-48 rounded-full bg-[var(--ui-brand-line)]/5 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-[var(--ui-action)]/5 blur-3xl" />
        </div>

        <div className="relative space-y-4">
          <div>
            <div className="text-[10px] ui-text-label tracking-[0.45em] text-[var(--ui-brand-line)]/55 uppercase mb-2">
              相撲記録帳
            </div>
            <h2 className="text-3xl sm:text-4xl ui-text-heading text-text leading-tight">
              一人の力士の一生を、<br className="sm:hidden" />記録として読む。
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-text-dim leading-relaxed">
              新弟子の出自と素地を設計し、フルキャリアを即座にシミュレートする。
              番付・戦績・宿敵・怪我——整理された記録から人物像が立ち上がる。
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
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

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="保存済み記録"
          value={savedCount}
          subtext="読み返せる一代"
          tone="gold"
        />
        <StatCard
          label="未保存の一代"
          value={unshelvedCount}
          subtext="まだ残している"
          tone={unshelvedCount > 0 ? "action" : "default"}
        />
        <StatCard
          label="現在の注目"
          value={currentShikona ?? "未選択"}
          subtext={currentShikona ? "キャリア閲覧中" : "新弟子設計から開始"}
        />
      </div>

      {onResume && resumeLabel && currentShikona ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.1 }}
          className="flex flex-col gap-3 border border-[var(--ui-brand-line)]/25 bg-[var(--ui-brand-line)]/5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div className="text-[10px] ui-text-label tracking-[0.35em] text-[var(--ui-brand-line)]/55 uppercase mb-1">
              続きから
            </div>
            <div className="text-base ui-text-heading text-text">{currentShikona}</div>
            <div className="mt-0.5 text-sm text-text-dim">前回の記録を続きから開けます。</div>
          </div>
          <Button variant="secondary" onClick={onResume}>
            <Waypoints className="mr-2 h-4 w-4" />
            {resumeLabel}
          </Button>
        </motion.div>
      ) : null}

      <motion.section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        variants={stagger.container}
        initial="initial"
        animate="animate"
      >
        {NAV_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <motion.article
              key={card.key}
              className="flex flex-col justify-between gap-4 border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-white/15 hover:bg-white/[0.03]"
              variants={stagger.item}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] ui-text-label tracking-[0.35em] text-[var(--ui-brand-line)]/55 uppercase">
                    {card.title}
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center border border-[var(--ui-brand-line)]/20 text-[var(--ui-brand-line)]/60">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="text-sm text-text-dim leading-relaxed">{card.body}</p>
              </div>
              <Button
                variant={card.variant === "primary" ? "primary" : "secondary"}
                onClick={handlers[card.key]}
              >
                {card.actionLabel}
              </Button>
            </motion.article>
          );
        })}
      </motion.section>
    </div>
  );
};
