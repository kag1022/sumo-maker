import type {
  BodyType,
  KimariteRepertoire,
  KimariteRepertoireEntry,
  KimariteRepertoireTier,
  RikishiStatus,
  Trait,
  WinRoute,
} from '../models';
import type { BashoRecord } from '../models';
import type { KimariteContextTag, KimaritePattern, KimariteStyle, OfficialKimariteEntry } from './catalog';
import { findOfficialKimariteEntry, normalizeKimariteName, OFFICIAL_WIN_KIMARITE_82 } from './catalog';

export interface KimariteRepertoireSeed {
  style: KimariteStyle;
  bodyType: BodyType;
  traits: Trait[];
  preferredMove?: string;
  designedPrimaryStyle?: KimariteStyle;
  designedSecondaryStyle?: KimariteStyle;
  designedSecretStyle?: KimariteStyle;
  kataSettled?: boolean;
}

const ROUTE_TO_PATTERN: Record<WinRoute, KimaritePattern> = {
  PUSH_OUT: 'PUSH_ADVANCE',
  BELT_FORCE: 'BELT_FORCE',
  THROW_BREAK: 'THROW_EXCHANGE',
  PULL_DOWN: 'PULL_DOWN',
  EDGE_REVERSAL: 'EDGE_REVERSAL',
  REAR_FINISH: 'REAR_CONTROL',
  LEG_ATTACK: 'LEG_TRIP_PICK',
};

const STYLE_PRIMARY_ROUTES: Record<KimariteStyle, WinRoute[]> = {
  PUSH: ['PUSH_OUT'],
  GRAPPLE: ['BELT_FORCE'],
  TECHNIQUE: ['THROW_BREAK'],
  BALANCE: ['PUSH_OUT', 'BELT_FORCE'],
};

const STYLE_SECONDARY_ROUTES: Record<KimariteStyle, WinRoute[]> = {
  PUSH: ['PULL_DOWN', 'BELT_FORCE'],
  GRAPPLE: ['THROW_BREAK', 'PULL_DOWN'],
  TECHNIQUE: ['PULL_DOWN', 'LEG_ATTACK'],
  BALANCE: ['THROW_BREAK', 'PULL_DOWN'],
};

const ROUTE_TIER_ORDER: Record<KimariteRepertoireTier, number> = {
  PRIMARY: 4,
  SECONDARY: 3,
  CONTEXT: 2,
  RARE: 1,
};

const TIER_LIMITS: Record<KimariteRepertoireTier, number> = {
  PRIMARY: 2,
  SECONDARY: 3,
  CONTEXT: 1,
  RARE: 1,
};

const traitMatchScore = (entry: OfficialKimariteEntry, traits: Trait[]): number => {
  const matches = entry.traitTags.filter((trait) => traits.includes(trait)).length;
  return 1 + matches * 0.16;
};

const styleMatchScore = (entry: OfficialKimariteEntry, style: KimariteStyle): number => {
  if (entry.primaryStyle === style) return 1.45;
  if (entry.secondaryStyle === style) return 1.16;
  if (style === 'BALANCE') return 1.02;
  return 0.72;
};

const bodyMatchScore = (entry: OfficialKimariteEntry, bodyType: BodyType): number => {
  if (entry.bodyAffinity.preferredBodyTypes?.includes(bodyType)) return 1.18;
  if (entry.contextTags.includes('SOPPU_ONLY')) return bodyType === 'SOPPU' ? 1.12 : 0;
  return 1;
};

const roleScore = (entry: OfficialKimariteEntry): number => {
  if (entry.patternRole === 'MAIN') return 1.65;
  if (entry.patternRole === 'ALT') return 1.02;
  if (entry.patternRole === 'CONTEXT') return 0.6;
  return 0.22;
};

const contextSeedScore = (
  entry: OfficialKimariteEntry,
  seed: KimariteRepertoireSeed,
): number => {
  let score = 1;
  const tags = entry.contextTags;
  if (!tags.length) return score;
  if (tags.includes('ARAWAZASHI_ONLY') && !seed.traits.includes('ARAWAZASHI') && seed.style !== 'TECHNIQUE') {
    return 0;
  }
  if (tags.includes('SOPPU_ONLY') && seed.bodyType !== 'SOPPU') return 0;
  if (tags.includes('BELT_ONLY') && seed.style === 'PUSH') return 0.72;
  if (tags.includes('HEAVY_ONLY') && seed.bodyType === 'SOPPU') return 0.78;
  if (tags.includes('EDGE') || tags.includes('REAR') || tags.includes('UNDERDOG')) {
    score *= seed.designedSecretStyle === 'TECHNIQUE' || seed.traits.includes('DOHYOUGIWA_MAJUTSU') ? 1.08 : 0.82;
  }
  return score;
};

const preferredMoveScore = (
  entry: OfficialKimariteEntry,
  preferredMove?: string,
): number => {
  if (!preferredMove) return 1;
  return normalizeKimariteName(preferredMove) === entry.name ? 3.4 : 1;
};

const routeSeedBoost = (
  route: WinRoute,
  seed: KimariteRepertoireSeed,
): number => {
  let score = STYLE_PRIMARY_ROUTES[seed.style].includes(route) ? 1.28 : 1;
  if (STYLE_SECONDARY_ROUTES[seed.style].includes(route)) score *= 1.1;
  if (seed.designedPrimaryStyle && STYLE_PRIMARY_ROUTES[seed.designedPrimaryStyle].includes(route)) score *= 1.08;
  if (seed.designedSecondaryStyle && STYLE_SECONDARY_ROUTES[seed.designedSecondaryStyle].includes(route)) score *= 1.05;
  if (
    seed.designedSecretStyle === 'TECHNIQUE' &&
    (route === 'EDGE_REVERSAL' || route === 'LEG_ATTACK' || route === 'REAR_FINISH')
  ) {
    score *= 1.08;
  }
  return score;
};

const unique = <T,>(values: T[]): T[] => [...new Set(values)];

const scoreEntryForSeed = (
  entry: OfficialKimariteEntry,
  route: WinRoute,
  seed: KimariteRepertoireSeed,
): number =>
  entry.historicalWeight *
  roleScore(entry) *
  styleMatchScore(entry, seed.style) *
  bodyMatchScore(entry, seed.bodyType) *
  traitMatchScore(entry, seed.traits) *
  contextSeedScore(entry, seed) *
  preferredMoveScore(entry, seed.preferredMove) *
  routeSeedBoost(route, seed);

const isTemporaryOnlyContext = (tags: KimariteContextTag[]): boolean =>
  tags.includes('EDGE') || tags.includes('REAR') || tags.includes('UNDERDOG');

const collectRouteCandidates = (
  route: WinRoute,
  seed: KimariteRepertoireSeed,
): OfficialKimariteEntry[] => {
  const pattern = ROUTE_TO_PATTERN[route];
  return OFFICIAL_WIN_KIMARITE_82
    .filter((entry) => entry.requiredPatterns.includes(pattern))
    .filter((entry) => bodyMatchScore(entry, seed.bodyType) > 0)
    .filter((entry) => !isTemporaryOnlyContext(entry.contextTags) || route === 'EDGE_REVERSAL' || route === 'REAR_FINISH')
    .sort((left, right) => scoreEntryForSeed(right, route, seed) - scoreEntryForSeed(left, route, seed));
};

const pushEntry = (
  target: KimariteRepertoireEntry[],
  entry: OfficialKimariteEntry,
  route: WinRoute,
  tier: KimariteRepertoireTier,
  affinity: number,
): void => {
  const existing = target.find((row) => row.kimarite === entry.name);
  if (existing) {
    if (ROUTE_TIER_ORDER[tier] > ROUTE_TIER_ORDER[existing.tier]) existing.tier = tier;
    existing.route = route;
    existing.affinity = Math.max(existing.affinity, affinity);
    return;
  }
  target.push({
    kimarite: entry.name,
    route,
    tier,
    affinity,
  });
};

const normalizeEntries = (entries: KimariteRepertoireEntry[]): KimariteRepertoireEntry[] => {
  const deduped = new Map<string, KimariteRepertoireEntry>();
  for (const entry of entries) {
    const normalized = normalizeKimariteName(entry.kimarite);
    const current = deduped.get(normalized);
    const candidate = { ...entry, kimarite: normalized };
    if (!current) {
      deduped.set(normalized, candidate);
      continue;
    }
    if (ROUTE_TIER_ORDER[candidate.tier] > ROUTE_TIER_ORDER[current.tier]) {
      deduped.set(normalized, { ...current, ...candidate });
      continue;
    }
    current.affinity = Math.max(current.affinity, candidate.affinity);
  }

  const grouped = {
    PRIMARY: [] as KimariteRepertoireEntry[],
    SECONDARY: [] as KimariteRepertoireEntry[],
    CONTEXT: [] as KimariteRepertoireEntry[],
    RARE: [] as KimariteRepertoireEntry[],
  };
  for (const entry of deduped.values()) grouped[entry.tier].push(entry);
  (Object.keys(grouped) as KimariteRepertoireTier[]).forEach((tier) => {
    grouped[tier].sort((left, right) => right.affinity - left.affinity);
  });

  return ([] as KimariteRepertoireEntry[]).concat(
    grouped.PRIMARY.slice(0, TIER_LIMITS.PRIMARY),
    grouped.SECONDARY.slice(0, TIER_LIMITS.SECONDARY),
    grouped.CONTEXT.slice(0, TIER_LIMITS.CONTEXT),
    grouped.RARE.slice(0, TIER_LIMITS.RARE),
  );
};

const ensurePreferredMove = (
  entries: KimariteRepertoireEntry[],
  seed: KimariteRepertoireSeed,
): void => {
  const preferred = seed.preferredMove ? findOfficialKimariteEntry(seed.preferredMove) : undefined;
  if (!preferred) return;
  const route = inferWinRouteFromMove(preferred.name);
  if (!route) return;
  const tier: KimariteRepertoireTier =
    STYLE_PRIMARY_ROUTES[seed.style].includes(route) || preferred.patternRole === 'MAIN'
      ? 'PRIMARY'
      : 'SECONDARY';
  pushEntry(entries, preferred, route, tier, 12);
};

const resolvePreferredRoute = (seed: KimariteRepertoireSeed): WinRoute | undefined =>
  seed.preferredMove ? inferWinRouteFromMove(seed.preferredMove) : undefined;

const resolveRouteSeed = (
  seed: KimariteRepertoireSeed,
): { primaryRoute: WinRoute; secondaryRoute?: WinRoute } => {
  const preferredRoute = resolvePreferredRoute(seed);
  const stylePrimary = STYLE_PRIMARY_ROUTES[seed.style][0] ?? 'BELT_FORCE';
  const styleSecondary = STYLE_SECONDARY_ROUTES[seed.style][0];
  const primaryRoute = preferredRoute ?? stylePrimary;
  const secondaryCandidates = unique([
    ...(preferredRoute && preferredRoute !== primaryRoute ? [stylePrimary] : []),
    styleSecondary,
    ...(seed.designedSecondaryStyle ? STYLE_SECONDARY_ROUTES[seed.designedSecondaryStyle] : []),
  ]).filter((route): route is WinRoute => Boolean(route) && route !== primaryRoute);
  const secondaryRoute = secondaryCandidates[0];
  return { primaryRoute, secondaryRoute };
};

export const createKimariteRepertoireFromSeed = (
  seed: KimariteRepertoireSeed,
): KimariteRepertoire => {
  const { primaryRoute, secondaryRoute } = resolveRouteSeed(seed);
  const primaryRoutes = [primaryRoute];
  const secondaryRoutes = secondaryRoute ? [secondaryRoute] : [];

  const entries: KimariteRepertoireEntry[] = [];
  collectRouteCandidates(primaryRoute, seed)
    .filter((entry) => entry.patternRole === 'MAIN' || entry.patternRole === 'ALT')
    .slice(0, seed.style === 'GRAPPLE' || seed.style === 'TECHNIQUE' ? 3 : 2)
    .forEach((entry, index) =>
      pushEntry(
        entries,
        entry,
        primaryRoute,
        index === 0 ? 'PRIMARY' : 'SECONDARY',
        scoreEntryForSeed(entry, primaryRoute, seed),
      ),
    );

  if (secondaryRoute) {
    collectRouteCandidates(secondaryRoute, seed)
      .filter((entry) => entry.patternRole === 'MAIN' || entry.patternRole === 'ALT')
      .slice(0, 2)
      .forEach((entry, index) =>
        pushEntry(
          entries,
          entry,
          secondaryRoute,
          index === 0 || entry.patternRole === 'MAIN' ? 'SECONDARY' : 'CONTEXT',
          scoreEntryForSeed(entry, secondaryRoute, seed),
        ),
      );
  }

  ensurePreferredMove(entries, seed);

  return {
    version: 1,
    provisional: !seed.kataSettled,
    primaryRoutes,
    secondaryRoutes,
    entries: normalizeEntries(entries),
  };
};

const toSeedFromStatus = (status: RikishiStatus): KimariteRepertoireSeed => ({
  style:
    status.tactics === 'PUSH'
      ? 'PUSH'
      : status.tactics === 'GRAPPLE'
        ? 'GRAPPLE'
        : status.tactics === 'TECHNIQUE'
          ? 'TECHNIQUE'
          : 'BALANCE',
  bodyType: status.bodyType,
  traits: status.traits ?? [],
  preferredMove: status.signatureMoves?.[0],
  designedSecondaryStyle: undefined,
  designedSecretStyle: undefined,
  kataSettled: Boolean(status.kataProfile?.settled),
});

const toKimariteStyle = (style: RikishiStatus['tactics'] | undefined): KimariteStyle | undefined => {
  if (!style) return undefined;
  if (style === 'PUSH') return 'PUSH';
  if (style === 'GRAPPLE') return 'GRAPPLE';
  if (style === 'TECHNIQUE') return 'TECHNIQUE';
  return 'BALANCE';
};

export const ensureKimariteRepertoire = (status: RikishiStatus): RikishiStatus => {
  if (status.kimariteRepertoire?.entries?.length) {
    return {
      ...status,
      kimariteRepertoire: {
        ...status.kimariteRepertoire,
        version: 1,
        primaryRoutes: unique(status.kimariteRepertoire.primaryRoutes ?? []).slice(0, 1),
        secondaryRoutes: unique(status.kimariteRepertoire.secondaryRoutes ?? []).slice(0, 1),
        entries: normalizeEntries(status.kimariteRepertoire.entries ?? []),
      },
    };
  }
  const seed: KimariteRepertoireSeed = {
    ...toSeedFromStatus(status),
    designedPrimaryStyle: status.designedStyleProfile ? toKimariteStyle(status.designedStyleProfile.primary === 'TSUKI_OSHI' || status.designedStyleProfile.primary === 'POWER_PRESSURE' ? 'PUSH' : status.designedStyleProfile.primary === 'YOTSU' || status.designedStyleProfile.primary === 'MOROZASHI' ? 'GRAPPLE' : 'TECHNIQUE') : undefined,
    designedSecondaryStyle: status.designedStyleProfile ? toKimariteStyle(status.designedStyleProfile.secondary === 'TSUKI_OSHI' || status.designedStyleProfile.secondary === 'POWER_PRESSURE' ? 'PUSH' : status.designedStyleProfile.secondary === 'YOTSU' || status.designedStyleProfile.secondary === 'MOROZASHI' ? 'GRAPPLE' : 'TECHNIQUE') : undefined,
    designedSecretStyle: status.designedStyleProfile?.secret ? toKimariteStyle(status.designedStyleProfile.secret === 'TSUKI_OSHI' || status.designedStyleProfile.secret === 'POWER_PRESSURE' ? 'PUSH' : status.designedStyleProfile.secret === 'YOTSU' || status.designedStyleProfile.secret === 'MOROZASHI' ? 'GRAPPLE' : 'TECHNIQUE') : undefined,
  };
  return {
    ...status,
    kimariteRepertoire: createKimariteRepertoireFromSeed(seed),
  };
};

export const routeToPattern = (route: WinRoute): KimaritePattern => ROUTE_TO_PATTERN[route];

export const inferWinRouteFromMove = (move: string): WinRoute | undefined => {
  const entry = findOfficialKimariteEntry(move);
  if (!entry) return undefined;
  if (entry.family === 'PUSH_THRUST') return 'PUSH_OUT';
  if (entry.family === 'FORCE_OUT') return 'BELT_FORCE';
  if (entry.family === 'THROW') return 'THROW_BREAK';
  if (entry.family === 'REAR') return 'REAR_FINISH';
  if (entry.family === 'TRIP_PICK') return 'LEG_ATTACK';
  if (entry.family === 'BACKWARD_BODY_DROP') return 'EDGE_REVERSAL';
  if (entry.requiredPatterns.includes('EDGE_REVERSAL')) return 'EDGE_REVERSAL';
  return 'PULL_DOWN';
};

export const evolveKimariteRepertoireAfterBasho = (
  status: RikishiStatus,
  record: BashoRecord,
  bashoSeq: number,
): RikishiStatus => {
  const ensured = ensureKimariteRepertoire(status);
  const current = ensured.kimariteRepertoire;
  if (!current) return ensured;
  const entries = current.entries.map((entry) => ({ ...entry }));
  const dominantRoute = Object.entries(record.winRouteCount ?? {})
    .sort((left, right) => (right[1] ?? 0) - (left[1] ?? 0))[0]?.[0] as WinRoute | undefined;

  for (const [move, count] of Object.entries(record.kimariteCount ?? {})) {
    if (count <= 0) continue;
    const normalized = normalizeKimariteName(move);
    const route = inferWinRouteFromMove(normalized);
    if (!route) continue;
    const existing = entries.find((entry) => entry.kimarite === normalized);
    if (existing) {
      existing.affinity += count * 0.45;
      if (count >= 3 && existing.tier === 'SECONDARY') existing.tier = 'PRIMARY';
      else if (count >= 2 && existing.tier === 'CONTEXT') existing.tier = 'SECONDARY';
      continue;
    }
    const official = findOfficialKimariteEntry(normalized);
    if (!official || official.patternRole === 'CONTEXT' || official.patternRole === 'RARE' || official.rarityBucket !== 'COMMON') continue;
    const routeIsStable = current.primaryRoutes.includes(route) || current.secondaryRoutes.includes(route);
    if (!routeIsStable || count < 3) continue;
    if (entries.length >= 6) continue;
    if (entries.filter((entry) => entry.route === route).length >= 3) continue;
    if (dominantRoute && route !== dominantRoute && !current.secondaryRoutes.includes(route)) continue;
    const tier: KimariteRepertoireTier = 'SECONDARY';
    entries.push({
      kimarite: normalized,
      route,
      tier,
      affinity: count * 0.9,
      unlockedAtBashoSeq: bashoSeq,
    });
  }

  const nextPrimaryRoutes = dominantRoute
    ? unique([dominantRoute, ...current.primaryRoutes]).slice(0, 1)
    : current.primaryRoutes;
  const nextSecondaryRoutes = unique([...current.secondaryRoutes])
    .filter((route) => !nextPrimaryRoutes.includes(route))
    .slice(0, 1);

  if (ensured.kataProfile?.settled && dominantRoute) {
    const topDominant = entries
      .filter((entry) => entry.route === dominantRoute)
      .sort((left, right) => right.affinity - left.affinity)[0];
    if (topDominant) topDominant.tier = 'PRIMARY';
  }

  return {
    ...ensured,
    kimariteRepertoire: {
      version: 1,
      provisional: !ensured.kataProfile?.settled,
      primaryRoutes: nextPrimaryRoutes,
      secondaryRoutes: nextSecondaryRoutes,
      entries: normalizeEntries(entries),
    },
  };
};
