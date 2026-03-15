export type AppFlowPacing = 'observe' | 'skip_to_end';

export const resolveSimulationPhaseOnStart = (
  pacing: AppFlowPacing,
): 'running' | 'simulating' => (pacing === 'observe' ? 'running' : 'simulating');

export const resolveSimulationPhaseOnCompletion = (
  pacing: AppFlowPacing,
): 'completed' | 'reveal_ready' => (pacing === 'observe' ? 'completed' : 'reveal_ready');

export const shouldCaptureObservations = (pacing: AppFlowPacing): boolean => pacing === 'observe';
