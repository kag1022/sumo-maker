import { RikishiStatus } from '../models';
import {
  buildCareerStartYearMonth,
  commitCareer,
  createDraftCareer,
  deleteCareer,
  discardDraftCareer,
  listCommittedCareers,
  loadCareerStatus,
  markCareerCompleted,
  appendBashoChunk,
  type CareerListItem,
} from './repository';

export type { CareerListItem };
export {
  appendBashoChunk,
  buildCareerStartYearMonth,
  commitCareer,
  createDraftCareer,
  deleteCareer,
  discardDraftCareer,
  listCommittedCareers,
  loadCareerStatus,
  markCareerCompleted,
};

export interface SavedRikishi {
  id: string;
  savedAt: string;
  status: RikishiStatus;
  careerStartYearMonth: string;
  careerEndYearMonth: string | null;
}

export const saveRikishi = async (status: RikishiStatus): Promise<string> => {
  const firstRecord = status.history.records[0];
  const startYear = firstRecord?.year || new Date().getFullYear();
  const startMonth = firstRecord?.month || 1;
  const careerId = await createDraftCareer({
    initialStatus: status,
    careerStartYearMonth: buildCareerStartYearMonth(startYear, startMonth),
  });
  await markCareerCompleted(careerId, status);
  await commitCareer(careerId);
  return careerId;
};

export const loadAllRikishi = async (): Promise<SavedRikishi[]> => {
  const rows = await listCommittedCareers();
  const results: SavedRikishi[] = [];

  for (const row of rows) {
    const status = await loadCareerStatus(row.id);
    if (!status || !row.savedAt) continue;
    results.push({
      id: row.id,
      savedAt: row.savedAt,
      status,
      careerStartYearMonth: row.careerStartYearMonth,
      careerEndYearMonth: row.careerEndYearMonth,
    });
  }

  return results;
};

export const deleteRikishi = async (id: string): Promise<void> => {
  await deleteCareer(id);
};

export const toSavedRikishiSummary = (row: CareerListItem): string =>
  `${row.careerStartYearMonth} - ${row.careerEndYearMonth || '現役'}`;
