import { TaskLine } from './task-line';

export interface TaskHistoryEntry {
    title: string;
    estimate: string;
    count: number;
    lastUsedAt: string;
}

export interface HistoryNormalizationResult {
    entries: TaskHistoryEntry[];
    rawCount: number;
    normalizedCount: number;
    mergedCount: number;
    invalidAfterMerge: number;
    dropped: number;
    droppedSamples: Array<{ key: string; value: unknown }>;
}

export function normalizeTaskTitle(title: unknown): string {
    return String(title || '').replace(/\s+/g, ' ').trim();
}

export function isInvalidSuggestTitle(title: unknown): boolean {
    const t = normalizeTaskTitle(title);
    if (!t) return true;
    if (/^\+\d+\s*m(?:in)?$/i.test(t)) return true;
    if (/^(?:\d{1,2}:\d{2}|\d{3,4})?[-－ー](?:\d{1,2}:\d{2}|\d{3,4})?$/.test(t)) return true;
    if (/^[-－ー]+$/.test(t)) return true;
    return false;
}

export function isTaskExecutionRecord(lineObj: TaskLine | null): boolean {
    if (!lineObj) return false;
    return !!(lineObj.actualStart || lineObj.actualEnd || lineObj.skippedAt || lineObj.isChecked);
}

export function upsertHistoryIndexEntry(
    index: Record<string, TaskHistoryEntry>,
    lineObj: TaskLine,
    usedAt: string
): void {
    const title = normalizeTaskTitle(lineObj.title);
    if (!title) return;
    const key = title.toLowerCase();
    const prev = index[key];
    const next: TaskHistoryEntry = prev ? { ...prev } : {
        title,
        estimate: '',
        count: 0,
        lastUsedAt: '',
    };

    next.count += 1;

    if (!next.lastUsedAt || (usedAt && usedAt > next.lastUsedAt)) {
        next.lastUsedAt = usedAt;
        next.title = title;
        if (lineObj.estimate) {
            next.estimate = lineObj.estimate;
        }
    } else if (!next.estimate && lineObj.estimate) {
        next.estimate = lineObj.estimate;
    }

    index[key] = next;
}

export function normalizeHistoryEntries(rawValue: unknown): HistoryNormalizationResult {
    const raw = (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue))
        ? rawValue as Record<string, unknown>
        : {};
    const normalized: TaskHistoryEntry[] = [];
    let dropped = 0;
    const droppedSamples: Array<{ key: string; value: unknown }> = [];

    for (const [key, value] of Object.entries(raw)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const entry = value as Record<string, unknown>;
            const title = normalizeTaskTitle(entry.title || key);
            if (!title || isInvalidSuggestTitle(title)) {
                dropped++;
                if (droppedSamples.length < 10) droppedSamples.push({ key, value });
                continue;
            }
            const numericCount = typeof entry.count === 'number' && Number.isFinite(entry.count)
                ? entry.count
                : parseInt(String(entry.count || '0'), 10) || 0;
            normalized.push({
                title,
                estimate: entry.estimate ? String(entry.estimate) : '',
                count: numericCount,
                lastUsedAt: entry.lastUsedAt ? String(entry.lastUsedAt) : '',
            });
            continue;
        }

        const fallbackTitle = normalizeTaskTitle(key);
        if (!fallbackTitle || isInvalidSuggestTitle(fallbackTitle)) {
            dropped++;
            if (droppedSamples.length < 10) droppedSamples.push({ key, value });
            continue;
        }
        normalized.push({
            title: fallbackTitle,
            estimate: typeof value === 'string' && /^\d+$/.test(value) ? value : '',
            count: typeof value === 'number' ? value : 0,
            lastUsedAt: '',
        });
    }

    const dedup: Record<string, TaskHistoryEntry> = {};
    for (const item of normalized) {
        const k = normalizeTaskTitle(item.title).toLowerCase();
        const prev = dedup[k];
        if (!prev) {
            dedup[k] = { ...item };
            continue;
        }
        prev.count = (prev.count || 0) + (item.count || 0);
        if (!prev.estimate && item.estimate) prev.estimate = item.estimate;
        if ((item.lastUsedAt || '') > (prev.lastUsedAt || '')) {
            prev.lastUsedAt = item.lastUsedAt;
            prev.title = item.title;
            if (item.estimate) prev.estimate = item.estimate;
        }
    }

    const merged = Object.values(dedup);
    const invalidAfterMerge = merged.filter((x) => isInvalidSuggestTitle(x?.title)).length;
    const entries = merged.sort((a, b) => {
        if ((b.lastUsedAt || '') !== (a.lastUsedAt || '')) {
            return (b.lastUsedAt || '').localeCompare(a.lastUsedAt || '');
        }
        return (b.count || 0) - (a.count || 0);
    });

    return {
        entries,
        rawCount: Object.keys(raw).length,
        normalizedCount: normalized.length,
        mergedCount: merged.length,
        invalidAfterMerge,
        dropped,
        droppedSamples,
    };
}
