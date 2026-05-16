import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookUser, Menu, ScrollText, Table2, X } from "lucide-react";
import { Button } from "../../../../shared/ui/Button";
import { SignalLed, type SignalLedState } from "../encyclopedia/SignalLed";
import type { CareerChapterId } from "../../utils/careerResultModel";
import styles from "./ObservationConsoleHeader.module.css";

interface ConsoleChapter {
  id: CareerChapterId;
  label: string;
  icon: typeof BookUser;
}

const CONSOLE_CHAPTERS: ConsoleChapter[] = [
  { id: "encyclopedia", label: "力士名鑑", icon: BookUser },
  { id: "trajectory", label: "番付推移", icon: ScrollText },
  { id: "place", label: "場所別記録", icon: Table2 },
];

interface ObservationConsoleHeaderProps {
  subjectId: string;
  subjectName: string;
  highestRankLabel: string;
  selectedMeta: string;
  activeChapter: CareerChapterId;
  detailState: "idle" | "building" | "ready" | "error";
  canReadDetails: boolean;
  onSelectChapter: (chapter: CareerChapterId) => void;
  mobileNavOpen: boolean;
  onToggleMobileNav: () => void;
}

const STATE_LABELS: Record<"idle" | "building" | "ready" | "error", string> = {
  idle: "観測待機",
  building: "整理中",
  ready: "観測完了",
  error: "整理失敗",
};

const STATE_LEDS: Record<"idle" | "building" | "ready" | "error", SignalLedState> = {
  idle: "off",
  building: "info",
  ready: "active",
  error: "warn",
};

const shortIdentifier = (raw: string): string => {
  const cleaned = (raw || "未詳").replace(/[^A-Za-z0-9぀-ゟ゠-ヿ一-鿿]/g, "");
  return cleaned.slice(0, 8).padEnd(4, "・");
};

export const ObservationConsoleHeader: React.FC<ObservationConsoleHeaderProps> = ({
  subjectId,
  subjectName,
  highestRankLabel,
  selectedMeta,
  activeChapter,
  detailState,
  canReadDetails,
  onSelectChapter,
  mobileNavOpen,
  onToggleMobileNav,
}) => {
  const stateLabel = STATE_LABELS[detailState];
  const stateLed = STATE_LEDS[detailState];
  const stateLedPulse = detailState === "building";
  const idCode = shortIdentifier(subjectId);

  return (
    <div className={styles.shell}>
      <div className={styles.console}>
        <div className={styles.subject}>
          <div className={styles.subjectHead}>
            <SignalLed state={stateLed} pulse={stateLedPulse} size="sm" label={stateLabel} />
            <strong>力士記録</strong>
            <span className={styles.divider}>／</span>
            <em>記録番号 {idCode}</em>
            <span className={styles.divider}>／</span>
            <em>{stateLabel}</em>
          </div>
          <div className={styles.subjectMeta}>
            <strong>{subjectName}</strong> {selectedMeta || highestRankLabel}
          </div>
        </div>

        <div className={styles.modeArea}>
          <div className={styles.modeTrack} role="tablist" aria-label="観測モード切替">
            {CONSOLE_CHAPTERS.map((chapter) => {
              const Icon = chapter.icon;
              const disabled = !canReadDetails && chapter.id !== "encyclopedia";
              const isActive = activeChapter === chapter.id;
              return (
                <button
                  key={chapter.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={styles.modeTab}
                  data-active={isActive}
                  disabled={disabled}
                  onClick={() => onSelectChapter(chapter.id)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{chapter.label}</span>
                </button>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={styles.mobileToggle}
            aria-label={mobileNavOpen ? "モードを閉じる" : "モードを開く"}
            onClick={onToggleMobileNav}
          >
            {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {mobileNavOpen ? (
          <motion.div
            className={styles.drawer}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <div className={styles.drawerHead}>
              <span>{subjectName}</span>
              <em>{selectedMeta || highestRankLabel}</em>
            </div>
            <div className={styles.drawerList}>
              {CONSOLE_CHAPTERS.map((chapter) => {
                const Icon = chapter.icon;
                const disabled = !canReadDetails && chapter.id !== "encyclopedia";
                const isActive = activeChapter === chapter.id;
                return (
                  <button
                    key={`mobile-${chapter.id}`}
                    type="button"
                    className={styles.modeTab}
                    data-active={isActive}
                    disabled={disabled}
                    onClick={() => onSelectChapter(chapter.id)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{chapter.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
