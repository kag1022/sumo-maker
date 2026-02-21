import { useSimulationStore } from '../store/simulationStore';

export const useSimulation = () => ({
  phase: useSimulationStore((state) => state.phase),
  status: useSimulationStore((state) => state.status),
  progress: useSimulationStore((state) => state.progress),
  currentCareerId: useSimulationStore((state) => state.currentCareerId),
  isCurrentCareerSaved: useSimulationStore((state) => state.isCurrentCareerSaved),
  isSkipToEnd: useSimulationStore((state) => state.isSkipToEnd),
  pauseReason: useSimulationStore((state) => state.pauseReason),
  latestEvents: useSimulationStore((state) => state.latestEvents),
  hallOfFame: useSimulationStore((state) => state.hallOfFame),
  errorMessage: useSimulationStore((state) => state.errorMessage),
  startSimulation: useSimulationStore((state) => state.startSimulation),
  pauseSimulation: useSimulationStore((state) => state.pauseSimulation),
  resumeSimulation: useSimulationStore((state) => state.resumeSimulation),
  skipToEnd: useSimulationStore((state) => state.skipToEnd),
  stopSimulation: useSimulationStore((state) => state.stopSimulation),
  saveCurrentCareer: useSimulationStore((state) => state.saveCurrentCareer),
  loadHallOfFame: useSimulationStore((state) => state.loadHallOfFame),
  openCareer: useSimulationStore((state) => state.openCareer),
  deleteCareerById: useSimulationStore((state) => state.deleteCareerById),
  resetView: useSimulationStore((state) => state.resetView),
});
