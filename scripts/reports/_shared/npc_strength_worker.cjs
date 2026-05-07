const { parentPort, workerData } = require('worker_threads');
const { loadObservationModule } = require('./observation_module.cjs');
const { extractNpcStrengthFeatures } = require('./npc_strength_features.cjs');

const executeWorkerTask = async () => {
  const { runCareerObservation } = loadObservationModule();
  const result = await runCareerObservation({
    seed: workerData.seed,
    simulationModelVersion: 'v3',
    populationKind: workerData.populationKind,
    populationPreset: workerData.populationPreset,
  });
  const features = extractNpcStrengthFeatures(result);
  parentPort.postMessage(features);
};

executeWorkerTask().catch((error) => {
  console.error('NPC strength worker error:', error);
  process.exit(1);
});
