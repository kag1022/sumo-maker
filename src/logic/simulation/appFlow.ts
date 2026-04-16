export type AppFlowPacing = 'chaptered' | 'observe' | 'skip_to_end';

export const resolveSimulationPhaseOnStart = (
  pacing: AppFlowPacing,
): 'running' | 'simulating' => (pacing === 'skip_to_end' ? 'simulating' : 'running');

export const resolveSimulationPhaseOnCompletion = (
  pacing: AppFlowPacing,
): 'completed' | 'reveal_ready' => (pacing === 'observe' ? 'completed' : 'reveal_ready');

export const shouldCaptureObservations = (pacing: AppFlowPacing): boolean => pacing !== 'skip_to_end';
