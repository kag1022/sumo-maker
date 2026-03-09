import { TimelineEvent } from '../../models';
import { PauseReason } from './types';

export const resolvePauseReason = (events: TimelineEvent[]): PauseReason | undefined => {
  if (events.some((event) => event.type === 'RETIREMENT')) return 'RETIREMENT';
  if (events.some((event) => event.type === 'INJURY')) return 'INJURY';
  if (events.some((event) => event.type === 'PROMOTION')) return 'PROMOTION';
  return undefined;
};
