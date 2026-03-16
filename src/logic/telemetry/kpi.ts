export type KpiEventName =
  | 'report_to_new_build_start'
  | 'prize_breakdown_open'
  | 'career_complete_view';

interface KpiCounter {
  count: number;
  lastAt: string;
}

const STORAGE_KEY = 'sumo-maker:kpi:v1';

const isBrowser = (): boolean => typeof window !== 'undefined' && !!window.localStorage;

export const trackKpiEvent = (eventName: KpiEventName): void => {
  if (!isBrowser()) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const counters = raw ? (JSON.parse(raw) as Partial<Record<KpiEventName, KpiCounter>>) : {};
    const current = counters[eventName] ?? { count: 0, lastAt: new Date(0).toISOString() };
    counters[eventName] = {
      count: current.count + 1,
      lastAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(counters));
  } catch {
    // KPI保存失敗は非致命扱い
  }
};

export const readKpiCounters = (): Partial<Record<KpiEventName, KpiCounter>> => {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<KpiEventName, KpiCounter>>) : {};
  } catch {
    return {};
  }
};

