import React from "react";
import { Archive, BookOpenText, FlaskConical, LayoutGrid, ScrollText } from "lucide-react";

export type AppSection = "scout" | "career" | "archive" | "collection" | "logicLab";

interface AppShellProps {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  title: string;
  subtitle: string;
  statusLine?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  showLogicLab?: boolean;
}

const NAV_ITEMS: Array<{
  id: AppSection;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "scout", label: "新弟子", shortLabel: "新弟子", icon: ScrollText },
  { id: "career", label: "力士結果", shortLabel: "結果", icon: BookOpenText },
  { id: "archive", label: "保存済み記録", shortLabel: "保存済み", icon: Archive },
  { id: "collection", label: "図鑑", shortLabel: "図鑑", icon: LayoutGrid },
  { id: "logicLab", label: "ロジック検証", shortLabel: "検証", icon: FlaskConical },
];

export const AppShell: React.FC<AppShellProps> = ({
  activeSection,
  onSectionChange,
  title,
  subtitle,
  statusLine,
  actions,
  children,
  showLogicLab = false,
}) => {
  const visibleItems = showLogicLab
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.id !== "logicLab");

  return (
    <div className="min-h-screen bg-app text-text">
      <div className="mx-auto flex min-h-screen max-w-[1600px] relative">
        {/* サイドバー: デスクトップ用 (スリムかつ洗練されたデザイン) */}
        <aside className="app-sidebar hidden lg:flex flex-col bg-asanoha border-r-2 border-gold/15 sticky top-0 h-screen overflow-y-auto">
          <div className="space-y-8">
            <button
              type="button"
              className="group text-left transition-all hover:translate-x-1"
              onClick={() => onSectionChange("scout")}
            >
              <div className="app-kicker text-gold/60 mb-1">相撲シミュレーション</div>
              <div className="text-3xl ui-text-decoration text-text leading-tight drop-shadow-sm">横綱メーカー</div>
              <div className="mt-2 h-0.5 w-12 bg-gold/40 group-hover:w-20 transition-all" />
            </button>
 
            <nav className="space-y-3" aria-label="主要ナビゲーション">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`
                      flex w-full items-center gap-4 px-4 py-3.5 transition-all duration-200
                      border-2 ${isActive ? 'border-gold bg-gold/15 text-gold shadow-[0_0_10px_rgba(212,175,55,0.15)]' : 'border-gold-muted/20 bg-bg/40 text-text-dim hover:border-gold/50 hover:text-text'}
                    `}
                    onClick={() => onSectionChange(item.id)}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? 'animate-pulse' : ''}`} />
                    <span className="ui-text-label text-sm tracking-wider">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto pt-8 border-t border-gold-muted/10">
            <div className="text-[10px] ui-text-label text-text-faint italic leading-relaxed">
              &copy; 2026 Advanced Agentic Coding.<br />Sumo-Maker Version 2.0
            </div>
          </div>
        </aside>
 
        <div className="flex min-w-0 flex-1 flex-col transition-all duration-300">
          {/* コンテキストバー: ヘッダーの統合と整理 */}
          <header className="context-bar sticky top-0 z-50 px-4 py-4 sm:px-8 border-b-2 border-gold/15 bg-bg/90 backdrop-blur-md">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="h-px w-4 bg-gold/40" />
                  <div className="app-kicker text-gold/60">{title}</div>
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl ui-text-decoration text-text truncate">
                  {title}
                </h1>
                <p className="mt-1 max-w-4xl text-xs sm:text-sm leading-relaxed text-text-dim line-clamp-1">
                  {subtitle}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {statusLine && (
                  <div className="px-3 py-1.5 bg-gold/5 border border-gold/20 ui-text-label text-[10px] text-gold/80 hidden lg:block">
                    {statusLine}
                  </div>
                )}
                {actions}
              </div>
            </div>
          </header>
 
          {/* メインコンテンツ領域 */}
          <main className="flex-1 px-4 pb-28 pt-8 sm:px-8 lg:px-12 lg:pb-12 bg-bg-light/10 bg-seigaiha">
            <div className="mx-auto max-w-6xl animate-in fade-in duration-500">
              {children}
            </div>
          </main>
        </div>
      </div>
 
      {/* モバイルボトムナビ: 洗練された和風ドットデザイン */}
      <nav className="mobile-bottom-nav lg:hidden fixed bottom-0 left-0 right-0 z-50 grid grid-cols-5 gap-1 border-t-2 border-gold bg-bg-panel/95 backdrop-blur-lg px-2 pt-2 pb-safe-area shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`
                flex flex-col items-center gap-1.5 py-3 transition-all duration-200
                border-t-2 ${isActive ? 'border-gold text-gold bg-gold/10' : 'border-transparent text-text-dim'}
              `}
              onClick={() => onSectionChange(item.id)}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'scale-110' : ''}`} />
              <span className="text-[9px] ui-text-label tracking-tighter uppercase">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
