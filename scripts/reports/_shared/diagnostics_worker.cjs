const { parentPort, workerData } = require('worker_threads');
const { loadObservationModule } = require('./observation_module.cjs');
const { extractCareerFeatures } = require('./career_diagnostics_features.cjs');

const executeWorkerTask = async () => {
  const { runCareerObservation } = loadObservationModule();
  const result = await runCareerObservation({
    seed: workerData.seed,
    simulationModelVersion: 'v3',
    populationKind: workerData.populationKind,
    populationPreset: workerData.populationPreset,
  });
  const features = extractCareerFeatures(result);
  parentPort.postMessage(features);
};

executeWorkerTask().catch((error) => {
  console.error('Diagnostics worker error:', error);
  process.exit(1);
});
