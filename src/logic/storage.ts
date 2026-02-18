import { RikishiStatus } from './models';

const STORAGE_KEY = 'sumo-maker-v2-data';

export interface SavedRikishi {
    id: string;
    savedAt: string;
    status: RikishiStatus;
}

const MAX_RECORDS = 200;

export const saveRikishi = (status: RikishiStatus): void => {
    const data = loadAllRikishi();
    const newEntry: SavedRikishi = {
        id: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        status
    };

    const next = [...data, newEntry].slice(-MAX_RECORDS);

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
        console.error('Failed to save rikishi (storage quota exceeded?)', error);
    }
};

const isValidSavedRikishi = (item: any): item is SavedRikishi => {
    // Schema check to prevent runtime errors from malformed data
    if (
        typeof item !== 'object' || item === null ||
        typeof item.id !== 'string' ||
        typeof item.status !== 'object' || item.status === null ||
        typeof item.status.shikona !== 'string' ||
        typeof item.status.stats !== 'object'
    ) return false;

    // Validate nested history shape
    const h = item.status.history;
    if (
        typeof h !== 'object' || h === null ||
        !Array.isArray(h.records) ||
        typeof h.maxRank !== 'object' || h.maxRank === null ||
        typeof h.maxRank.name !== 'string' ||
        typeof h.totalWins !== 'number' ||
        typeof h.totalLosses !== 'number' ||
        typeof h.yushoCount !== 'object' || h.yushoCount === null
    ) return false;

    return true;
};

export const loadAllRikishi = (): SavedRikishi[] => {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return [];
    try {
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed)) return [];
        // Filter out invalid records safely
        return parsed.filter(isValidSavedRikishi);
    } catch (e) {
        console.error('Failed to load data', e);
        return [];
    }
};

export const deleteRikishi = (id: string): void => {
    const data = loadAllRikishi();
    const newData = data.filter(item => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
};
