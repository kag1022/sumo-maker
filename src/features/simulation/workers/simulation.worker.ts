/// <reference lib="webworker" />

import { createSimulationEngine } from '../../../logic/simulation/engine';
import {
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from '../../../logic/simulation/workerProtocol';
import {
  appendBashoChunk,
  discardDraftCareer,
  markCareerCompleted,
} from '../../../logic/persistence/repository';

let engine: ReturnType<typeof createSimulationEngine> | null = null;
let activeCareerId: string | null = null;
let paused = false;
let stopped = false;
let loopRunning = false;

const post = (message: SimulationWorkerResponse): void => {
  self.postMessage(message);
};

const runLoop = async (): Promise<void> => {
  if (!engine || loopRunning) return;
  loopRunning = true;

  try {
    while (engine && !paused && !stopped) {
      const step = await engine.runNextBasho();
      const careerId = activeCareerId;
      if (!careerId) break;

      if (step.kind === 'BASHO') {
        await appendBashoChunk({
          careerId,
          seq: step.seq,
          playerRecord: step.playerRecord,
          playerBouts: step.playerBouts,
          npcRecords: step.npcBashoRecords,
          statusSnapshot: step.statusSnapshot,
          banzukePopulation: step.banzukePopulation,
          banzukeDecisions: step.banzukeDecisions,
        });

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
          },
        });

        if (step.pauseReason) {
          paused = true;
          post({
            type: 'PAUSED',
            payload: {
              careerId,
              reason: step.pauseReason,
              status: step.statusSnapshot,
              events: step.events,
              progress: step.progress,
            },
          });
        }

        continue;
      }

      await markCareerCompleted(careerId, step.statusSnapshot);
      post({
        type: 'COMPLETED',
        payload: {
          careerId,
          status: step.statusSnapshot,
          events: step.events,
          progress: step.progress,
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
    const { careerId, initialStats, oyakata } = message.payload;

    paused = false;
    stopped = false;
    activeCareerId = careerId;
    engine = createSimulationEngine({ initialStats, oyakata, careerId, banzukeMode: 'SIMULATE' });
    void runLoop();
    return;
  }

  if (message.type === 'PAUSE') {
    paused = true;
    return;
  }

  if (message.type === 'RESUME') {
    if (!engine || stopped) return;
    paused = false;
    void runLoop();
    return;
  }

  if (message.type === 'STOP') {
    const careerId = activeCareerId;
    stopped = true;
    paused = false;
    engine = null;
    activeCareerId = null;
    if (careerId) {
      void discardDraftCareer(careerId);
    }
  }
};

export {};
