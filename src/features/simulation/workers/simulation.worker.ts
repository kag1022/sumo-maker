/// <reference lib="webworker" />

import { createSimulationEngine } from '../../../logic/simulation/engine';
import {
  SimulationObservationEntry,
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from '../../../logic/simulation/workerProtocol';
import {
  appendBashoChunk,
  discardDraftCareer,
  markCareerCompleted,
} from '../../../logic/persistence/careers';
import { normalizeNewRunModelVersion } from '../../../logic/simulation/modelVersion';

let engine: ReturnType<typeof createSimulationEngine> | null = null;
let activeCareerId: string | null = null;
let stopped = false;
let loopRunning = false;
let pacing: 'observe' | 'skip_to_end' = 'skip_to_end';

const post = (message: SimulationWorkerResponse): void => {
  self.postMessage(message);
};

const formatRankName = (rank: import('../../../logic/models').Rank): string => {
  if (rank.name === '前相撲') return rank.name;
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) {
    return `${side}${rank.name}`;
  }
  return `${side}${rank.name}${rank.number || 1}枚目`;
};

const buildObservation = (
  step: Extract<Awaited<ReturnType<ReturnType<typeof createSimulationEngine>['runNextBasho']>>, { kind: 'BASHO' | 'COMPLETED' }>,
): SimulationObservationEntry => {
  if (step.kind === 'COMPLETED') {
    const finalRank = formatRankName(step.statusSnapshot.history.maxRank);
    return {
      seq: step.progress.bashoCount,
      year: step.progress.year,
      month: step.progress.month,
      kind: 'closing',
      headline: '生涯が閉じました',
      detail: `最高位 ${finalRank} / 通算 ${step.statusSnapshot.history.totalWins}勝${step.statusSnapshot.history.totalLosses}敗`,
    };
  }

  const event = step.events.find((row) => row.type === 'RETIREMENT')
    ?? step.events.find((row) => row.type === 'YUSHO')
    ?? step.events.find((row) => row.type === 'PROMOTION')
    ?? step.events.find((row) => row.type === 'INJURY');
  const recordText = `${step.playerRecord.wins}勝${step.playerRecord.losses}敗${step.playerRecord.absent > 0 ? ` ${step.playerRecord.absent}休` : ''}`;
  const rankLabel = formatRankName(step.playerRecord.rank);

  if (event?.type === 'YUSHO') {
    return {
      seq: step.seq,
      year: step.year,
      month: step.month,
      kind: 'milestone',
      headline: `${step.year}年${step.month}月場所で頂点に触れる`,
      detail: `${rankLabel}で ${recordText}。${event.description}`,
    };
  }
  if (event?.type === 'PROMOTION') {
    return {
      seq: step.seq,
      year: step.year,
      month: step.month,
      kind: 'milestone',
      headline: `${step.year}年${step.month}月場所で景色が変わる`,
      detail: event.description,
    };
  }
  if (event?.type === 'INJURY') {
    return {
      seq: step.seq,
      year: step.year,
      month: step.month,
      kind: 'danger',
      headline: `${step.year}年${step.month}月場所で影が差す`,
      detail: event.description,
    };
  }
  if (event?.type === 'RETIREMENT') {
    return {
      seq: step.seq,
      year: step.year,
      month: step.month,
      kind: 'closing',
      headline: `${step.year}年${step.month}月場所で土俵を去る`,
      detail: event.description,
    };
  }

  return {
    seq: step.seq,
    year: step.year,
    month: step.month,
    kind: 'result',
    headline: `${step.year}年${step.month}月場所を見届けた`,
    detail: `${rankLabel}で ${recordText}`,
  };
};

const runLoop = async (): Promise<void> => {
  if (!engine || loopRunning) return;
  loopRunning = true;

  try {
    while (engine && !stopped) {
      const step = await engine.runNextBasho();
      const careerId = activeCareerId;
      if (!careerId) break;

      if (step.kind === 'BASHO') {
        await appendBashoChunk({
          careerId,
          seq: step.seq,
          playerRecord: step.playerRecord,
          playerBouts: step.playerBouts,
          importantTorikumiNotes: step.importantTorikumiNotes,
          npcRecords: step.npcBashoRecords,
          statusSnapshot: step.statusSnapshot,
          banzukePopulation: step.banzukePopulation,
          banzukeDecisions: step.banzukeDecisions,
          diagnostics: step.diagnostics,
        });

        if (pacing === 'observe') {
          const observation = buildObservation(step);
          post({
            type: 'BASHO_PROGRESS',
            payload: {
              careerId,
              seq: step.seq,
              year: step.year,
              month: step.month,
              playerRecord: step.playerRecord,
              status: step.statusSnapshot,
              events: step.events,
              progress: step.progress,
              observation,
            },
          });
        }

        continue;
      }

      await markCareerCompleted(careerId, step.statusSnapshot);
      const observation = buildObservation(step);
      post({
        type: 'COMPLETED',
        payload: {
          careerId,
          status: step.statusSnapshot,
          events: step.events,
          progress: step.progress,
          observation,
          pauseReason: step.pauseReason,
        },
      });
      engine = null;
      activeCareerId = null;
      break;
    }
  } catch (error) {
    post({
      type: 'ERROR',
      payload: {
        careerId: activeCareerId || undefined,
        message: error instanceof Error ? error.message : 'Unknown worker error',
      },
    });
  } finally {
    loopRunning = false;
  }
};

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const message = event.data;

  if (message.type === 'START') {
    const {
      careerId,
      initialStats,
      oyakata,
      runOptions,
      simulationModelVersion,
      initialPacing,
    } = message.payload;
    const normalizedModelVersion = normalizeNewRunModelVersion(simulationModelVersion);

    stopped = false;
    pacing = initialPacing;
    activeCareerId = careerId;
    engine = createSimulationEngine({
      initialStats,
      oyakata,
      runOptions,
      careerId,
      banzukeMode: 'SIMULATE',
      simulationModelVersion: normalizedModelVersion,
    });
    void runLoop();
    return;
  }

  if (message.type === 'STOP') {
    const careerId = activeCareerId;
    stopped = true;
    engine = null;
    activeCareerId = null;
    if (careerId) {
      void discardDraftCareer(careerId);
    }
    return;
  }

  if (message.type === 'SET_PACING') {
    pacing = message.payload.pacing;
  }
};

export {};
