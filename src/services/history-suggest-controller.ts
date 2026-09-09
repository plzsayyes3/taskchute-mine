import { App, Editor, Notice } from 'obsidian';
import { TaskLine } from '../core/task-line';
import { TaskLinerSettings } from '../settings';
import { HistoryService } from './history';
import { HistorySuggestService } from './history-suggest';
import { TaskHistorySuggestModal } from '../ui/task-history-suggest-modal';

export interface HistorySuggestControllerDeps {
    app: App;
    getSettings: () => TaskLinerSettings;
    historyService: HistoryService;
    historySuggestService: HistorySuggestService;
    findRunningTaskIndex: (editor: Editor) => number;
    findLatestExecutedTaskIndex: (editor: Editor) => number;
    debugSuggest: (...args: unknown[]) => void;
    debugSuggestAlways: (...args: unknown[]) => void;
}

export class HistorySuggestController {
    constructor(private readonly deps: HistorySuggestControllerDeps) {}

    async insertTaskFromHistorySuggest(editor: Editor) {
        const {
            app,
            getSettings,
            historyService,
            historySuggestService,
            findRunningTaskIndex,
            findLatestExecutedTaskIndex,
            debugSuggest,
            debugSuggestAlways,
        } = this.deps;

        debugSuggestAlways('command:insert-from-history', {
            debugSuggestLogs: !!getSettings()?.debugSuggestLogs,
        });

        await historyService.rebuildTaskHistoryIndex();
        const entries = historyService.historyEntriesForSuggest();
        const sampleTitles = entries.slice(0, 20).map((x) => ({
            title: x?.title,
            estimate: x?.estimate || '',
            count: x?.count || 0,
            lastUsedAt: x?.lastUsedAt || '',
        }));

        debugSuggestAlways('suggest:open', {
            entryCount: entries.length,
            sampleEntries: sampleTitles,
        });
        debugSuggestAlways(
            'suggest:open:titles',
            sampleTitles
                .map(
                    (x, i) =>
                        `${i + 1}. ${x.title || '(empty)'} | est=${x.estimate || '-'} | count=${x.count || 0} | last=${x.lastUsedAt || '-'}`
                )
                .join('\n')
        );

        if (entries.length === 0) {
            new Notice('過去の実行履歴が見つかりません');
            return;
        }

        const selected = await new Promise<any>((resolve) => {
            const modal = new TaskHistorySuggestModal(app, entries, resolve);
            modal.open();
        });
        debugSuggestAlways('suggest:selected:raw', selected);
        if (!selected) return;
        if (!selected.title) {
            new Notice('無効な履歴エントリです。インデックスを再構築してください。');
            debugSuggest('suggest:selected:invalid', selected);
            return;
        }

        const runningIdx = findRunningTaskIndex(editor);
        const latestIdx = findLatestExecutedTaskIndex(editor);
        const anchorIdx = runningIdx !== -1
            ? runningIdx
            : latestIdx !== -1
                ? latestIdx
                : editor.getCursor().line;
        const anchorObj = anchorIdx >= 0 && anchorIdx < editor.lineCount()
            ? TaskLine.parse(editor.getLine(anchorIdx))
            : null;

        const insertLineText = historySuggestService.buildTaskLineFromHistoryEntry(selected, anchorObj);
        debugSuggestAlways('suggest:insert', {
            selected,
            runningIdx,
            latestIdx,
            anchorIdx,
            insertLineText,
        });

        historySuggestService.insertTaskLineBelow(editor, anchorIdx, insertLineText);
        new Notice('過去タスクを挿入しました');
    }
}
