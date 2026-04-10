import React from "react";
import { Archive, LibraryBig, ScrollText, Settings, Waypoints } from "lucide-react";
import { Button } from "../../../shared/ui/Button";

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

const HomeCard: React.FC<{
  title: string;
  body: string;
  icon: React.ReactNode;
  actionLabel: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}> = ({ title, body, icon, actionLabel, onClick, variant = "secondary" }) => (
  <article className="surface-panel space-y-4">
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-2">
        <div className="app-kicker">{title}</div>
        <p className="text-sm text-text-dim">{body}</p>
      </div>
      <div className="flex h-10 w-10 items-center justify-center border border-gold/15 bg-bg/20 text-gold">
        {icon}
      </div>
    </div>
    <Button variant={variant === "primary" ? "primary" : "secondary"} onClick={onClick}>
      {actionLabel}
    </Button>
  </article>
);

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
}) => (
  <div className="mx-auto max-w-6xl space-y-6">
    <section className="surface-panel space-y-5">
      <div className="space-y-3">
        <div className="app-kicker">ホーム</div>
        <h2 className="text-3xl ui-text-heading text-text">次に開く帳面を選ぶ</h2>
        <p className="max-w-3xl text-sm text-text-dim">
          新弟子を作る、保存済み記録を読む、資料館を見返す。入口をここに集約します。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="border border-gold/15 bg-bg/20 px-4 py-4">
          <div className="text-[10px] ui-text-label tracking-[0.35em] text-gold/55 uppercase">保存済み記録</div>
          <div className="mt-2 text-2xl ui-text-heading text-text">{savedCount}</div>
        </div>
        <div className="border border-gold/15 bg-bg/20 px-4 py-4">
          <div className="text-[10px] ui-text-label tracking-[0.35em] text-gold/55 uppercase">未保存の一代</div>
          <div className="mt-2 text-2xl ui-text-heading text-text">{unshelvedCount}</div>
        </div>
        <div className="border border-gold/15 bg-bg/20 px-4 py-4">
          <div className="text-[10px] ui-text-label tracking-[0.35em] text-gold/55 uppercase">現在の注目</div>
          <div className="mt-2 text-xl ui-text-heading text-text">{currentShikona ?? "未選択"}</div>
        </div>
      </div>

      {onResume && resumeLabel ? (
        <div className="flex flex-col gap-3 border border-white/10 bg-white/[0.02] px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="app-kicker">続きから</div>
            <div className="mt-2 text-sm text-text-dim">
              {currentShikona ? `${currentShikona}の記録を続きから開けます。` : "前回の続きへ戻れます。"}
            </div>
          </div>
          <Button onClick={onResume}>
            <Waypoints className="mr-2 h-4 w-4" />
            {resumeLabel}
          </Button>
        </div>
      ) : null}
    </section>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <HomeCard
        title="新弟子設計"
        body="入口の条件を決めて、新しい相撲人生を始めます。"
        icon={<ScrollText className="h-5 w-5" />}
        actionLabel="新弟子設計へ"
        onClick={onOpenScout}
        variant="primary"
      />
      <HomeCard
        title="保存済み記録"
        body="残しておいた一代を読み返します。"
        icon={<Archive className="h-5 w-5" />}
        actionLabel="保存済み記録へ"
        onClick={onOpenArchive}
      />
      <HomeCard
        title="資料館"
        body="解放済みの記録や決まり手をまとめて確認します。"
        icon={<LibraryBig className="h-5 w-5" />}
        actionLabel="資料館へ"
        onClick={onOpenCollection}
      />
      <HomeCard
        title="設定"
        body="保存データの整理や全削除を行います。"
        icon={<Settings className="h-5 w-5" />}
        actionLabel="設定へ"
        onClick={onOpenSettings}
      />
    </section>
  </div>
);
