/// <reference lib="webworker" />

import { createSimulationRuntime } from '../../../logic/simulation/runtime';
import type { SimulationRuntime } from '../../../logic/simulation/runtime';
import type { BashoStepResult } from '../../../logic/simulation/engine/types';
import {
  DetailBuildProgress,
  SimulationDetailPolicy,
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from '../../../logic/simulation/workerProtocol';
import {
  resolveRuntimeNarrativeStep,
  type SimulationChapterKind,
} from '../../../logic/simulation/runtimeNarrative';
import { buildCareerEpilogueView, buildLiveBashoView } from '../../../logic/simulation/liveBashoView';
import {
  appendBashoChunk,
  appendBashoChunksBulk,
  discardDraftCareer,
  finalizeCareerDetails,
  markCareerReadyForReveal,
  markCareerCompleted,
} from '../../../logic/persistence/careers';
import { normalizeNewRunModelVersion } from '../../../logic/simulation/modelVersion';
import { defaultSimulationDependencies } from '../../../logic/simulation/deps';
import type { AppendBashoChunkParams } from '../../../logic/persistence/careers';

let runtime: SimulationRuntime | null = null;
let activeCareerId: string | null = null;
let stopped = false;
let loopRunning = false;
let pacing: 'chaptered' | 'observe' | 'skip_to_end' = 'chaptered';
let detailPolicy: SimulationDetailPolicy = 'eager';
let pausedForChapter = false;
let seenChapterKinds = new Set<SimulationChapterKind>();
let pendingChunks: AppendBashoChunkParams[] = [];
let flushedBashoCount = 0;
let bufferedYieldCount = 0;
let currentShikona = '力士';

const BUFFER_FLUSH_INTERVAL = 12;
const BUFFERED_YIELD_INTERVAL = 3;

const post = (message: SimulationWorkerResponse): void => {
  self.postMessage(message);
};

const buildPendingChunk = (step: BashoStepResult): AppendBashoChunkParams => ({
  careerId: activeCareerId ?? '',
  seq: step.seq,
  playerRecord: step.playerRecord,
  playerShikona: currentShikona,
  playerBouts: step.playerBouts,
  importantTorikumiNotes: step.importantTorikumiNotes,
  npcRecords: step.npcBashoRecords,
  banzukePopulation: step.banzukePopulation,
  banzukeDecisions: step.banzukeDecisions,
  diagnostics: step.diagnostics,
});

const buildDetailBuildProgress = (totalBashoCount: number): DetailBuildProgress => ({
  flushedBashoCount,
  totalBashoCount,
});

const flushPendingChunks = async (
  options?: {
    summaryStatus?: import('../../../logic/models').RikishiStatus;
    totalBashoCount?: number;
  },
): Promise<void> => {
  if (!activeCareerId || pendingChunks.length === 0) return;
  const chunks = pendingChunks;
  pendingChunks = [];
  await appendBashoChunksBulk(chunks, {
    summaryStatus: options?.summaryStatus,
    detailState: 'building',
  });
  flushedBashoCount += chunks.length;
  if (typeof options?.totalBashoCount === 'number') {
    post({
      type: 'DETAIL_BUILD_PROGRESS',
      payload: {
        careerId: activeCareerId,
        progress: buildDetailBuildProgress(options.totalBashoCount),
      },
    });
  }
};

const resumeLoop = (): void => {
  if (pausedForChapter) {
    pausedForChapter = false;
  }
  void runLoop();
};

const runLoop = async (): Promise<void> => {
  if (!runtime || loopRunning || pausedForChapter) return;
  loopRunning = true;

  try {
    while (runtime && !stopped && !pausedForChapter) {
      const step = await runtime.runNextSeasonStep();
      const careerId = activeCareerId;
      if (!careerId) break;

      if (step.kind === 'BASHO') {
        if (detailPolicy === 'buffered') {
          pendingChunks.push(buildPendingChunk(step));
          if (pendingChunks.length >= BUFFER_FLUSH_INTERVAL) {
            await flushPendingChunks({
              summaryStatus: runtime?.getStatus(),
              totalBashoCount: step.progress.bashoCount,
            });
          }
          if (step.seq === 1 || step.seq % BUFFERED_YIELD_INTERVAL === 0) {
            post({
              type: 'SEASON_STEP',
              payload: {
                careerId,
                mode: 'lite',
                progress: step.progress,
              },
            });
          }
          continue;
        }

        const statusSnapshot = step.statusSnapshot ?? runtime?.getStatus();
        if (!statusSnapshot) {
          throw new Error('Missing status snapshot for eager simulation progress');
        }
        await appendBashoChunk({
          careerId,
          seq: step.seq,
          playerRecord: step.playerRecord,
          playerShikona: statusSnapshot.shikona,
          summaryStatus: statusSnapshot,
          playerBouts: step.playerBouts,
          importantTorikumiNotes: step.importantTorikumiNotes,
          npcRecords: step.npcBashoRecords,
          banzukePopulation: step.banzukePopulation,
          banzukeDecisions: step.banzukeDecisions,
          diagnostics: step.diagnostics,
        });

        const narrative = resolveRuntimeNarrativeStep({
          step,
          seenChapterKinds,
          pacing,
        });
        if (narrative.markChapterKind) {
          seenChapterKinds.add(narrative.markChapterKind);
        }
        const latestBashoView = buildLiveBashoView({
          seq: step.seq,
          year: step.year,
          month: step.month,
          currentAge: statusSnapshot.age,
          playerRecord: step.playerRecord,
          playerBouts: step.playerBouts,
          importantTorikumiNotes: step.importantTorikumiNotes,
          diagnostics: step.diagnostics,
          chapter: {
            chapterKind: narrative.chapterKind,
            ...narrative.chapterCopy,
          },
        });
        const pauseForChapter = narrative.pauseForChapter;
        if (pauseForChapter) {
          pausedForChapter = true;
        }
        post({
          type: 'SEASON_STEP',
          payload: {
            careerId,
            mode: 'full',
            step,
            status: statusSnapshot,
            events: step.events,
            domainEvents: step.domainEvents ?? [],
            runtime: step.runtime ?? runtime.getSnapshot(),
            progress: step.progress,
            observation: narrative.observation,
            latestBashoView,
            pauseForChapter,
          },
        });

        if (pauseForChapter) {
          break;
        }
        continue;
      }

      if (detailPolicy === 'buffered') {
        const completedStatus = await markCareerReadyForReveal(careerId, step.statusSnapshot);
        post({
          type: 'RUNTIME_COMPLETED',
          payload: {
            careerId,
            step,
            status: completedStatus,
            events: step.events,
            domainEvents: step.domainEvents ?? [],
            runtime: step.runtime ?? runtime.getSnapshot(),
            progress: step.progress,
            pauseReason: step.pauseReason,
            latestBashoView: null,
            detailState: 'building',
          },
        });
        await flushPendingChunks({
          totalBashoCount: step.progress.bashoCount,
        });
        const finalizedStatus = await finalizeCareerDetails(careerId, completedStatus);
        post({
          type: 'DETAIL_BUILD_COMPLETED',
          payload: {
            careerId,
            status: finalizedStatus,
            progress: buildDetailBuildProgress(step.progress.bashoCount),
          },
        });
        runtime = null;
        activeCareerId = null;
        break;
      }

      const completedStatus = await markCareerCompleted(careerId, step.statusSnapshot);
      const narrative = resolveRuntimeNarrativeStep({
        step,
        seenChapterKinds,
        pacing,
        completedFallbackChapterKind: 'EPILOGUE',
      });
      if (narrative.markChapterKind) {
        seenChapterKinds.add(narrative.markChapterKind);
      }
      const effectiveChapterKind = narrative.chapterKind ?? 'EPILOGUE';
      const latestBashoView = buildCareerEpilogueView({
        status: completedStatus,
        progress: step.progress,
        chapterKind: effectiveChapterKind,
        chapterTitle: narrative.chapterCopy.chapterTitle,
        chapterReason: narrative.chapterCopy.chapterReason,
        nextBeatLabel: narrative.chapterCopy.nextBeatLabel,
      });
      const pauseForChapter = narrative.pauseForChapter;
      post({
        type: 'RUNTIME_COMPLETED',
        payload: {
          careerId,
          step,
          status: completedStatus,
          events: step.events,
          domainEvents: step.domainEvents ?? [],
          runtime: step.runtime ?? runtime.getSnapshot(),
          progress: step.progress,
          observation: narrative.observation,
          pauseReason: step.pauseReason,
          latestBashoView,
          pauseForChapter,
          detailState: 'ready',
        },
      });
      runtime = null;
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
      detailPolicy: nextDetailPolicy,
    } = message.payload;
    const normalizedModelVersion = normalizeNewRunModelVersion(simulationModelVersion);

    stopped = false;
    pacing = initialPacing;
    detailPolicy = nextDetailPolicy;
    pausedForChapter = false;
    seenChapterKinds = new Set();
    activeCareerId = careerId;
    pendingChunks = [];
    flushedBashoCount = 0;
    bufferedYieldCount = 0;
    currentShikona = initialStats.shikona;
    runtime = createSimulationRuntime({
      initialStats,
      oyakata,
      runOptions,
      careerId,
      banzukeMode: 'SIMULATE',
      simulationModelVersion: normalizedModelVersion,
      progressSnapshotMode: nextDetailPolicy === 'buffered' ? 'lite' : 'full',
      bashoSnapshotMode: nextDetailPolicy === 'buffered' ? 'none' : 'full',
    }, nextDetailPolicy === 'buffered'
      ? {
        yieldControl: async () => {
          bufferedYieldCount += 1;
          if (bufferedYieldCount % BUFFERED_YIELD_INTERVAL !== 0) {
            return;
          }
          await defaultSimulationDependencies.yieldControl();
        },
      }
      : undefined);
    void runLoop();
    return;
  }

  if (message.type === 'STOP') {
    const careerId = activeCareerId;
    stopped = true;
    pausedForChapter = false;
    runtime = null;
    activeCareerId = null;
    pendingChunks = [];
    flushedBashoCount = 0;
    currentShikona = '力士';
    if (careerId) {
      void discardDraftCareer(careerId);
    }
    return;
  }

  if (message.type === 'SET_PACING') {
    pacing = message.payload.pacing;
    if (pausedForChapter && pacing !== 'chaptered') {
      resumeLoop();
    }
    return;
  }

  if (message.type === 'RESUME') {
    resumeLoop();
  }
};

export {};
