import { useSimulationStore } from '../store/simulationStore';

export const useSimulation = () => ({
  phase: useSimulationStore((state) => state.phase),
  status: useSimulationStore((state) => state.status),
  progress: useSimulationStore((state) => state.progress),
  currentCareerId: useSimulationStore((state) => state.currentCareerId),
  isCurrentCareerSaved: useSimulationStore((state) => state.isCurrentCareerSaved),
  simulationPacing: useSimulationStore((state) => state.simulationPacing),
  latestBashoView: useSimulationStore((state) => state.latestBashoView),
  latestEvents: useSimulationStore((state) => state.latestEvents),
  observationLog: useSimulationStore((state) => state.observationLog),
  latestPauseReason: useSimulationStore((state) => state.latestPauseReason),
  hallOfFame: useSimulationStore((state) => state.hallOfFame),
  unshelvedCareers: useSimulationStore((state) => state.unshelvedCareers),
  errorMessage: useSimulationStore((state) => state.errorMessage),
  setSimulationPacing: useSimulationStore((state) => state.setSimulationPacing),
  startSimulation: useSimulationStore((state) => state.startSimulation),
  skipToEnd: useSimulationStore((state) => state.skipToEnd),
  revealCurrentResult: useSimulationStore((state) => state.revealCurrentResult),
  stopSimulation: useSimulationStore((state) => state.stopSimulation),
  saveCurrentCareer: useSimulationStore((state) => state.saveCurrentCareer),
  loadHallOfFame: useSimulationStore((state) => state.loadHallOfFame),
  loadUnshelvedCareers: useSimulationStore((state) => state.loadUnshelvedCareers),
  openCareer: useSimulationStore((state) => state.openCareer),
  deleteCareerById: useSimulationStore((state) => state.deleteCareerById),
  resetView: useSimulationStore((state) => state.resetView),
});

