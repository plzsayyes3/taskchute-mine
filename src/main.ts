import { TaskLine, normalizeTimeStr, setLineKeepScroll, adjustTaskLineTime } from './core/task-line';
import { DEFAULT_SETTINGS, TaskLinerSettings } from './settings';
import { TaskChuteLineSettingTab } from './settings-tab';
import { DailyNoteService } from './services/daily-note';
import { TechoService } from './services/techo';
import { HistoryService } from './services/history';
import { HistorySuggestService } from './services/history-suggest';
import { HistorySuggestController } from './services/history-suggest-controller';
import { DashboardUiService } from './services/dashboard-ui';
import { TaskExecutionService } from './services/task-execution';
import { TaskPlanningService } from './services/task-planning';
import { registerTaskLinerCommands } from './commands/register-commands';
import { registerCheckboxClickHook } from './lifecycle/register-checkbox-hook';
import { registerTaskLinerUiRuntime } from './lifecycle/register-ui-runtime';
import { buildDashboardPanelExtension } from './ui/dashboard-panel';
import { TaskChuteCalendarView } from './ui/task-chute-calendar-view';
import { TaskChuteScrollView } from './ui/task-chute-scroll-view';
import { taskChuteStyleExtension } from './editor/task-chute-style-extension';
import { TaskTextModal, DatePickerModal, TimePunchModal, TemplateSelectModal, RollRepeatModal } from './ui/task-modals';

import * as obsidian from 'obsidian';
import { Plugin, moment, Modal, Setting, Notice, PluginSettingTab, TFolder, setIcon, TFile, View, App } from 'obsidian';
import { ViewPlugin, Decoration, showPanel, EditorView } from '@codemirror/view';
import { RangeSetBuilder, StateField, StateEffect } from '@codemirror/state';

class TaskLinerPlugin extends Plugin {
    settings: TaskLinerSettings;
    dailyNoteService: DailyNoteService;
    techoService: TechoService;
    historyService: HistoryService;
    historySuggestService: HistorySuggestService;
    historySuggestController: HistorySuggestController;
    dashboardUiService: DashboardUiService;
    taskExecutionService: TaskExecutionService;
    taskPlanningService: TaskPlanningService;
    statusBarEl: HTMLElement;
    topBarEl: HTMLElement;
    topBarLine1El: HTMLElement;
    topBarLine2El: HTMLElement;
    topBarLine3El: HTMLElement;
    topBarLine4El: HTMLElement;
    topBarToggleEl: HTMLElement;
    topBarReloadEl: HTMLElement;
    topBarIntervalId: number;
    _topBarExpanded: boolean;
    _weatherCache: any;
    _weatherCacheTime: number;
    dashboardPanelExtension: any;

	async onload() {
        await this.loadSettings();
        this.dailyNoteService = new DailyNoteService(this.app, () => this.settings);
        this.techoService = new TechoService(this.app, () => this.settings);
        this.historyService = new HistoryService(this.app, () => this.settings, () => this.saveSettings());
        this.historySuggestService = new HistorySuggestService();
        this.dashboardUiService = new DashboardUiService(this);
        this.taskExecutionService = new TaskExecutionService(this.app);
        this.taskPlanningService = new TaskPlanningService(
            this.app,
            () => this.settings,
            (lineObj) => this.isCompletedLineObj(lineObj),
            () => this.openTodaysNote(),
        );
        this.historySuggestController = new HistorySuggestController({
            app: this.app,
            getSettings: () => this.settings,
            historyService: this.historyService,
            historySuggestService: this.historySuggestService,
            findRunningTaskIndex: (editor) => this._findRunningTaskIndex(editor),
            findLatestExecutedTaskIndex: (editor) => this._findLatestExecutedTaskIndex(editor),
            debugSuggest: (...args) => this.debugSuggest(...args),
            debugSuggestAlways: (...args) => this.debugSuggestAlways(...args),
        });
        this.addSettingTab(new TaskChuteLineSettingTab(this.app, this));

        try {
            this.registerEditorExtension(taskChuteStyleExtension);
        } catch (e) {
            console.error("TaskChuteLine CSS Extension failed to load", e);
        }

        registerCheckboxClickHook.call(this);

        registerTaskLinerCommands.call(this);

        registerTaskLinerUiRuntime.call(this, {
            createCalendarView: (leaf) => new TaskChuteCalendarView(leaf, this),
            createScrollView: (leaf) => new TaskChuteScrollView(leaf, this),
            buildDashboardPanelExtension,
        });
	}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        if (this.topBarEl && this.topBarEl.parentNode) {
            this.topBarEl.parentNode.removeChild(this.topBarEl);
            this.topBarEl = null;
        }
        if (this.topBarIntervalId) {
            window.clearInterval(this.topBarIntervalId);
        }
    }

    isLogFilePath(filePath) {
        return this.dashboardUiService.isLogFilePath(filePath);
    }

    computeDashboardData(text) {
        return this.dashboardUiService.computeDashboardData(text);
    }

    formatMinutes(min) {
        return this.dashboardUiService.formatMinutes(min);
    }

    getCurrentBlockInfo(lines) {
        return this.dashboardUiService.getCurrentBlockInfo(lines);
    }

    async computeDailyNoteStats(dateStr) {
        return this.dashboardUiService.computeDailyNoteStats(dateStr);
    }

    async fetchWeatherData() {
        return this.dashboardUiService.fetchWeatherData();
    }

    weatherCodeToEmoji(code) {
        return this.dashboardUiService.weatherCodeToEmoji(code);
    }

    buildDayProgressBar(width) {
        return this.dashboardUiService.buildDayProgressBar(width);
    }

    buildWeekIndicator() {
        return this.dashboardUiService.buildWeekIndicator();
    }

    formatRemainingTime(minutes) {
        return this.dashboardUiService.formatRemainingTime(minutes);
    }

    async updateStatusBar() {
        return this.dashboardUiService.updateStatusBar();
    }

    initTopBar() {
        return this.dashboardUiService.initTopBar();
    }

    async updateTopBar() {
        return this.dashboardUiService.updateTopBar();
    }

    getCursorTaskLineInfo(editor) {
        return this.taskExecutionService.getCursorTaskLineInfo(editor);
    }

    isSkippedLineObj(lineObj) {
        return this.taskExecutionService.isSkippedLineObj(lineObj);
    }

    _handleCheckboxShortPress(editor, targetIdx) {
        return this.taskExecutionService._handleCheckboxShortPress(editor, targetIdx);
    }

    _handleCheckboxLongPress(editor, targetIdx) {
        return this.taskExecutionService._handleCheckboxLongPress(editor, targetIdx);
    }

    findLatestEndTime(editor) {
        return this.taskExecutionService.findLatestEndTime(editor);
    }

    startTaskFromPreviousEnd(editor, targetIdx) {
        return this.taskExecutionService.startTaskFromPreviousEnd(editor, targetIdx);
    }

    _endCurrentlyRunningTask(editor, endTime) {
        return this.taskExecutionService._endCurrentlyRunningTask(editor, endTime);
    }

    startTask(editor, targetIdx) {
        return this.taskExecutionService.startTask(editor, targetIdx);
    }

    endTask(editor, targetIdx) {
        return this.taskExecutionService.endTask(editor, targetIdx);
    }

    isRunningLineObj(lineObj) {
        return this.taskExecutionService.isRunningLineObj(lineObj);
    }

    isCompletedLineObj(lineObj) {
        return this.taskExecutionService.isCompletedLineObj(lineObj);
    }

    isStartableLineObj(lineObj) {
        return this.taskExecutionService.isStartableLineObj(lineObj);
    }

    isTaskExecutionRecord(lineObj) {
        return this.taskExecutionService.isTaskExecutionRecord(lineObj);
    }

    debugSuggest(...args) {
        if (!this.settings?.debugSuggestLogs) return;
        console.warn("[taskchute-line:suggest]", ...args);
    }

    debugSuggestAlways(...args) {
        console.warn("[taskchute-line:suggest]", ...args);
    }

    endAndStartTask(editor) {
        return this.taskExecutionService.endAndStartTask(editor);
    }

    skipTask(editor) {
        return this.taskExecutionService.skipTask(editor);
    }

    async skipTaskWithDate(editor) {
        return this.taskExecutionService.skipTaskWithDate(editor);
    }

    toggleTaskStatus(editor) {
        return this.taskExecutionService.toggleTaskStatus(editor);
    }

    resumeTask(editor) {
        return this.taskExecutionService.resumeTask(editor);
    }

    timePunch(editor) {
        return this.taskExecutionService.timePunch(editor);
    }

    getTargetDate() {
        return this.techoService.getTargetDate();
    }

    normalizeTechoHeader(header) {
        return this.techoService.normalizeTechoHeader(header);
    }

    extractTechoItemsForDate(content, dateStr) {
        return this.techoService.extractTechoItemsForDate(content, dateStr);
    }

    applyTechoImportToLog(content, header, items, mode) {
        return this.techoService.applyTechoImportToLog(content, header, items, mode);
    }

    async importTechoToday(editor) {
        return this.techoService.importTechoToday(editor);
    }

    async importYesterdayCarryover(editor) {
        return this.taskPlanningService.importYesterdayCarryover(editor);
    }

    async getTemplateFiles() {
        return this.taskPlanningService.getTemplateFiles();
    }

    extractTemplateSectionsAllLevels(content) {
        return this.taskPlanningService.extractTemplateSectionsAllLevels(content);
    }

    async insertTemplatesMultiSelect(editor) {
        return this.taskPlanningService.insertTemplatesMultiSelect(editor);
    }

    async rollRepeat() {
        return this.taskPlanningService.rollRepeat();
    }

    async moveTaskToTomorrow(editor) {
        return this.taskPlanningService.moveTaskToTomorrow(editor);
    }

    recalcLineObj(lineObj) {
        if (!lineObj.actualStart || !lineObj.actualEnd) return false;
        const s = moment(lineObj.actualStart, ['HH:mm', 'HHmm']);
        const e = moment(lineObj.actualEnd, ['HH:mm', 'HHmm']);
        if (s.isValid() && e.isValid()) {
            let diffStr = Math.round(e.diff(s, 'minutes'));
            if (diffStr < 0) diffStr += 24 * 60; // handle wrap around midnight
            lineObj.actualMin = String(diffStr);
            return true;
        }
        return false;
    }

    recalculateDuration(editor) {
        const info = this.getCursorTaskLineInfo(editor);
        if (!info) return;

        if (this.recalcLineObj(info.lineObj)) {
            editor.setLine(info.lineNum, info.lineObj.toString());
            new Notice("所要時間を再計算しました");
        }
    }

    recalculateAllDuration(editor) {
        let updatedCount = 0;
        for (let i = 0; i < editor.lineCount(); i++) {
            const lineText = editor.getLine(i);
            const lineObj = TaskLine.parse(lineText);
            if (lineObj && this.recalcLineObj(lineObj)) {
                const newText = lineObj.toString();
                if (newText !== lineText) {
                    editor.setLine(i, newText);
                    updatedCount++;
                }
            }
        }
        new Notice(`${updatedCount}件の所要時間を再計算しました`);
    }

    insertMemoLine(editor) {
        const cursor = editor.getCursor();
        const currentLineText = editor.getLine(cursor.line);
        const match = currentLineText.match(/^(\s*)/);
        const indent = match ? match[1] : "";
        
        let newIndent = indent + "\t"; // Append a tab for the memo level
        
        const memoLine = `${newIndent}- `;
        editor.replaceRange(`\n${memoLine}`, { line: cursor.line, ch: currentLineText.length });
        editor.setCursor({ line: cursor.line + 1, ch: memoLine.length });
    }

    _findRunningTaskIndex(editor) {
        for (let i = 0; i < editor.lineCount(); i++) {
            const lineObj = TaskLine.parse(editor.getLine(i));
            if (this.isRunningLineObj(lineObj)) {
                return i;
            }
        }
        return -1;
    }

    _findLatestExecutedTaskIndex(editor) {
        for (let i = editor.lineCount() - 1; i >= 0; i--) {
            const lineObj = TaskLine.parse(editor.getLine(i));
            if (this.isTaskExecutionRecord(lineObj)) {
                return i;
            }
        }
        return -1;
    }

    _normalizeTaskTitle(title) {
        return this.historyService.normalizeTaskTitle(title);
    }

    _isInvalidSuggestTitle(title) {
        return this.historyService.isInvalidSuggestTitle(title);
    }

    _upsertHistoryIndexEntry(index, lineObj, usedAt) {
        return this.historyService.upsertHistoryIndexEntry(index, lineObj, usedAt);
    }

    async rebuildTaskHistoryIndex() {
        return this.historyService.rebuildTaskHistoryIndex();
    }

    async rebuildTaskSuggestIndexCommand() {
        return this.historyService.rebuildTaskSuggestIndexCommand();
    }

    _historyEntriesForSuggest() {
        return this.historyService.historyEntriesForSuggest();
    }

    _buildTaskLineFromHistoryEntry(entry, baseLineObj) {
        return this.historySuggestService.buildTaskLineFromHistoryEntry(entry, baseLineObj);
    }

    _insertTaskLineBelow(editor, anchorIdx, lineText) {
        return this.historySuggestService.insertTaskLineBelow(editor, anchorIdx, lineText);
    }

    async insertTaskFromHistorySuggest(editor) {
        return this.historySuggestController.insertTaskFromHistorySuggest(editor);
    }

    duplicateActiveTaskToBelowRunning(editor) {
        const cursor = editor.getCursor();
        const currentLineText = editor.getLine(cursor.line);
        if (!currentLineText.trim()) return;

        const runningIdx = this._findRunningTaskIndex(editor);
        if (runningIdx === -1) {
            new Notice("実行中のタスクが見つかりません");
            return;
        }

        const insertAt = runningIdx + 1;
        editor.replaceRange(`\n${currentLineText}`, { line: runningIdx, ch: editor.getLine(runningIdx).length });
        new Notice("直下に複製しました");
    }

    moveActiveTaskToBelowRunning(editor) {
        const cursor = editor.getCursor();
        const currentLineText = editor.getLine(cursor.line);
        if (!currentLineText.trim()) return;

        const runningIdx = this._findRunningTaskIndex(editor);
        if (runningIdx === -1) {
            new Notice("実行中のタスクが見つかりません");
            return;
        }

        if (cursor.line === runningIdx) {
            new Notice("すでに実行中のタスクです");
            return;
        }

        // Delete current line first
        editor.replaceRange("", { line: cursor.line, ch: 0 }, { line: cursor.line + 1, ch: 0 });

        // Calculate new running index since we might have deleted a line above it
        const newRunningIdx = cursor.line < runningIdx ? runningIdx - 1 : runningIdx;
        
        editor.replaceRange(`\n${currentLineText}`, { line: newRunningIdx, ch: editor.getLine(newRunningIdx).length });
        new Notice("直下に移動しました");
    }

    deleteCurrentLine(editor) {
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        // Include the newline if not the last line
        const endLine = cursor.line === editor.lineCount() - 1 ? cursor.line : cursor.line + 1;
        const endCh = cursor.line === editor.lineCount() - 1 ? lineText.length : 0;
        
        editor.replaceRange("", { line: cursor.line, ch: 0 }, { line: endLine, ch: endCh });
    }

    endAndStartTopTask(editor) {
        const nowStr = moment().format('HHmm');
        let runningIdx = -1;
        
        // Find and end the current running task
        for (let i = 0; i < editor.lineCount(); i++) {
            const lineObj = TaskLine.parse(editor.getLine(i));
            if (this.isRunningLineObj(lineObj)) {
                runningIdx = i;
                lineObj.actualEnd = nowStr;
                editor.setLine(i, lineObj.toString());
                break;
            }
        }

        if (runningIdx === -1) {
            new Notice("実行中のタスクが見つかりませんでした。未実行タスクの開始のみ行います。");
        }

        // Find the topmost unexecuted task and start it
        let startedIdx = -1;
        for (let i = 0; i < editor.lineCount(); i++) {
            const lineObj = TaskLine.parse(editor.getLine(i));
            // A valid task line, top level (no indent) ideally, but we can just check if it has no status
            // Assuming no indent is top task, or any task with no start time.
            if (lineObj && lineObj.indent === "" && this.isStartableLineObj(lineObj)) {
                lineObj.actualStart = nowStr;
                editor.setLine(i, lineObj.toString());
                startedIdx = i;
                
                // Move cursor to the newly started task
                editor.setCursor({ line: i, ch: editor.getLine(i).length });
                break;
            }
        }

        if (startedIdx !== -1) {
            new Notice("一番上の未実行タスクを開始しました");
        } else {
            new Notice("未実行のタスクが見つかりませんでした");
        }
    }

    async openTodaysNote() {
        return this.dailyNoteService.openTodaysNote();
    }

    async openTodaysDailyNote() {
        return this.dailyNoteService.openTodaysDailyNote();
    }

    async openRelativeDayNote(offsetDays) {
        return this.dailyNoteService.openRelativeDayNote(offsetDays);
    }

    async jumpToActiveTask(leaf: obsidian.WorkspaceLeaf) {
        return this.dailyNoteService.jumpToActiveTask(leaf);
    }
}



// ─── Dashboard Panel Extension ───

export default TaskLinerPlugin;
