import { BanzukePopulationSnapshot } from '../../banzuke';
import { MakuuchiLayout } from '../../banzuke/scale/banzukeLayout';
import { BashoRecord, Division, RikishiStatus } from '../../models';
import { LowerDivisionQuotaWorld } from '../lowerQuota';
import { SimulationDiagnostics } from '../diagnostics';
import { resolveTopDivisionRank } from '../topDivision/rank';
import {
  countActiveBanzukeHeadcountExcludingMaezumo,
  countActiveMaezumoHeadcount,
  SimulationWorld,
  TopDivision,
} from '../world';
import { BanzukeEntry, SimulationProgressSnapshot } from './types';
import { SimulationProgressLite } from '../workerProtocol';

const toTopDivisionBanzuke = (
  division: TopDivision,
  roster: SimulationWorld['rosters'][TopDivision],
  makuuchiLayout: MakuuchiLayout,
): BanzukeEntry[] => roster
  .slice()
  .sort((a, b) => a.rankScore - b.rankScore)
  .map((rikishi) => {
    const rank = resolveTopDivisionRank(division, rikishi.rankScore, makuuchiLayout);
    return {
      id: rikishi.id,
      shikona: rikishi.shikona,
      division,
      rankScore: rikishi.rankScore,
      rankName: rank.name,
      rankNumber: rank.number,
      rankSide: rank.side,
    };
  });

const hasPrize = (
  prizes: string[],
  code: 'SHUKUN' | 'KANTO' | 'GINO',
): boolean => {
  if (code === 'SHUKUN') return prizes.includes('SHUKUN') || prizes.includes('殊勲賞');
  if (code === 'KANTO') return prizes.includes('KANTO') || prizes.includes('敢闘賞');
  return prizes.includes('GINO') || prizes.includes('技能賞');
};

const summarizeSansho = (records: BashoRecord[]): {
  total: number;
  shukun: number;
  kanto: number;
  gino: number;
} => {
  let shukun = 0;
  let kanto = 0;
  let gino = 0;
  for (const record of records) {
    const prizes = record.specialPrizes ?? [];
    if (hasPrize(prizes, 'SHUKUN')) shukun += 1;
    if (hasPrize(prizes, 'KANTO')) kanto += 1;
    if (hasPrize(prizes, 'GINO')) gino += 1;
  }
  return { total: shukun + kanto + gino, shukun, kanto, gino };
};

const DIVISION_KEYS: Division[] = [
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
  'Maezumo',
];

const createEmptyDivisionCounter = (): Record<Division, number> => ({
  Makuuchi: 0,
  Juryo: 0,
  Makushita: 0,
  Sandanme: 0,
  Jonidan: 0,
  Jonokuchi: 0,
  Maezumo: 0,
});

const buildDivisionHeadcount = (
  world: SimulationWorld,
): { headcount: Record<Division, number>; activeHeadcount: Record<Division, number> } => {
  const headcount = createEmptyDivisionCounter();
  const activeHeadcount = createEmptyDivisionCounter();

  for (const npc of world.npcRegistry.values()) {
    if (npc.actorType === 'PLAYER') continue;
    const division = DIVISION_KEYS.includes(npc.currentDivision) ? npc.currentDivision : 'Maezumo';
    headcount[division] += 1;
    if (npc.active) activeHeadcount[division] += 1;
  }

  return { headcount, activeHeadcount };
};

export const createPopulationSnapshot = (
  world: SimulationWorld,
  seq: number,
  year: number,
  month: number,
  detail?: {
    intakeCountThisBasho?: number;
    retiredCountThisBasho?: number;
  },
): BanzukePopulationSnapshot => {
  const counts = buildDivisionHeadcount(world);
  return {
    seq,
    year,
    month,
    headcount: counts.headcount,
    activeHeadcount: counts.activeHeadcount,
    banzukeHeadcountExcludingMaezumo: countActiveBanzukeHeadcountExcludingMaezumo(world),
    maezumoHeadcount: countActiveMaezumoHeadcount(world),
    intakeCountThisBasho: detail?.intakeCountThisBasho ?? 0,
    retiredCountThisBasho: detail?.retiredCountThisBasho ?? 0,
    populationPlanIntakeShock: world.populationPlan?.annualIntakeShock,
    populationPlanRetirementShock: world.populationPlan?.annualRetirementShock,
    populationPlanJonidanShock: world.populationPlan?.jonidanShock,
    populationPlanJonokuchiShock: world.populationPlan?.jonokuchiShock,
    populationPlanLowerDivisionElasticity: world.populationPlan?.lowerDivisionElasticity,
  };
};

export const createProgressSnapshot = (
  status: RikishiStatus,
  world: SimulationWorld,
  lowerDivisionQuotaWorld: LowerDivisionQuotaWorld,
  year: number,
  month: number,
  lastCommitteeWarnings: number,
  lastDiagnostics?: SimulationDiagnostics,
): SimulationProgressSnapshot => {
  const sansho = summarizeSansho(status.history.records);
  const counts = buildDivisionHeadcount(world);
  return {
    year,
    month,
    bashoCount: status.history.records.length,
    currentRank: { ...status.rank },
    divisionHeadcount: counts.headcount,
    divisionActiveHeadcount: counts.activeHeadcount,
    lastCommitteeWarnings,
    sanshoTotal: sansho.total,
    shukunCount: sansho.shukun,
    kantoCount: sansho.kanto,
    ginoCount: sansho.gino,
    makuuchiSlots: world.rosters.Makuuchi.length,
    juryoSlots: world.rosters.Juryo.length,
    makushitaSlots: lowerDivisionQuotaWorld.rosters.Makushita.length,
    sandanmeSlots: lowerDivisionQuotaWorld.rosters.Sandanme.length,
    jonidanSlots: lowerDivisionQuotaWorld.rosters.Jonidan.length,
    jonokuchiSlots: lowerDivisionQuotaWorld.rosters.Jonokuchi.length,
    makuuchiActive: world.rosters.Makuuchi.filter(
      (rikishi) => world.npcRegistry.get(rikishi.id)?.active !== false,
    ).length,
    juryoActive: world.rosters.Juryo.filter(
      (rikishi) => world.npcRegistry.get(rikishi.id)?.active !== false,
    ).length,
    makushitaActive: lowerDivisionQuotaWorld.rosters.Makushita.filter(
      (rikishi) => world.npcRegistry.get(rikishi.id)?.active !== false,
    ).length,
    sandanmeActive: lowerDivisionQuotaWorld.rosters.Sandanme.filter(
      (rikishi) => world.npcRegistry.get(rikishi.id)?.active !== false,
    ).length,
    jonidanActive: lowerDivisionQuotaWorld.rosters.Jonidan.filter(
      (rikishi) => world.npcRegistry.get(rikishi.id)?.active !== false,
    ).length,
    jonokuchiActive: lowerDivisionQuotaWorld.rosters.Jonokuchi.filter(
      (rikishi) => world.npcRegistry.get(rikishi.id)?.active !== false,
    ).length,
    makuuchi: toTopDivisionBanzuke('Makuuchi', world.rosters.Makuuchi, world.makuuchiLayout),
    juryo: toTopDivisionBanzuke('Juryo', world.rosters.Juryo, world.makuuchiLayout),
    lastDiagnostics,
  };
};

export const createProgressLite = (
  status: RikishiStatus,
  year: number,
  month: number,
): SimulationProgressLite => ({
  year,
  month,
  bashoCount: status.history.records.length,
  currentRank: { ...status.rank },
});
