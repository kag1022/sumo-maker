import type { PlayerBoutExplanationPreview } from "../components/BoutExplanationPreviewPanel";

const STORAGE_KEY = "sumo-maker:bout-flow-preview";

declare global {
  interface Window {
    __SUMO_MAKER_BOUT_EXPLANATION_PREVIEWS__?: readonly PlayerBoutExplanationPreview[];
  }
}

const isPreview = (value: unknown): value is PlayerBoutExplanationPreview => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlayerBoutExplanationPreview>;
  return (
    typeof candidate.bashoSeq === "number" &&
    typeof candidate.day === "number" &&
    Boolean(candidate.commentary) &&
    typeof candidate.commentary?.shortCommentary === "string" &&
    typeof candidate.commentary?.kimarite === "string" &&
    Array.isArray(candidate.commentary?.flowExplanation) &&
    Array.isArray(candidate.commentary?.victoryFactorLabels) &&
    Array.isArray(candidate.commentary?.materials)
  );
};

const parseStoredPreviews = (raw: string | null): readonly PlayerBoutExplanationPreview[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isPreview) : [];
  } catch {
    return [];
  }
};

export const readDevBoutExplanationPreviews = (): readonly PlayerBoutExplanationPreview[] => {
  if (!import.meta.env.DEV || typeof window === "undefined") return [];
  const windowPreviews = window.__SUMO_MAKER_BOUT_EXPLANATION_PREVIEWS__;
  const fromWindow = Array.isArray(windowPreviews) ? windowPreviews.filter(isPreview) : [];
  const fromStorage = parseStoredPreviews(window.sessionStorage.getItem(STORAGE_KEY));
  return [...fromWindow, ...fromStorage];
};
