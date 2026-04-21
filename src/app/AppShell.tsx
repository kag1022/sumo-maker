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
import { cn } from "../shared/lib/cn";
import styles from "./AppShell.module.css";

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
      <div className={cn(styles.shell, styles.mobileShell)} data-layout="mobile">
        <header className={styles.mobileHeader}>
          <div className={styles.mobileHeaderInner}>
            <div className={styles.titleBlock}>
              <div className={styles.overline}>相撲記録帳</div>
              <h1 className={styles.title}>{title}</h1>
              {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
            </div>
            {actions ? <div className={styles.mobileActions}>{actions}</div> : null}
          </div>
          <div className={styles.mobileNavBand}>
            <div className={styles.mainInner}>
              <nav className={styles.mobilePrimaryNav} aria-label="画面切替">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={styles.mobileNavButton}
                      data-active={isActive}
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
            <div className={styles.mobileStatusBand}>
              <div className={styles.statusLabel}>状況</div>
              <div className={styles.statusLine}>{statusLine}</div>
            </div>
          ) : null}
        </header>
        <main className={styles.main}>
          <div className={styles.mainInner}>{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className={cn(styles.shell, styles.desktopShell)} data-layout="desktop">
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>相</div>
          <div>
            <div className={styles.brandTitle}>相撲記録帳</div>
            <div className={styles.brandSub}>SUMO MAKER</div>
          </div>
        </div>

        <nav className={styles.nav} aria-label="画面切替">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const isDisabled = disableSections.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={styles.navItem}
                data-active={isActive}
                disabled={isDisabled}
                onClick={() => onSectionChange(item.id)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.sidebarFooterLine}>© SUMO MAKER</div>
        </div>
      </aside>

      <div className={styles.contentArea}>
        <header className={styles.contentHeader}>
          <div className={styles.contentHeaderInner}>
            <div className={styles.titleBlock}>
              <h1 className={styles.title}>{title}</h1>
              {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
            </div>
            {actions ? <div className={styles.actions}>{actions}</div> : null}
          </div>
          {statusLine ? (
            <div className={styles.contentStatusBand}>
              <span className={styles.statusLabel}>状況</span>
              <span className={styles.statusLine}>{statusLine}</span>
            </div>
          ) : null}
        </header>

        <main className={styles.main}>
          <div className={styles.mainInner}>{children}</div>
        </main>
      </div>
    </div>
  );
};
