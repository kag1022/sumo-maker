import React from "react";
import {
  Archive,
  FlaskConical,
  LibraryBig,
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

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-50 border-b border-white/6 bg-[#0b1118]/92 backdrop-blur-xl">
        <div className="mx-auto max-w-[1680px] px-4 py-3 sm:px-8">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] ui-text-label tracking-[0.28em] text-text-faint uppercase">
                Sumo Career Database
              </div>
              <h1 className="mt-1.5 text-xl sm:text-3xl ui-text-heading text-text">{title}</h1>
              {subtitle ? <div className="mt-1 text-sm text-text/62">{subtitle}</div> : null}
            </div>

            <div className="flex flex-col gap-2 xl:items-end">
              <div className="flex flex-wrap gap-1.5">
                {primaryItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Button
                      key={item.id}
                      variant={activeSection === item.id ? "primary" : "ghost"}
                      size="sm"
                      disabled={disableSections.includes(item.id)}
                      onClick={() => onSectionChange(item.id)}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {item.label}
                    </Button>
                  );
                })}
              </div>
              {secondaryItems.length > 0 ? (
                <div ref={menuRef} className="supplementary-menu">
                  <Button
                    variant={secondaryItems.some((item) => item.id === activeSection) ? "outline" : "ghost"}
                    size="sm"
                    onClick={() => setMenuOpen((current) => !current)}
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                  >
                    <MoreHorizontal className="mr-2 h-4 w-4" />
                    もっと見る
                  </Button>
                  {menuOpen ? (
                    <div className="supplementary-menu-panel" role="menu" aria-label="補助メニュー">
                      {secondaryItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className="supplementary-menu-item"
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
              <div className="flex flex-wrap items-center gap-2">
                {statusLine ? (
                  <div className="border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10px] ui-text-label text-text-dim">
                    {statusLine}
                  </div>
                ) : null}
                {actions}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-4 pb-16 pt-6 sm:px-8">{children}</main>
    </div>
  );
};
