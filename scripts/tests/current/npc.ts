import { createInitialNpcUniverse } from '../../../src/logic/simulation/npc/factory';
import { intakeNewNpcRecruits, resolveIntakeCount } from '../../../src/logic/simulation/npc/intake';
import { reconcileNpcLeague } from '../../../src/logic/simulation/npc/leagueReconcile';
import { ensurePopulationPlan } from '../../../src/logic/simulation/npc/populationPlan';
import { countActiveByStable, NPC_STABLE_CATALOG, resolveIchimonByStableId } from '../../../src/logic/simulation/npc/stableCatalog';
import { createNpcNameContext, generateUniqueNpcShikona, isSurnameShikona } from '../../../src/logic/simulation/npc/npcShikonaGenerator';
import { ActorRegistry } from '../../../src/logic/simulation/npc/types';
import { createSekitoriBoundaryWorld } from '../../../src/logic/simulation/sekitoriQuota';
import { createLowerDivisionQuotaWorld } from '../../../src/logic/simulation/lowerQuota';
import { createSimulationWorld, syncPlayerActorInWorld } from '../../../src/logic/simulation/world';

import type { TestCase } from '../types';
import {
  assert,
  fail,
  assertRank,
  expectBashoStep,
  createStatus,
  createBashoRecord,
  createBashoRecordRow,
  createSekitoriSnapshot,
  buildNeutralSekitoriRecords,
  summarizeCareer,
  sequenceRng,
  lcg,
  createMockActor,
  assertActiveShikonaUnique,
  createTorikumiParticipant,
  pearsonCorrelation,
  createScoutDraft,
  resetDb,
  createCareerRateAccumulator,
  finalizeCareerRateAccumulator,
  pushCareerRateSample,
  buildCareerRateSample,
} from '../shared/currentHelpers';

export const tests: TestCase[] = [
{
    name: 'population plan: same year reuses plan and next year resamples',
    run: () => {
      const world = createSimulationWorld(lcg(20260401));
      const plan2026 = ensurePopulationPlan(world, 2026, lcg(20260402));
      const plan2026Again = ensurePopulationPlan(world, 2026, lcg(20260403));
      const plan2027 = ensurePopulationPlan(world, 2027, lcg(20260404));

      assert.equal(plan2026.sampledAtYear, 2026);
      assert.equal(plan2026Again.sampledAtYear, 2026);
      assert.equal(plan2026, plan2026Again);
      assert.equal(plan2027.sampledAtYear, 2027);
      assert.ok(plan2027 !== plan2026, 'Expected population plan to resample on a new year');
    },
  },
{
    name: 'npc intake: positive intake shock yields more recruits than negative shock',
    run: () => {
      const currentBanzukeHeadcount = 700;
      const positive = resolveIntakeCount(
        3,
        currentBanzukeHeadcount,
        {
          sampledAtYear: 2026,
          annualIntakeShock: 0.24,
          annualRetirementShock: -0.04,
          annualIntakeHardCap: 820,
          jonidanShock: 0.4,
          jonokuchiShock: 0.5,
          lowerDivisionElasticity: 1.15,
          sampledTotalSwing: 50,
          sampledJonidanSwing: 28,
          sampledJonokuchiSwing: 20,
        },
        lcg(11),
      );
      const negative = resolveIntakeCount(
        3,
        currentBanzukeHeadcount,
        {
          sampledAtYear: 2026,
          annualIntakeShock: -0.18,
          annualRetirementShock: 0.08,
          annualIntakeHardCap: 760,
          jonidanShock: -0.3,
          jonokuchiShock: -0.2,
          lowerDivisionElasticity: 0.92,
          sampledTotalSwing: 40,
          sampledJonidanSwing: 24,
          sampledJonokuchiSwing: 18,
        },
        lcg(11),
      );

      assert.ok(positive > negative, `Expected positive shock intake > negative shock, got ${positive} <= ${negative}`);
    },
  },
{
    name: 'npc pipeline: aptitudeFactor persists through league reconcile outputs',
    run: () => {
      const rng = lcg(20260304);
      const world = createSimulationWorld(rng);
      const lower = createLowerDivisionQuotaWorld(lcg(20260305), world);
      const boundary = createSekitoriBoundaryWorld(lcg(20260306));

      const target = world.lowerRosterSeeds.Makushita[0];
      assert.ok(Boolean(target), 'Expected Makushita seed NPC');
      if (!target) return;
      const persistent = world.npcRegistry.get(target.id);
      assert.ok(Boolean(persistent), 'Expected persistent NPC');
      if (!persistent) return;

      persistent.aptitudeTier = 'D';
      persistent.aptitudeFactor = 0.68;
      target.aptitudeTier = 'D';
      target.aptitudeFactor = 0.68;

      reconcileNpcLeague(world, lower, boundary, lcg(20260307), 1, 1);

      const worldSeed = world.lowerRosterSeeds.Makushita.find((npc) => npc.id === target.id);
      const lowerSeed = lower.rosters.Makushita.find((npc) => npc.id === target.id);
      const boundarySeed = boundary.makushitaPool.find((npc) => npc.id === target.id);
      assert.equal(worldSeed?.aptitudeTier, 'D');
      assert.equal(worldSeed?.aptitudeFactor, 0.68);
      assert.equal(lowerSeed?.aptitudeTier, 'D');
      assert.equal(lowerSeed?.aptitudeFactor, 0.68);
      assert.equal(boundarySeed?.aptitudeTier, 'D');
      assert.equal(boundarySeed?.aptitudeFactor, 0.68);
    },
  },
{
    name: 'league: reconcile follows lower-division shocks for jonidan and jonokuchi',
    run: () => {
      const rng = lcg(20260405);
      const world = createSimulationWorld(rng);
      const lower = createLowerDivisionQuotaWorld(rng, world);
      const boundary = createSekitoriBoundaryWorld(rng);
      boundary.npcRegistry = world.npcRegistry;
      boundary.makushitaPool =
        lower.rosters.Makushita as unknown as typeof boundary.makushitaPool;

      reconcileNpcLeague(
        world,
        lower,
        boundary,
        lcg(20260406),
        1,
        3,
        {
          sampledAtYear: 2026,
          annualIntakeShock: 0.22,
          annualRetirementShock: -0.05,
          annualIntakeHardCap: 840,
          jonidanShock: 0.85,
          jonokuchiShock: 0.9,
          lowerDivisionElasticity: 1.25,
          sampledTotalSwing: 54,
          sampledJonidanSwing: 32,
          sampledJonokuchiSwing: 24,
        },
      );

      assert.ok(lower.rosters.Jonidan.length >= 260, `Expected Jonidan shock expansion, got ${lower.rosters.Jonidan.length}`);
      assert.ok(lower.rosters.Jonokuchi.length >= 88, `Expected Jonokuchi shock expansion, got ${lower.rosters.Jonokuchi.length}`);
    },
  },
{
    name: 'league: heavy retirement is reconciled to active 42/28 in top divisions',
    run: () => {
      const rng = lcg(2027);
      const world = createSimulationWorld(rng);
      const lowerWorld = createLowerDivisionQuotaWorld(rng, world);
      const boundaryWorld = createSekitoriBoundaryWorld(rng);
      boundaryWorld.npcRegistry = world.npcRegistry;
      boundaryWorld.makushitaPool =
        lowerWorld.rosters.Makushita as unknown as typeof boundaryWorld.makushitaPool;

      const keepActive = new Set(
        [...world.rosters.Makuuchi, ...world.rosters.Juryo].slice(0, 3).map((row) => row.id),
      );
      for (const row of [...world.rosters.Makuuchi, ...world.rosters.Juryo]) {
        const npc = world.npcRegistry.get(row.id);
        if (!npc) continue;
        if (!keepActive.has(row.id)) npc.active = false;
      }

      reconcileNpcLeague(world, lowerWorld, boundaryWorld, rng, 1, 1);
      const activeMakuuchi = world.rosters.Makuuchi.filter(
        (row) => world.npcRegistry.get(row.id)?.active !== false,
      ).length;
      const activeJuryo = world.rosters.Juryo.filter(
        (row) => world.npcRegistry.get(row.id)?.active !== false,
      ).length;

      assert.equal(world.rosters.Makuuchi.length, 42);
      assert.equal(world.rosters.Juryo.length, 28);
      assert.equal(activeMakuuchi, 42);
      assert.equal(activeJuryo, 28);
      assert.ok(world.rosters.Makuuchi.every((row) => world.npcRegistry.get(row.id)?.active !== false));
      assert.ok(world.rosters.Juryo.every((row) => world.npcRegistry.get(row.id)?.active !== false));
    },
  },
{
    name: 'league: replenish path uses adjacency moves and intake lands in maezumo first',
    run: () => {
      const rng = lcg(500);
      const world = createSimulationWorld(rng);
      const lowerWorld = createLowerDivisionQuotaWorld(rng, world);
      const boundaryWorld = createSekitoriBoundaryWorld(rng);
      boundaryWorld.npcRegistry = world.npcRegistry;
      boundaryWorld.makushitaPool =
        lowerWorld.rosters.Makushita as unknown as typeof boundaryWorld.makushitaPool;

      for (const npc of world.npcRegistry.values()) {
        npc.active = false;
      }

      const report = reconcileNpcLeague(world, lowerWorld, boundaryWorld, rng, 2, 3);
      const order = ['Makuuchi', 'Juryo', 'Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi', 'Maezumo'];
      const toIndex = (division: string | undefined): number => order.indexOf(division || '');

      assert.ok(report.recruited > 0, 'Expected intake recruits under fully depleted league');
      assert.ok(
        report.moves.filter((move) => move.type === 'INTAKE').every((move) => move.to === 'Maezumo'),
        'INTAKE must land in Maezumo first',
      );
      for (const move of report.moves) {
        if (!move.from || move.type === 'INTAKE') continue;
        const fromIdx = toIndex(move.from);
        const toIdx = toIndex(move.to);
        if (move.type === 'PROMOTE') {
          assert.equal(fromIdx - toIdx, 1);
        } else {
          assert.equal(toIdx - fromIdx, 1);
        }
      }
    },
  },
{
    name: 'npc stable catalog: size is fixed at 45 entries',
    run: () => {
      assert.equal(NPC_STABLE_CATALOG.length, 45);
    },
  },
{
    name: 'npc stable catalog: scale distribution matches 1/4/9/15/12/4',
    run: () => {
      const distribution = NPC_STABLE_CATALOG.reduce(
        (acc, stable) => {
          acc[stable.scale] += 1;
          return acc;
        },
        {
          SUPER_GIANT: 0,
          GIANT: 0,
          LARGE: 0,
          MID: 0,
          SMALL: 0,
          TINY: 0,
        } as Record<'SUPER_GIANT' | 'GIANT' | 'LARGE' | 'MID' | 'SMALL' | 'TINY', number>,
      );

      assert.equal(distribution.SUPER_GIANT, 1);
      assert.equal(distribution.GIANT, 4);
      assert.equal(distribution.LARGE, 9);
      assert.equal(distribution.MID, 15);
      assert.equal(distribution.SMALL, 12);
      assert.equal(distribution.TINY, 4);
    },
  },
{
    name: 'npc stable catalog: small and tiny stables are 16 total',
    run: () => {
      const count = NPC_STABLE_CATALOG.filter(
        (stable) => stable.scale === 'SMALL' || stable.scale === 'TINY',
      ).length;
      assert.equal(count, 16);
    },
  },
{
    name: 'npc stable catalog: ichimon distribution matches 13/11/9/7/5',
    run: () => {
      const distribution = NPC_STABLE_CATALOG.reduce(
        (acc, stable) => {
          acc[stable.ichimonId] += 1;
          return acc;
        },
        {
          TAIJU: 0,
          KUROGANE: 0,
          RAIMEI: 0,
          HAKUTSURU: 0,
          HAYATE: 0,
        } as Record<'TAIJU' | 'KUROGANE' | 'RAIMEI' | 'HAKUTSURU' | 'HAYATE', number>,
      );

      assert.equal(distribution.TAIJU, 13);
      assert.equal(distribution.KUROGANE, 11);
      assert.equal(distribution.RAIMEI, 9);
      assert.equal(distribution.HAKUTSURU, 7);
      assert.equal(distribution.HAYATE, 5);

      for (const stable of NPC_STABLE_CATALOG) {
        assert.equal(resolveIchimonByStableId(stable.id), stable.ichimonId);
      }
    },
  },
{
    name: 'npc shikona: surname style appears more in lower divisions than sekitori',
    run: () => {
      const topRegistry: ActorRegistry = new Map();
      const topContext = createNpcNameContext();
      const topRng = lcg(20260223);
      let topSurname = 0;
      const topTotal = 1200;
      for (let i = 0; i < topTotal; i += 1) {
        const division = i % 2 === 0 ? 'Makuuchi' : 'Juryo';
        const stableId = `stable-${String((i % 45) + 1).padStart(3, '0')}`;
        const shikona = generateUniqueNpcShikona(
          stableId,
          division,
          topRng,
          topContext,
          topRegistry,
        );
        if (isSurnameShikona(shikona)) topSurname += 1;
        const id = `TOP-${i + 1}`;
        topRegistry.set(id, createMockActor(id, shikona, division, stableId));
      }

      const lowerRegistry: ActorRegistry = new Map();
      const lowerContext = createNpcNameContext();
      const lowerRng = lcg(20260224);
      const lowerDivisions: Array<'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi' | 'Maezumo'> = [
        'Makushita',
        'Sandanme',
        'Jonidan',
        'Jonokuchi',
        'Maezumo',
      ];
      let lowerSurname = 0;
      const lowerTotal = 2200;
      for (let i = 0; i < lowerTotal; i += 1) {
        const division = lowerDivisions[i % lowerDivisions.length];
        const stableId = `stable-${String((i % 45) + 1).padStart(3, '0')}`;
        const shikona = generateUniqueNpcShikona(
          stableId,
          division,
          lowerRng,
          lowerContext,
          lowerRegistry,
        );
        if (isSurnameShikona(shikona)) lowerSurname += 1;
        const id = `LOW-${i + 1}`;
        lowerRegistry.set(id, createMockActor(id, shikona, division, stableId));
      }

      const topRatio = topSurname / topTotal;
      const lowerRatio = lowerSurname / lowerTotal;
      assert.ok(topRatio >= 0.03 && topRatio <= 0.12, `Unexpected sekitori surname ratio: ${topRatio}`);
      assert.ok(lowerRatio >= 0.22 && lowerRatio <= 0.38, `Unexpected lower surname ratio: ${lowerRatio}`);
      assert.ok(lowerRatio > topRatio + 0.12, `Expected lower ratio > top ratio, got ${lowerRatio} vs ${topRatio}`);
    },
  },
{
    name: 'player name collision: colliding active NPC is renamed while player name is preserved',
    run: () => {
      const rng = lcg(20260225);
      const world = createSimulationWorld(rng);
      const targetNpc = world.rosters.Makuuchi.find((row) => row.id !== 'PLAYER');
      assert.ok(Boolean(targetNpc), 'Expected at least one active makuuchi NPC');
      if (!targetNpc) return;

      const beforeCollisionName = world.npcRegistry.get(targetNpc.id)?.shikona;
      assert.ok(Boolean(beforeCollisionName), 'Collision source shikona is missing');
      if (!beforeCollisionName) return;

      const status = createStatus({
        shikona: beforeCollisionName,
        rank: { division: 'Makuuchi', name: '前頭', number: 9, side: 'East' },
      });

      syncPlayerActorInWorld(world, status, rng);

      assert.equal(world.npcRegistry.get('PLAYER')?.shikona, beforeCollisionName);
      assert.ok(
        world.npcRegistry.get(targetNpc.id)?.shikona !== beforeCollisionName,
        'Colliding NPC should be renamed',
      );
      assertActiveShikonaUnique(world.npcRegistry, 'player-collision');
    },
  },
{
    name: 'npc universe: initial active total is 718 and stable headcounts stay near targets',
    run: () => {
      const universe = createInitialNpcUniverse(lcg(2026));
      const counts = countActiveByStable(universe.registry);
      let total = 0;

      for (const stable of NPC_STABLE_CATALOG) {
        const count = counts.get(stable.id) ?? 0;
        total += count;
        assert.ok(count >= Math.max(1, stable.minPreferred - 3));
        if (typeof stable.hardCap === 'number') {
          assert.ok(count <= stable.hardCap);
        } else {
          assert.ok(count <= stable.maxPreferred + 15);
        }
      }

      assert.equal(total, 718);
    },
  },
{
    name: 'npc universe: initial rank-power correlation is descending in every division',
    run: () => {
      const universe = createInitialNpcUniverse(lcg(2026));
      const divisions: Array<'Makuuchi' | 'Juryo' | 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi'> = [
        'Makuuchi',
        'Juryo',
        'Makushita',
        'Sandanme',
        'Jonidan',
        'Jonokuchi',
      ];
      for (const division of divisions) {
        const roster = universe.rosters[division];
        const correlation = pearsonCorrelation(
          roster.map((npc) => npc.rankScore),
          roster.map((npc) => npc.basePower),
        );
        assert.ok(
          correlation <= -0.25,
          `Expected negative correlation for ${division}, got ${correlation.toFixed(3)}`,
        );
        assert.ok(roster.every((npc) => Number.isFinite(npc.heightCm) && Number.isFinite(npc.weightKg)));
      }
    },
  },
{
    name: 'npc universe: same seed reproduces stable assignment sequence',
    run: () => {
      const universeA = createInitialNpcUniverse(lcg(77));
      const universeB = createInitialNpcUniverse(lcg(77));
      const toStableSequence = (registry: ReturnType<typeof createInitialNpcUniverse>['registry']): string[] =>
        [...registry.values()]
          .filter((npc) => npc.active)
          .sort((a, b) => Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]))
          .map((npc) => npc.stableId);

      assert.deepEqual(toStableSequence(universeA.registry), toStableSequence(universeB.registry));
    },
  },
{
    name: 'npc intake: small/tiny hard caps are respected through repeated intake',
    run: () => {
      const universe = createInitialNpcUniverse(lcg(1234));
      const months = [1, 3, 5, 7, 9, 11] as const;
      let seq = 0;

      for (let i = 0; i < 120; i += 1) {
        const activeCount = [...universe.registry.values()].filter((npc) => npc.active).length;
        const month = months[i % months.length];
        const intake = intakeNewNpcRecruits(universe, seq + 1, month, activeCount, undefined, lcg(5000 + i));
        universe.nextNpcSerial = intake.nextNpcSerial;
        seq += 1;
        assertActiveShikonaUnique(universe.registry, `intake-loop-${i}`);
      }

      const counts = countActiveByStable(universe.registry);
      for (const stable of NPC_STABLE_CATALOG) {
        if (stable.scale === 'SMALL') {
          assert.ok((counts.get(stable.id) ?? 0) <= 9);
        }
        if (stable.scale === 'TINY') {
          assert.ok((counts.get(stable.id) ?? 0) <= 4);
        }
      }
      assertActiveShikonaUnique(universe.registry, 'intake-final');
    },
  }
];
