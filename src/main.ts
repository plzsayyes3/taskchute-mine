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
import { EditorOperationsService } from './services/editor-operations';
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
    editorOperationsService: EditorOperationsService;
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
        this.editorOperationsService = new EditorOperationsService(
            (editor) => this.getCursorTaskLineInfo(editor),
            (lineObj) => this.isRunningLineObj(lineObj),
            (lineObj) => this.isStartableLineObj(lineObj),
            (lineObj) => this.isTaskExecutionRecord(lineObj),
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
        return this.editorOperationsService.recalcLineObj(lineObj);
    }

    recalculateDuration(editor) {
        return this.editorOperationsService.recalculateDuration(editor);
    }

    recalculateAllDuration(editor) {
        return this.editorOperationsService.recalculateAllDuration(editor);
    }

    insertMemoLine(editor) {
        return this.editorOperationsService.insertMemoLine(editor);
    }

    _findRunningTaskIndex(editor) {
        return this.editorOperationsService._findRunningTaskIndex(editor);
    }

    _findLatestExecutedTaskIndex(editor) {
        return this.editorOperationsService._findLatestExecutedTaskIndex(editor);
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
        return this.editorOperationsService.duplicateActiveTaskToBelowRunning(editor);
    }

    moveActiveTaskToBelowRunning(editor) {
        return this.editorOperationsService.moveActiveTaskToBelowRunning(editor);
    }

    deleteCurrentLine(editor) {
        return this.editorOperationsService.deleteCurrentLine(editor);
    }

    endAndStartTopTask(editor) {
        return this.editorOperationsService.endAndStartTopTask(editor);
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
