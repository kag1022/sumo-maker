const { parentPort, workerData } = require('worker_threads');
const { loadObservationModule } = require('./observation_module.cjs');

const executeWorkerTask = async () => {
  const { runCareerObservation } = loadObservationModule();
  const result = await runCareerObservation({
    seed: workerData.seed,
    simulationModelVersion: 'v3',
    aptitudeLadder: workerData.ladder,
  });
  parentPort.postMessage(result.summary);
};

executeWorkerTask().catch((error) => {
  console.error('Worker error:', error);
  process.exit(1);
});

