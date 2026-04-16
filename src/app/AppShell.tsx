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
import { Button } from "../shared/ui/Button";
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

  const header = (
    <header className={isMobileViewport ? "app-shell-mobile-header" : "app-shell-header"}>
      <div className={isMobileViewport ? "app-shell-mobile-header-inner" : "app-shell-header-inner"}>
        <div className="app-shell-titleblock">
          <div className="app-shell-overline">相撲記録帳</div>
          <h1 className="app-shell-title">{title}</h1>
          {subtitle ? <div className="app-shell-subtitle">{subtitle}</div> : null}
        </div>
        {actions ? (
          <div className={isMobileViewport ? "app-shell-mobile-actions" : "app-shell-actions"}>
            {actions}
          </div>
        ) : null}
      </div>

      <div className="app-shell-navband">
        <div className="app-shell-navband-inner">
          <nav className="app-shell-primarynav" aria-label="画面切替">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.id}
                  variant={activeSection === item.id ? "primary" : "ghost"}
                  size="sm"
                  className="app-shell-navbutton"
                  disabled={disableSections.includes(item.id)}
                  onClick={() => onSectionChange(item.id)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </nav>
        </div>
      </div>

      {statusLine ? (
        <div className={isMobileViewport ? "app-shell-mobile-statusband" : "app-shell-statusband"}>
          <div className={isMobileViewport ? undefined : "app-shell-statusband-inner"}>
            <div className="app-shell-statuslabel">状況</div>
            <div className={isMobileViewport ? "app-shell-mobile-statusline" : "app-shell-statusline"}>{statusLine}</div>
          </div>
        </div>
      ) : null}
    </header>
  );

  if (isMobileViewport) {
    return (
      <div className="app-shell app-shell-mobile" data-layout="mobile">
        {header}
        <main className="app-shell-main app-shell-main-mobile">
          <div className="app-shell-main-inner">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell" data-layout="desktop">
      {header}
      <main className="app-shell-main">
        <div className="app-shell-main-inner">{children}</div>
      </main>
    </div>
  );
};
