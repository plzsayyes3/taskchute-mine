import { App, Notice, moment } from 'obsidian';
import { TaskLine } from '../core/task-line';
import {
    TaskHistoryEntry,
    isInvalidSuggestTitle,
    isTaskExecutionRecord,
    normalizeHistoryEntries,
    normalizeTaskTitle,
    upsertHistoryIndexEntry,
} from '../core/history';
import { DEFAULT_SETTINGS, TaskLinerSettings } from '../settings';

export interface TaskHistoryStats {
    fileCount: number;
    recordCount: number;
    uniqueCount: number;
}

export class HistoryService {
    constructor(
        private readonly app: App,
        private readonly getSettings: () => TaskLinerSettings,
        private readonly saveSettings: () => Promise<void>
    ) {}

    normalizeTaskTitle(title: unknown): string {
        return normalizeTaskTitle(title);
    }

    isInvalidSuggestTitle(title: unknown): boolean {
        return isInvalidSuggestTitle(title);
    }

    upsertHistoryIndexEntry(
        index: Record<string, TaskHistoryEntry>,
        lineObj: TaskLine,
        usedAt: string
    ): void {
        upsertHistoryIndexEntry(index, lineObj, usedAt);
    }

    private debugSuggest(...args: unknown[]) {
        if (!this.getSettings()?.debugSuggestLogs) return;
        console.warn('[taskchute-line:suggest]', ...args);
    }

    private debugSuggestAlways(...args: unknown[]) {
        console.warn('[taskchute-line:suggest]', ...args);
    }

    async rebuildTaskHistoryIndex(): Promise<TaskHistoryStats> {
        const settings = this.getSettings();
        const folderPath = settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
        const files = this.app.vault.getFiles().filter(
            (f) => f.path.startsWith(folderPath + '/') && f.extension === 'md'
        );
        const nextIndex: Record<string, TaskHistoryEntry> = {};
        let recordCount = 0;
        let droppedNoTitle = 0;
        let droppedPseudo = 0;
        let usedParentFallback = 0;
        const sampleAdded: unknown[] = [];
        const sampleDropped: unknown[] = [];

        this.debugSuggest('rebuild:start', { folderPath, fileCount: files.length });

        for (const file of files) {
            let content = '';
            try {
                content = await this.app.vault.read(file);
            } catch (err) {
                console.error('Failed to read log file for history index:', file?.path, err);
                continue;
            }
            const dateMatch = file.basename.match(/^\d{4}-\d{2}-\d{2}$/);
            const datePart = dateMatch ? dateMatch[0] : '0000-00-00';
            const lines = String(content || '').split(/\r?\n/);
            let currentParentTask: TaskLine | null = null;
            let fileAdded = 0;
            let fileDropped = 0;

            for (const line of lines) {
                const parsed = TaskLine.parse(line);
                if (!parsed) continue;

                const isChild = parsed.indent.length > 0;
                if (!isChild) {
                    currentParentTask = parsed;
                }

                if (!isTaskExecutionRecord(parsed)) {
                    continue;
                }

                const timePart = parsed.actualEnd || parsed.actualStart || parsed.skippedAt || '0000';
                const usedAt = `${datePart} ${timePart}`;

                let source = parsed;
                if (isChild && currentParentTask && normalizeTaskTitle(currentParentTask.title)) {
                    source = currentParentTask;
                    usedParentFallback++;
                }

                const sourceTitle = normalizeTaskTitle(source.title);
                if (!sourceTitle || isInvalidSuggestTitle(sourceTitle)) {
                    droppedNoTitle++;
                    fileDropped++;
                    if (sampleDropped.length < 10) {
                        sampleDropped.push({ file: file.path, line, reason: 'invalid-title' });
                    }
                    continue;
                }

                recordCount++;
                fileAdded++;
                upsertHistoryIndexEntry(nextIndex, source, usedAt);
                if (sampleAdded.length < 10) {
                    sampleAdded.push({ usedAt, title: sourceTitle, file: file.path });
                }
            }

            this.debugSuggest('rebuild:file', {
                file: file.path,
                lines: lines.length,
                added: fileAdded,
                dropped: fileDropped,
            });
        }

        settings.taskHistoryIndex = nextIndex;
        settings.taskHistoryIndexUpdatedAt = moment().format('YYYY-MM-DD HH:mm:ss');
        settings.taskHistoryIndexVersion = DEFAULT_SETTINGS.taskHistoryIndexVersion;
        await this.saveSettings();

        this.debugSuggest('rebuild:done', {
            uniqueCount: Object.keys(nextIndex).length,
            recordCount,
            droppedNoTitle,
            droppedPseudo,
            usedParentFallback,
            sampleAdded,
            sampleDropped,
        });

        return {
            fileCount: files.length,
            recordCount,
            uniqueCount: Object.keys(nextIndex).length,
        };
    }

    async rebuildTaskSuggestIndexCommand() {
        this.debugSuggestAlways('command:rebuild-index', {
            debugSuggestLogs: !!this.getSettings()?.debugSuggestLogs,
        });
        const stats = await this.rebuildTaskHistoryIndex();
        new Notice(
            `サジェスト索引を更新: ${stats.uniqueCount}件（記録${stats.recordCount}件 / ファイル${stats.fileCount}件）`
        );
    }

    historyEntriesForSuggest(): TaskHistoryEntry[] {
        const result = normalizeHistoryEntries(this.getSettings().taskHistoryIndex || {});
        this.debugSuggest('suggest:entries:normalize', {
            rawCount: result.rawCount,
            normalizedCount: result.normalizedCount,
            mergedCount: result.mergedCount,
            invalidAfterMerge: result.invalidAfterMerge,
            dropped: result.dropped,
            droppedSamples: result.droppedSamples,
        });
        return result.entries;
    }
}
