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
import { useLocale } from "../shared/hooks/useLocale";
import type { LocaleCode } from "../shared/lib/locale";
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
  labels: Record<LocaleCode, string>;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "home", labels: { ja: "ホーム", en: "Home" }, icon: Home },
  { id: "scout", labels: { ja: "観測する", en: "Observe" }, icon: ScrollText },
  { id: "basho", labels: { ja: "節目劇場", en: "Basho Theater" }, icon: MonitorPlay },
  { id: "career", labels: { ja: "力士記録", en: "Career Record" }, icon: Waypoints },
  { id: "archive", labels: { ja: "保存済み記録", en: "Archive" }, icon: Archive },
  { id: "collection", labels: { ja: "記録 / 偉業", en: "Records" }, icon: LibraryBig },
  { id: "settings", labels: { ja: "設定", en: "Settings" }, icon: Settings },
  { id: "logicLab", labels: { ja: "ロジック検証", en: "Logic Lab" }, icon: FlaskConical },
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
  const { locale } = useLocale();
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
              <div className={styles.overline}>{locale === "en" ? "SUMO MAKER" : "相撲記録帳"}</div>
              <h1 className={styles.title}>{title}</h1>
              {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
            </div>
            {actions ? <div className={styles.mobileActions}>{actions}</div> : null}
          </div>
          <div className={styles.mobileNavBand}>
            <div className={styles.mainInner}>
              <nav className={styles.mobilePrimaryNav} aria-label={locale === "en" ? "Screen navigation" : "画面切替"}>
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
                      {item.labels[locale]}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
          {statusLine ? (
            <div className={styles.mobileStatusBand}>
              <div className={styles.statusLabel}>{locale === "en" ? "Status" : "状況"}</div>
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
          <div className={styles.brandMark}>{locale === "en" ? "S" : "相"}</div>
          <div>
            <div className={styles.brandTitle}>{locale === "en" ? "SUMO MAKER" : "相撲記録帳"}</div>
            <div className={styles.brandSub}>SUMO MAKER</div>
          </div>
        </div>

        <nav className={styles.nav} aria-label={locale === "en" ? "Screen navigation" : "画面切替"}>
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
                <span>{item.labels[locale]}</span>
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
              <span className={styles.statusLabel}>{locale === "en" ? "Status" : "状況"}</span>
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
