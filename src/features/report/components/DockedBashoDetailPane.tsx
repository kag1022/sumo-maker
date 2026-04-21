import React from "react";
import { X } from "lucide-react";
import type { RikishiStatus } from "../../../logic/models";
import { cn } from "../../../shared/lib/cn";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import { BashoDetailBody, type BashoDetailModalState } from "./BashoDetailModal";

interface DockedBashoDetailPaneProps {
  state: BashoDetailModalState;
  status: RikishiStatus;
  detail: unknown;
  isLoading: boolean;
  errorMessage?: string | null;
  onClose: () => void;
}

export const DockedBashoDetailPane: React.FC<DockedBashoDetailPaneProps> = ({
  state,
  status,
  detail,
  isLoading,
  errorMessage,
  onClose,
}) => (
  <aside className={cn(surface.detailCard, "sticky top-5 self-start overflow-hidden")}>
    <div className="flex items-start justify-between gap-4 border-b border-brand-muted/60 px-4 py-3 sm:px-5">
      <div className="space-y-1">
        <div className={cn(typography.label, "text-xs text-warning-bright")}>{state.sourceLabel}</div>
        <h4 className="text-sm sm:text-base text-text">{state.title}</h4>
        <p className="text-xs text-text-dim">{state.subtitle ?? "この場所の文脈を読みます。"}</p>
      </div>
      <button
        type="button"
        className="p-2 text-text-dim hover:text-text border border-transparent hover:border-brand-muted/70"
        onClick={onClose}
        aria-label="詳細ペインを閉じる"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
    <div className="space-y-4 px-4 py-3 sm:px-5 sm:py-4">
      <BashoDetailBody
        state={state}
        detail={detail as any}
        status={status}
        isLoading={isLoading}
        errorMessage={errorMessage}
      />
    </div>
  </aside>
);
