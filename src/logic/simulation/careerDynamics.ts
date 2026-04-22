import { Rank, RikishiStatus, TimelineEvent } from '../models';
import { DomainEvent, DomainEventKind, ArcState, CareerActorState, TrajectoryProfile } from './runtimeTypes';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveCeilingBand = (status: RikishiStatus): TrajectoryProfile['ceilingBand'] => {
  if (status.careerBand === 'ELITE' && status.aptitudeTier === 'S') return 'YOKOZUNA';
  if (status.careerBand === 'ELITE' || status.careerBand === 'STRONG') return 'SANYAKU';
  if (status.rank.division === 'Makuuchi' || status.history.maxRank.division === 'Makuuchi') return 'SEKITORI';
  if (status.rank.division === 'Juryo' || status.history.maxRank.division === 'Juryo') return 'SEKITORI';
  if (status.rank.division === 'Makushita' || status.history.maxRank.division === 'Makushita') {
    return 'UPPER_MAKUSHITA';
  }
  return 'LOWER';
};

export const resolveTrajectoryProfile = (status: RikishiStatus): TrajectoryProfile => ({
  growthCurve: status.growthType,
  volatilityClass:
    status.genome?.variance?.formVolatility !== undefined
      ? status.genome.variance.formVolatility >= 60
        ? 'CHAOTIC'
        : status.genome.variance.formVolatility >= 42
          ? 'SWING'
          : 'STEADY'
      : status.ratingState.uncertainty >= 2
        ? 'CHAOTIC'
        : status.ratingState.uncertainty >= 1.4
          ? 'SWING'
          : 'STEADY',
  durabilityClass:
    status.retirementProfile === 'IRONMAN'
      ? 'IRON'
      : status.injuryLevel >= 6
        ? 'FRAGILE'
        : status.injuryLevel >= 2
          ? 'STANDARD'
          : 'IRON',
  reboundClass:
    (status.stagnation?.reboundBoost ?? 0) >= 0.12
      ? 'RESILIENT'
      : (status.stagnation?.pressure ?? 0) >= 2.4
        ? 'STICKY'
        : 'STANDARD',
  retirementClass: status.retirementProfile ?? 'STANDARD',
  ceilingBand: resolveCeilingBand(status),
});

const resolveArcPhase = (status: RikishiStatus, domainEvents: DomainEvent[]): ArcState['phase'] => {
  const recentKinds = new Set(domainEvents.slice(-4).map((event) => event.kind));
  const pressure = status.stagnation?.pressure ?? 0;
  if (recentKinds.has('CAREER_COLLAPSE') || pressure >= 3.6) return 'COLLAPSE';
  if (recentKinds.has('REBOUND_STARTED')) return 'REBOUND';
  if (recentKinds.has('SLUMP_STARTED') || pressure >= 2.2) return 'SLUMP';
  if (recentKinds.has('PROMOTION') || recentKinds.has('SEKITORI_BREAKTHROUGH')) return 'ASCENT';
  return pressure >= 1 ? 'STALL' : 'ASCENT';
};

export const resolveArcState = (
  status: RikishiStatus,
  domainEvents: DomainEvent[],
): ArcState => {
  const phase = resolveArcPhase(status, domainEvents);
  const latestSimilarEvent = [...domainEvents].reverse().find((event) => {
    if (phase === 'COLLAPSE') return event.kind === 'CAREER_COLLAPSE';
    if (phase === 'REBOUND') return event.kind === 'REBOUND_STARTED';
    if (phase === 'SLUMP') return event.kind === 'SLUMP_STARTED';
    if (phase === 'ASCENT') {
      return event.kind === 'PROMOTION' || event.kind === 'SEKITORI_BREAKTHROUGH';
    }
    return event.kind === 'SLUMP_STARTED' || event.kind === 'REBOUND_STARTED';
  });

  return {
    phase,
    phaseIntensity: clamp(status.stagnation?.pressure ?? 0, 0, 4.2),
    phaseDuration: latestSimilarEvent
      ? Math.max(1, status.history.records.length - latestSimilarEvent.seq + 1)
      : Math.max(1, status.history.records.length),
    carryoverPressure: clamp(status.stagnation?.pressure ?? 0, 0, 4.2),
    trigger: latestSimilarEvent?.title,
  };
};

const toSeverity = (kind: DomainEventKind): DomainEvent['severity'] => {
  if (kind === 'RETIREMENT' || kind === 'CAREER_COLLAPSE' || kind === 'MAJOR_INJURY') {
    return 'critical';
  }
  if (kind === 'SLUMP_STARTED' || kind === 'DEMOTION') return 'warning';
  return 'info';
};

const mapTimelineEventKind = (
  event: TimelineEvent,
  currentRank?: Rank,
): DomainEventKind | null => {
  if (event.type === 'RETIREMENT') return 'RETIREMENT';
  if (event.type === 'INJURY') return /重症度 ([7-9]|10)/.test(event.description) ? 'MAJOR_INJURY' : null;
  if (event.type === 'PROMOTION') {
    if (currentRank?.division === 'Juryo' || currentRank?.division === 'Makuuchi') {
      return 'SEKITORI_BREAKTHROUGH';
    }
    return 'PROMOTION';
  }
  if (event.type === 'DEMOTION') return 'DEMOTION';
  if (event.type === 'YUSHO') return 'YUSHO';
  return null;
};

export const buildDomainEvents = (input: {
  seq: number;
  year: number;
  month: number;
  events: TimelineEvent[];
  currentStatus: RikishiStatus;
  previousStatus?: RikishiStatus;
  pauseReason?: string;
}): DomainEvent[] => {
  const mapped: DomainEvent[] = [];

  input.events.forEach((event) => {
    const kind = mapTimelineEventKind(event, input.currentStatus.rank);
    if (!kind) return;
    mapped.push({
      seq: input.seq,
      year: input.year,
      month: input.month,
      kind,
      severity: toSeverity(kind),
      title: event.type,
      description: event.description,
      relatedRank: input.currentStatus.rank,
    });
  });

  const previousPressure = input.previousStatus?.stagnation?.pressure ?? 0;
  const currentPressure = input.currentStatus.stagnation?.pressure ?? 0;

  if (previousPressure < 2.2 && currentPressure >= 2.2) {
    mapped.push({
      seq: input.seq,
      year: input.year,
      month: input.month,
      kind: 'SLUMP_STARTED',
      severity: 'warning',
      title: '停滞開始',
      description: '停滞圧が危険水準に入り、番付とキャリアの両方に影響し始めた。',
      relatedRank: input.currentStatus.rank,
      metadata: { pressure: currentPressure },
    });
  }

  if (previousPressure >= 2.2 && currentPressure <= 1.1 && input.currentStatus.ratingState.form >= 0) {
    mapped.push({
      seq: input.seq,
      year: input.year,
      month: input.month,
      kind: 'REBOUND_STARTED',
      severity: 'info',
      title: '反発開始',
      description: '停滞圧が抜け、立て直しが明確に始まった。',
      relatedRank: input.currentStatus.rank,
      metadata: { pressure: currentPressure },
    });
  }

  if (
    input.pauseReason === 'RETIREMENT' &&
    (input.currentStatus.history.maxRank.division === 'Makushita' ||
      input.currentStatus.history.maxRank.division === 'Sandanme' ||
      input.currentStatus.history.maxRank.division === 'Jonidan' ||
      input.currentStatus.history.maxRank.division === 'Jonokuchi')
  ) {
    mapped.push({
      seq: input.seq,
      year: input.year,
      month: input.month,
      kind: 'CAREER_COLLAPSE',
      severity: 'critical',
      title: 'キャリア崩壊',
      description: '番付の反発線へ戻れないまま、土俵人生が閉じた。',
      relatedRank: input.currentStatus.rank,
      metadata: {
        pressure: currentPressure,
      },
    });
  }

  return mapped;
};

export const buildCareerActorState = (
  status: RikishiStatus,
  domainEvents: DomainEvent[],
): CareerActorState => ({
  status,
  trajectoryProfile: resolveTrajectoryProfile(status),
  arcState: resolveArcState(status, domainEvents),
});
