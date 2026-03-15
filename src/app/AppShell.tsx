import React from "react";
import { Archive, BookOpenText, FlaskConical, ScrollText } from "lucide-react";

export type AppSection = "scout" | "career" | "archive" | "logicLab";

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
  { id: "career", label: "現役力士記録", shortLabel: "記録", icon: BookOpenText },
  { id: "archive", label: "保存済み記録", shortLabel: "保存済み", icon: Archive },
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
      <div className="mx-auto flex min-h-screen max-w-[1480px]">
        <aside className="app-sidebar hidden lg:flex">
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="app-kicker">相撲シミュレーション</div>
              <button
                type="button"
                className="text-left"
                onClick={() => onSectionChange("scout")}
              >
                <div className="text-2xl ui-text-heading text-text">横綱メーカー</div>
                <div className="text-sm text-text-dim leading-relaxed">
                  力士一代記を引いて、読み、保存する。
                </div>
              </button>
            </div>

            <nav className="space-y-2" aria-label="主要ナビゲーション">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="shell-nav-button"
                    data-active={activeSection === item.id}
                    onClick={() => onSectionChange(item.id)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="context-bar">
            <div className="min-w-0">
              <div className="app-kicker">現在地</div>
              <h1 className="text-2xl ui-text-heading text-text sm:text-3xl">{title}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-dim">{subtitle}</p>
            </div>
            <div className="context-actions">
              {statusLine && <div className="context-status">{statusLine}</div>}
              {actions}
            </div>
          </header>

          <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8">{children}</main>
        </div>
      </div>

      <nav className="mobile-bottom-nav lg:hidden" aria-label="主要ナビゲーション">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className="mobile-nav-button"
              data-active={activeSection === item.id}
              onClick={() => onSectionChange(item.id)}
            >
              <Icon className="h-4 w-4" />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
