import React from "react";
import { Archive, BookOpenText, FlaskConical, LayoutGrid, ScrollText } from "lucide-react";

export type AppSection = "scout" | "career" | "archive" | "collection" | "logicLab";

interface AppShellProps {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  title?: string;
  subtitle?: string;
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
  { id: "scout", label: "新弟子設計", shortLabel: "設計", icon: ScrollText },
  { id: "career", label: "力士記録", shortLabel: "記録", icon: BookOpenText },
  { id: "archive", label: "保存済み記録", shortLabel: "保存", icon: Archive },
  { id: "collection", label: "資料館", shortLabel: "資料", icon: LayoutGrid },
  { id: "logicLab", label: "テスト・検証", shortLabel: "検証", icon: FlaskConical },
];

export const AppShell: React.FC<AppShellProps> = ({
  activeSection,
  onSectionChange,
  title: customTitle,
  subtitle: customSubtitle,
  statusLine,
  actions,
  children,
  showLogicLab = false,
}) => {
  const defaultTitles: Record<string, string> = {
    scout: "新弟子設計",
    career: "力士記録",
    archive: "保存済み記録",
    collection: "資料館",
    logicLab: "論理検証",
  };

  const title = customTitle || defaultTitles[activeSection] || "横綱メーカー";
  const subtitle = customSubtitle || (activeSection === "career" ? "記録を読む" : "Sumo Life Archive");

  const visibleItems = NAV_ITEMS.filter((item) =>
    item.id === "logicLab" ? (showLogicLab || activeSection === "logicLab") : true
  );

  return (
    <div className="flex min-h-screen bg-bg font-sans text-text selection:bg-gold/30 selection:text-gold-light">
      {/* サイドバー: 洗練されたデスクトップ向けナビ */}
      <aside className="app-sidebar sticky top-0 hidden h-screen flex-col border-r-2 border-gold/15 bg-bg-panel/40 backdrop-blur-xl lg:flex">
        <div className="mb-10 px-2">
          <div className="ui-text-label text-[10px] text-gold/40 tracking-[0.2em] uppercase mb-1">Sumo Simulation</div>
          <div className="text-3xl ui-text-heading font-black text-gold drop-shadow-sm">横綱メーカー</div>
        </div>

        <nav className="flex-1 space-y-1.5">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-active={isActive}
                className="shell-nav-button group relative overflow-hidden"
                onClick={() => onSectionChange(item.id)}
              >
                <div className={`absolute inset-y-0 left-0 w-1 bg-gold transition-transform duration-300 ${isActive ? 'translate-x-0' : '-translate-x-full'}`} />
                <Icon className={`h-4 w-4 transition-colors ${isActive ? 'text-gold' : 'text-text-dim group-hover:text-text'}`} />
                <span className={`tracking-wide ${isActive ? 'text-text font-bold' : 'text-text-dim group-hover:text-text'}`}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-8 border-t border-gold-muted/10">
          <div className="text-[10px] ui-text-label text-text-faint italic leading-relaxed">
            &copy; 2026 Advanced Agentic Coding.<br />Sumo-Maker Version 2.0
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col transition-all duration-300">
        {/* コンテキストバー: ヘッダーの統合と整理 */}
        <header className="context-bar sticky top-0 z-50 px-4 py-4 sm:px-8 border-b-2 border-gold/15 bg-bg/90 backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 relative w-full">
            <div className="corner-gold corner-top-left" />
            <div className="corner-gold corner-top-right" />
            <div className="corner-gold corner-bottom-left" />
            <div className="corner-gold corner-bottom-right" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="h-px w-6 bg-gold/40" />
                <div className="app-kicker text-gold/60 text-xs tracking-widest uppercase">{subtitle}</div>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-5xl ui-text-heading font-bold text-text truncate drop-shadow-lg tracking-tighter">
                {title}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-4 self-center sm:self-end">
              {statusLine && (
                <div className="px-3 py-1.5 bg-gold/10 border border-gold/30 ui-text-label text-[10px] text-gold/90 hidden lg:flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-gold"></span>
                  </span>
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
