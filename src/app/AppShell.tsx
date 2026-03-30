import React from "react";
import {
  Archive,
  FlaskConical,
  LibraryBig,
  Menu,
  MoreHorizontal,
  MonitorPlay,
  ScrollText,
  TableProperties,
  Waypoints,
} from "lucide-react";
import { Button } from "../shared/ui/Button";

export type AppSection =
  | "scout"
  | "basho"
  | "career"
  | "era"
  | "archive"
  | "collection"
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
  tier: "primary" | "secondary";
}> = [
  { id: "scout", label: "新弟子設計", icon: ScrollText, tier: "primary" },
  { id: "basho", label: "節目劇場", icon: MonitorPlay, tier: "primary" },
  { id: "career", label: "記録を読む", icon: Waypoints, tier: "primary" },
  { id: "archive", label: "保存済み記録", icon: Archive, tier: "primary" },
  { id: "era", label: "時代統計", icon: TableProperties, tier: "secondary" },
  { id: "collection", label: "資料館", icon: LibraryBig, tier: "secondary" },
  { id: "logicLab", label: "ロジック検証", icon: FlaskConical, tier: "secondary" },
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
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.id === "logicLab" && !showLogicLab) return false;
    if (item.id === "basho" && !showBasho) return false;
    return true;
  });
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const primaryItems = visibleItems.filter((item) => {
    if (item.tier !== "primary") return false;
    if (activeSection === item.id) return true;
    if (item.id === "scout" || item.id === "archive") return true;
    return !disableSections.includes(item.id);
  });
  const secondaryItems = visibleItems.filter(
    (item) => item.tier === "secondary" && !disableSections.includes(item.id),
  );

  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [activeSection]);

  return (
    <div className="app-shell">
      <header className="app-shell-header">
        <div className="app-shell-header-inner">
          <div className="app-shell-titleblock">
            <div className="app-shell-overline">Sumo Career Records</div>
            <h1 className="app-shell-title">{title}</h1>
            {subtitle ? <div className="app-shell-subtitle">{subtitle}</div> : null}
          </div>

          <div className="app-shell-actioncluster">
            {actions ? <div className="app-shell-actions">{actions}</div> : null}
            <Button
              variant="ghost"
              size="sm"
              className="app-shell-mobile-navtoggle"
              onClick={() => setMobileNavOpen((current) => !current)}
              aria-expanded={mobileNavOpen}
              aria-controls="app-shell-navdrawer"
            >
              <Menu className="h-4 w-4" />
              導線
            </Button>
          </div>
        </div>

        <div className="app-shell-navband">
          <div className="app-shell-navband-inner">
            <nav className="app-shell-primarynav" aria-label="主要導線">
              {primaryItems.map((item) => {
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

            {secondaryItems.length > 0 ? (
              <div ref={menuRef} className="app-shell-secondarynav">
                <Button
                  variant={secondaryItems.some((item) => item.id === activeSection) ? "outline" : "ghost"}
                  size="sm"
                  className="app-shell-navbutton"
                  onClick={() => setMenuOpen((current) => !current)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  しおり
                </Button>
                {menuOpen ? (
                  <div className="app-shell-secondarypanel" role="menu" aria-label="補助導線">
                    {secondaryItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="app-shell-secondaryitem"
                          data-active={activeSection === item.id}
                          onClick={() => {
                            setMenuOpen(false);
                            onSectionChange(item.id);
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div
          id="app-shell-navdrawer"
          className="app-shell-navdrawer"
          data-open={mobileNavOpen}
          aria-hidden={!mobileNavOpen}
        >
          <div className="app-shell-navdrawer-list">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={`mobile-${item.id}`}
                  type="button"
                  className="app-shell-navdrawer-item"
                  data-active={activeSection === item.id}
                  disabled={disableSections.includes(item.id)}
                  onClick={() => onSectionChange(item.id)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {statusLine ? (
        <div className="app-shell-statusband">
          <div className="app-shell-statusband-inner">
            <div className="app-shell-statuslabel">状況</div>
            <div className="app-shell-statusline">{statusLine}</div>
          </div>
        </div>
      ) : null}

      <main className="app-shell-main">
        <div className="app-shell-main-inner">{children}</div>
      </main>
    </div>
  );
};
