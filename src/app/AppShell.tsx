import React from "react";
import {
  Archive,
  FlaskConical,
  LibraryBig,
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
}> = [
  { id: "scout", label: "新弟子設計", icon: ScrollText },
  { id: "basho", label: "場所中枢", icon: MonitorPlay },
  { id: "career", label: "キャリア結果", icon: Waypoints },
  { id: "era", label: "時代統計", icon: TableProperties },
  { id: "archive", label: "アーカイブ", icon: Archive },
  { id: "collection", label: "コレクション", icon: LibraryBig },
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
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.id === "logicLab" && !showLogicLab) return false;
    if (item.id === "basho" && !showBasho) return false;
    return true;
  });

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
                {visibleItems.map((item) => {
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
