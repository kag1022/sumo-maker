const LIFETIME_CAREERS_KEY = "sumo-maker:lifetime:careers";

const readCount = (): number => {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(LIFETIME_CAREERS_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const writeCount = (value: number): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIFETIME_CAREERS_KEY, String(Math.max(0, Math.floor(value))));
};

export const getLifetimeCareerCount = (): number => readCount();

export const incrementLifetimeCareerCount = (): number => {
  const next = readCount() + 1;
  writeCount(next);
  return next;
};

export const resetLifetimeCareerCount = (): void => writeCount(0);
