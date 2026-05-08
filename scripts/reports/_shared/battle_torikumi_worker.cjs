const { parentPort, workerData } = require('worker_threads');
const { loadObservationModule } = require('./observation_module.cjs');
const { extractBattleTorikumiFeatures } = require('./battle_torikumi_features.cjs');

const executeWorkerTask = async () => {
  const { runCareerObservation } = loadObservationModule();
  const result = await runCareerObservation({
    seed: workerData.seed,
    simulationModelVersion: 'v3',
    populationKind: workerData.populationKind,
    populationPreset: workerData.populationPreset,
  });
  const features = extractBattleTorikumiFeatures(result);
  parentPort.postMessage(features);
};

executeWorkerTask().catch((error) => {
  console.error('Battle/torikumi worker error:', error);
  process.exit(1);
});
