import React from "react";
import {
  Archive,
  FlaskConical,
  Home,
  LibraryBig,
  MonitorPlay,
  ScrollText,
  Settings,
  Waypoints,
} from "lucide-react";
import { useViewportMode } from "../shared/hooks/useViewportMode";

export type AppSection =
  | "home"
  | "scout"
  | "basho"
  | "career"
  | "archive"
  | "collection"
  | "settings"
  | "logicLab";

interface AppShellProps {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  title: string;
  subtitle?: string;
  statusLine?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  showLogicLab?: boolean;
  showBasho?: boolean;
  disableSections?: AppSection[];
}

const NAV_ITEMS: Array<{
  id: AppSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "home", label: "ホーム", icon: Home },
  { id: "scout", label: "新弟子設計", icon: ScrollText },
  { id: "basho", label: "節目劇場", icon: MonitorPlay },
  { id: "career", label: "力士記録", icon: Waypoints },
  { id: "archive", label: "保存済み記録", icon: Archive },
  { id: "collection", label: "資料館", icon: LibraryBig },
  { id: "settings", label: "設定", icon: Settings },
  { id: "logicLab", label: "ロジック検証", icon: FlaskConical },
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
  showBasho = false,
  disableSections = [],
}) => {
  const { isMobileViewport } = useViewportMode();
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.id === "logicLab" && !showLogicLab) return false;
    if (item.id === "basho" && !showBasho) return false;
    return true;
  });

  if (isMobileViewport) {
    return (
      <div className="app-shell app-shell-mobile" data-layout="mobile">
        <header className="app-shell-mobile-header">
          <div className="app-shell-mobile-header-inner">
            <div className="app-shell-titleblock">
              <div className="app-shell-overline">相撲記録帳</div>
              <h1 className="app-shell-title">{title}</h1>
              {subtitle ? <div className="app-shell-subtitle">{subtitle}</div> : null}
            </div>
            {actions ? <div className="app-shell-mobile-actions">{actions}</div> : null}
          </div>
          <div className="app-shell-navband">
            <div className="app-shell-navband-inner">
              <nav className="app-shell-primarynav" aria-label="画面切替">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`app-shell-navbutton-mobile${isActive ? " active" : ""}`}
                      disabled={disableSections.includes(item.id)}
                      onClick={() => onSectionChange(item.id)}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
          {statusLine ? (
            <div className="app-shell-mobile-statusband">
              <div className="app-shell-statuslabel">状況</div>
              <div className="app-shell-mobile-statusline">{statusLine}</div>
            </div>
          ) : null}
        </header>
        <main className="app-shell-main app-shell-main-mobile">
          <div className="app-shell-main-inner">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell app-shell-sidebar-layout" data-layout="desktop">
      {/* Left sidebar */}
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <div className="app-sidebar-brand-mark">相</div>
          <div className="app-sidebar-brand-text">
            <div className="app-sidebar-brand-title">相撲記録帳</div>
            <div className="app-sidebar-brand-sub">SUMO MAKER</div>
          </div>
        </div>

        <nav className="app-sidebar-nav" aria-label="画面切替">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const isDisabled = disableSections.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={`app-sidebar-item${isActive ? " active" : ""}${isDisabled ? " disabled" : ""}`}
                disabled={isDisabled}
                onClick={() => onSectionChange(item.id)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-sidebar-footer-line">© SUMO MAKER</div>
        </div>
      </aside>

      {/* Right content area */}
      <div className="app-content-area">
        <header className="app-content-header">
          <div className="app-content-header-inner">
            <div className="app-shell-titleblock">
              <h1 className="app-content-title">{title}</h1>
              {subtitle ? <div className="app-shell-subtitle">{subtitle}</div> : null}
            </div>
            {actions ? <div className="app-shell-actions">{actions}</div> : null}
          </div>
          {statusLine ? (
            <div className="app-content-statusband">
              <span className="app-shell-statuslabel">状況</span>
              <span className="app-shell-statusline">{statusLine}</span>
            </div>
          ) : null}
        </header>

        <main className="app-shell-main">
          <div className="app-shell-main-inner">{children}</div>
        </main>
      </div>
    </div>
  );
};
