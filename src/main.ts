import { TaskLine, normalizeTimeStr, setLineKeepScroll, adjustTaskLineTime } from './core/task-line';
import { DEFAULT_SETTINGS, TaskLinerSettings } from './settings';
import { TaskChuteLineSettingTab } from './settings-tab';
import { DailyNoteService } from './services/daily-note';
import { TechoService } from './services/techo';
import { HistoryService } from './services/history';
import { HistorySuggestService } from './services/history-suggest';
import { HistorySuggestController } from './services/history-suggest-controller';
import { DashboardUiService } from './services/dashboard-ui';
import { registerTaskLinerCommands } from './commands/register-commands';
import { registerCheckboxClickHook } from './lifecycle/register-checkbox-hook';
import { registerTaskLinerUiRuntime } from './lifecycle/register-ui-runtime';
import { buildDashboardPanelExtension } from './ui/dashboard-panel';

import * as obsidian from 'obsidian';
import { Plugin, moment, Modal, Setting, Notice, PluginSettingTab, TFolder, setIcon, TFile, View, App } from 'obsidian';
import { ViewPlugin, Decoration, showPanel, EditorView } from '@codemirror/view';
import { RangeSetBuilder, StateField, StateEffect } from '@codemirror/state';

class TaskTextModal extends Modal {
    constructor(app, onSubmit) {
        super(app);
        this.onSubmit = onSubmit;
        this.taskText = "";
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "タスクを追記" });

        const inputEl = contentEl.createEl("input", {
            type: "text",
            placeholder: "タスク名を入力...",
            value: this.taskText,
        });
        inputEl.style.width = "100%";
        inputEl.style.marginBottom = "15px";
        inputEl.style.fontSize = "1.1em";
        inputEl.style.padding = "8px";

        inputEl.focus();

        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = "flex";
        btnContainer.style.justifyContent = "flex-end";
        btnContainer.style.gap = "10px";

        const cancelBtn = btnContainer.createEl("button", { text: "キャンセル" });
        cancelBtn.addEventListener("click", () => this.close());

        const submitBtn = btnContainer.createEl("button", { 
            text: "追加",
            cls: "mod-cta"
        });
        
        const submitAction = () => {
            this.onSubmit(inputEl.value);
            this.close();
        };

        submitBtn.addEventListener("click", submitAction);
        inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                submitAction();
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class DatePickerModal extends Modal {
    constructor(app, initialDate, onChoose) {
        super(app);
        this.initialDate = initialDate || new Date();
        this.onChoose = onChoose;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "日付を選択" });

        const dateStr = moment(this.initialDate).format('YYYY-MM-DD');
        const inputEl = contentEl.createEl("input", {
            type: "date",
            value: dateStr,
        });
        inputEl.style.width = "100%";
        inputEl.style.marginBottom = "15px";
        inputEl.style.padding = "8px";
        inputEl.style.fontSize = "1.1em";

        inputEl.focus();

        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = "flex";
        btnContainer.style.justifyContent = "flex-end";
        btnContainer.style.gap = "10px";

        const cancelBtn = btnContainer.createEl("button", { text: "キャンセル" });
        cancelBtn.addEventListener("click", () => this.close());

        const submitBtn = btnContainer.createEl("button", {
            text: "OK",
            cls: "mod-cta"
        });

        const submitAction = () => {
            const selectedDate = new Date(inputEl.value);
            this.onChoose(selectedDate);
            this.close();
        };

        submitBtn.addEventListener("click", submitAction);
        inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") submitAction();
            if (e.key === "Escape") this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class TaskLinerPlugin extends Plugin {
    settings: TaskLinerSettings;
    dailyNoteService: DailyNoteService;
    techoService: TechoService;
    historyService: HistoryService;
    historySuggestService: HistorySuggestService;
    historySuggestController: HistorySuggestController;
    dashboardUiService: DashboardUiService;
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
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        const lineObj = TaskLine.parse(lineText);
        if (lineObj) {
            return { lineObj, lineNum: cursor.line };
        }
        return null;
    }

    isSkippedLineObj(lineObj) {
        return !!(lineObj && (lineObj.skippedAt || lineObj.isDeferred));
    }
    _handleCheckboxShortPress(editor, targetIdx) {
        const lineObj = TaskLine.parse(editor.getLine(targetIdx));
        if (!lineObj) return;
        if (this.isStartableLineObj(lineObj)) {
            this.startTask(editor, targetIdx);
        } else if (this.isRunningLineObj(lineObj)) {
            this.endTask(editor, targetIdx);
        }
        // [x] completed: short press does nothing
    }

    _handleCheckboxLongPress(editor, targetIdx) {
        const lineObj = TaskLine.parse(editor.getLine(targetIdx));
        if (!lineObj) return;
        if (this.isStartableLineObj(lineObj)) {
            // Long press on unstarted → start from previous end time
            this.startTaskFromPreviousEnd(editor, targetIdx);
        } else if (this.isRunningLineObj(lineObj) || this.isCompletedLineObj(lineObj)) {
            // Long press on running/done → reset to unstarted [ ]
            lineObj.actualStart = '';
            lineObj.actualEnd = '';
            lineObj.skippedAt = '';
            lineObj.isChecked = false;
            lineObj.actualMin = '';
            lineObj.bullet = lineObj.bullet.replace(/\[.*?\]/, '[ ]');
            setLineKeepScroll(editor, targetIdx, lineObj.toString());
        }
    }

    findLatestEndTime(editor) {
        let latestTime = null;
        let latestMoment = null;

        for (let i = 0; i < editor.lineCount(); i++) {
            const lineObj = TaskLine.parse(editor.getLine(i));
            if (lineObj && lineObj.actualEnd) {
                const m = moment(lineObj.actualEnd, 'HH:mm');
                if (m.isValid()) {
                    if (!latestMoment || m.isAfter(latestMoment)) {
                        latestMoment = m;
                        latestTime = lineObj.actualEnd;
                    }
                }
            }
        }
        return latestTime;
    }

    startTaskFromPreviousEnd(editor, targetIdx) {
        const idx = targetIdx !== undefined ? targetIdx : editor.getCursor().line;
        const lineText = editor.getLine(idx);
        const lineObj = TaskLine.parse(lineText);

        if (!lineObj || !this.isStartableLineObj(lineObj)) {
            new Notice("開始可能なタスク行ではありません");
            return;
        }

        const prevEnd = this.findLatestEndTime(editor);
        const startTime = prevEnd || moment().format('HH:mm');
        
        // End currently running task first if any
        this._endCurrentlyRunningTask(editor, startTime);

        lineObj.actualStart = startTime;
        editor.setLine(idx, lineObj.toString());
        new Notice(prevEnd ? `前回の終了時刻 (${prevEnd}) から開始しました` : `現在時刻 (${startTime}) から開始しました`);
    }

    _endCurrentlyRunningTask(editor, endTime) {
        for (let i = 0; i < editor.lineCount(); i++) {
            const rObj = TaskLine.parse(editor.getLine(i));
            if (rObj && this.isRunningLineObj(rObj)) {
                rObj.skippedAt = "";
                rObj.actualEnd = endTime;
                setLineKeepScroll(editor, i, rObj.toString());
                break;
            }
        }
    }

    startTask(editor, targetIdx) {
        const idx = targetIdx !== undefined ? targetIdx : editor.getCursor().line;
        const now = moment().format('HH:mm');
        const lineObj = TaskLine.parse(editor.getLine(idx));

        if (lineObj && this.isStartableLineObj(lineObj)) {
            this._endCurrentlyRunningTask(editor, now);
            lineObj.actualStart = now;
            setLineKeepScroll(editor, idx, lineObj.toString());
        }
    }

    endTask(editor, targetIdx) {
        const idx = targetIdx !== undefined ? targetIdx : editor.getCursor().line;
        const now = moment().format('HH:mm');
        const lineObj = TaskLine.parse(editor.getLine(idx));

        if (lineObj && this.isRunningLineObj(lineObj)) {
            lineObj.skippedAt = "";
            lineObj.actualEnd = now;
            setLineKeepScroll(editor, idx, lineObj.toString());
        }
    }

    isRunningLineObj(lineObj) {
        if (!lineObj) return false;
        return !!(lineObj.actualStart && !lineObj.actualEnd && !lineObj.isChecked && !lineObj.skippedAt);
    }

    isCompletedLineObj(lineObj) {
        if (!lineObj) return false;
        return !!(lineObj.isChecked || (lineObj.actualStart && lineObj.actualEnd));
    }

    isStartableLineObj(lineObj) {
        if (!lineObj) return false;
        return !this.isCompletedLineObj(lineObj) && !lineObj.actualStart;
    }

    isTaskExecutionRecord(lineObj) {
        if (!lineObj) return false;
        return !!(lineObj.actualStart || lineObj.actualEnd || lineObj.skippedAt || lineObj.isChecked);
    }

    debugSuggest(...args) {
        if (!this.settings?.debugSuggestLogs) return;
        console.warn("[taskchute-line:suggest]", ...args);
    }

    debugSuggestAlways(...args) {
        console.warn("[taskchute-line:suggest]", ...args);
    }

	endAndStartTask(editor) {
        const currentInfo = this.getCursorTaskLineInfo(editor);
        if (!currentInfo) return;
        if (!this.isRunningLineObj(currentInfo.lineObj)) {
            new Notice("実行中のタスクで実行してください");
            return;
        }

		const now = moment().format('HH:mm');
        currentInfo.lineObj.skippedAt = "";
		currentInfo.lineObj.actualEnd = now;
		editor.setLine(currentInfo.lineNum, currentInfo.lineObj.toString());

        let nextLineNum = currentInfo.lineNum + 1;
        while (nextLineNum < editor.lineCount()) {
            const nextText = editor.getLine(nextLineNum);
            const nextLineObj = TaskLine.parse(nextText);
            
            if (nextLineObj && nextLineObj.indent.length <= currentInfo.lineObj.indent.length) {
                if (this.isStartableLineObj(nextLineObj)) {
                    nextLineObj.actualStart = now;
                    editor.setLine(nextLineNum, nextLineObj.toString());
                    editor.setCursor({ line: nextLineNum, ch: editor.getLine(nextLineNum).length });
                    break;
                }
            }
            nextLineNum++;
        }
	}

    skipTask(editor) {
        const info = this.getCursorTaskLineInfo(editor);
        if (!info) return;

        if (info.lineObj.actualEnd) {
            new Notice("終了済みタスクはスキップできません");
            return;
        }

        //Toggle back to unstarted if already deferred
        if (info.lineObj.isDeferred) {
            info.lineObj.isDeferred = false;
            info.lineObj.bullet = info.lineObj.bullet.replace(/\[.*\]/, '[ ]');
            editor.setLine(info.lineNum, info.lineObj.toString());
            new Notice("先送りを解除しました");
            return;
        }

        info.lineObj.isDeferred = true;
        info.lineObj.actualStart = "";
        info.lineObj.actualEnd = "";
        info.lineObj.actualMin = "";
        info.lineObj.skippedAt = "";

        editor.setLine(info.lineNum, info.lineObj.toString());
        new Notice("先送り（保留）として記録しました");
    }

    async skipTaskWithDate(editor) {
        const info = this.getCursorTaskLineInfo(editor);
        if (!info) return;

        if (info.lineObj.actualEnd) {
            new Notice("終了済みタスクはスキップできません");
            return;
        }

        // Open date picker
        const today = new Date();
        const modal = new DatePickerModal(this.app, today, async (selectedDate) => {
            const dateStr = moment(selectedDate).format('YYYY-MM-DD');
            const taskName = info.lineObj.title;

            // Mark as deferred in current date
            info.lineObj.isDeferred = true;
            info.lineObj.actualStart = "";
            info.lineObj.actualEnd = "";
            info.lineObj.actualMin = "";
            info.lineObj.skippedAt = dateStr;

            editor.setLine(info.lineNum, info.lineObj.toString());

            // Add task to Daily Note on selected date
            const dailyNotePath = `09_taskchute/${dateStr}.md`;
            let dailyFile = this.app.vault.getAbstractFileByPath(dailyNotePath);

            try {
                let content = "";
                if (dailyFile && dailyFile instanceof TFile) {
                    content = await this.app.vault.read(dailyFile);
                    if (!content.endsWith("\n")) content += "\n";
                } else {
                    // Create new Daily Note file
                    const folder = this.app.vault.getAbstractFileByPath("09_taskchute");
                    if (!(folder instanceof TFolder)) {
                        new Notice("09_taskchute フォルダが見つかりません");
                        return;
                    }
                    dailyFile = await this.app.vault.create(dailyNotePath, "");
                    content = "";
                }

                // Add task to Daily Note
                content += `- [ ] ${taskName}\n`;
                await this.app.vault.modify(dailyFile, content);
                new Notice(`${dateStr} に先送りしました`);
            } catch (err) {
                console.error("Daily Note への追加に失敗:", err);
                new Notice("Daily Note への追加に失敗しました");
            }
        });
        modal.open();
    }

    toggleTaskStatus(editor) {
        const info = this.getCursorTaskLineInfo(editor);
        if (!info) return;

        const now = moment().format('HH:mm');
        const tl = info.lineObj;

        if (this.isRunningLineObj(tl)) {
            // [/] Running -> [x] Completed
            tl.actualEnd = now;
            tl.isDeferred = false;
            tl.isChecked = false;
            tl.skippedAt = "";
        } else if (this.isCompletedLineObj(tl)) {
            // [x] Completed -> [>] Deferred
            tl.actualStart = "";
            tl.actualEnd = "";
            tl.isChecked = false;
            tl.isDeferred = true;
            tl.skippedAt = "";
        } else if (tl.isDeferred) {
            // [>] Deferred -> [ ] Unstarted
            tl.actualStart = "";
            tl.actualEnd = "";
            tl.isChecked = false;
            tl.isDeferred = false;
            tl.skippedAt = "";
        } else {
            // [ ] Unstarted -> [/] Running
            tl.actualStart = now;
            tl.actualEnd = "";
            tl.isDeferred = false;
            tl.isChecked = false;
            tl.skippedAt = "";
        }

        editor.setLine(info.lineNum, tl.toString());
    }

    resumeTask(editor) {
        const info = this.getCursorTaskLineInfo(editor);
        if (!info || (!info.lineObj.actualStart || !info.lineObj.actualEnd)) {
            new Notice("完了済みのタスクが選択されていません");
            return;
        }

        // Remove the ended time while keeping the start time
        info.lineObj.actualEnd = "";

        editor.setLine(info.lineNum, info.lineObj.toString());
    }

    timePunch(editor) {
        const info = this.getCursorTaskLineInfo(editor);
        if (!info) {
			new Notice("タスクの行にカーソルを合わせてください");
			return;
		}

        const modal = new TimePunchModal(this.app, (timeStr) => {
			if (!info.lineObj.actualStart) {
				// if no start time yet, put as start time
				info.lineObj.actualStart = timeStr;
			} else if (!info.lineObj.actualEnd) {
				// if start exists but no end, complete it and put as end time
				info.lineObj.actualEnd = timeStr;
			} else {
				// if both exist, override the end time
				info.lineObj.actualEnd = timeStr;
			}
            editor.setLine(info.lineNum, info.lineObj.toString());
        });
        modal.open();
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
        const folderPath = this.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
        const yesterdayStr = moment().subtract(1, 'days').format('YYYY-MM-DD');
        const yesterdayFilePath = `${folderPath}/${yesterdayStr}.md`;

        const yesterdayFile = this.app.vault.getAbstractFileByPath(yesterdayFilePath);
        if (!yesterdayFile) {
            new Notice(`昨日のファイルが見つかりません (${yesterdayFilePath})`);
            return;
        }

        const content = await this.app.vault.read(yesterdayFile);
        const lines = content.split('\n');
        const uncompletedTasks = [];
        let isParentCarriedOver = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) continue;

            const parsed = TaskLine.parse(line);
            if (parsed) {
                const isChild = parsed.indent.length > 0;

                if (!isChild) {
                    // Update parent status
                    // Consider it uncompleted if NO actualEnd time
                    const hasStart = !!parsed.actualStart;
                    const hasEnd = !!parsed.actualEnd;
                    const isSkipped = !!parsed.skippedAt; // Only [SKIP] format
                    const isDeferred = parsed.isDeferred; // [>] format
                    const isCompleted = this.isCompletedLineObj(parsed);
                    isParentCarriedOver = (!isSkipped && !isCompleted) || isDeferred;
                    if (isParentCarriedOver) {
                        parsed.actualStart = "";
                        parsed.actualEnd = "";
                        parsed.isDeferred = false;
                        parsed.isChecked = false;
                        parsed.skippedAt = "";
                        uncompletedTasks.push(parsed.toString());
                    }
                } else {
                    // It's a child/memo line. Carry over ONLY if its parent was carried over.
                    if (isParentCarriedOver) {
                        uncompletedTasks.push(line);
                    }
                }
            } else if (isParentCarriedOver) {
                // If it's a non-blank line that didn't parse as a task (e.g. sub-bullet or text)
                // we carry it over if the current parent is being carried over
                uncompletedTasks.push(line);
            }
        }

        if (uncompletedTasks.length === 0) {
            new Notice("昨日の未完了タスクはありません");
            return;
        }

        const cursor = editor.getCursor();
        const importText = uncompletedTasks.join('\n') + '\n';
        
        editor.replaceRange(importText, { line: cursor.line + 1, ch: 0 });
        new Notice(`${uncompletedTasks.length}件の未完了タスクを持ち越しました`);
    }

    async getTemplateFiles() {
        console.log("getTemplateFiles() started");
        const folder = this.settings.templateFolderPath || DEFAULT_SETTINGS.templateFolderPath;
        console.log("Template folder path:", folder);
        const folderAbstract = this.app.vault.getAbstractFileByPath(folder);
        console.log("Folder found:", !!folderAbstract, "Is TFolder:", folderAbstract instanceof TFolder);
        if (!folderAbstract || !(folderAbstract instanceof TFolder)) {
            new Notice(`テンプレフォルダが見つかりません (${folder})`);
            console.log("Folder not found, returning empty array");
            return [];
        }

        const files = this.app.vault.getFiles().filter((f) => f.path.startsWith(folder + "/") && f.extension === "md");
        console.log("Found template files:", files.length);
        const result = [];

        for (const file of files) {
            let content = "";
            try {
                content = await this.app.vault.read(file);
            } catch (err) {
                console.error("Failed to read template:", file?.path, err);
                continue;
            }
            const sections = this.extractTemplateSectionsAllLevels(content);
            result.push({ file, sections });
        }
        console.log("getTemplateFiles() completed, result count:", result.length);
        return result;
    }

    extractTemplateSectionsAllLevels(content) {
        const lines = String(content || "").split(/\r?\n/);
        const sections = [];
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (/^#{2,6}\s+/.test(line)) {
                const start = i;
                i++;
                while (i < lines.length && !/^#{1,6}\s+/.test(lines[i])) i++;
                const end = i;
                const title = line.replace(/^#{2,6}\s+/, "").trim();
                const text = lines.slice(start, end).join("\n");
                sections.push({ title, text, headingLine: line.trim() });
                continue;
            }
            i++;
        }
        return sections;
    }

    async insertTemplatesMultiSelect(editor) {
        new Notice("ステップ1: テンプレートファイルを読み込み中...");
        const templates = await this.getTemplateFiles();
        new Notice(`ステップ2: ${templates.length}個のテンプレートを見つけました`);

        if (templates.length === 0) {
            new Notice("テンプレートフォルダが見つかりません。設定で『09_taskchute/templates』に変更してください。");
            return;
        }

        const candidates = [];
        for (const tpl of templates) {
            const fileName = tpl.file.path.split("/").pop() || tpl.file.path;
            for (const section of tpl.sections) {
                const heading = section.headingLine || `## ${section.title}`;
                candidates.push({
                    label: `${fileName} / ${heading}`,
                    text: section.text,
                });
            }
        }

        if (candidates.length === 0) {
            new Notice("セクションが見つかりません");
            return;
        }
        new Notice(`ステップ3: ${candidates.length}個の選択肢を表示します`);

        const selected = await new Promise((resolve) => {
            const modal = new TemplateSelectModal(this.app, candidates, resolve);
            modal.open();
        });

        if (!selected || selected.length === 0) {
            new Notice("キャンセルされました");
            return;
        }

        const blockText = selected.map((s) => s.text.trimEnd()).join("\n\n");

        // Append to the bottom of the editor
        const lastLineNum = editor.lineCount();
        const lastLineText = editor.getLine(lastLineNum - 1);
        const prefix = (lastLineNum === 1 && lastLineText.length === 0) ? "" : "\n\n";

        editor.replaceRange(prefix + blockText + "\n", { line: lastLineNum, ch: lastLineText.length });
        editor.setCursor({ line: lastLineNum + (prefix.split('\n').length - 1) + blockText.split("\n").length, ch: 0 });
    }

    async rollRepeat() {
        const rollFilePath = this.settings.rollFilePath || DEFAULT_SETTINGS.rollFilePath;
        const rollFile = this.app.vault.getAbstractFileByPath(rollFilePath);
        if (!rollFile || !(rollFile instanceof TFile)) {
            new Notice(`ロール設定ファイルが見つかりません: ${rollFilePath}`);
            return;
        }

        const content = await this.app.vault.read(rollFile);
        const lines = content.split(/\r?\n/);
        let rollListIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes("### ROLL LIST")) {
                rollListIdx = i;
                break;
            }
        }

        if (rollListIdx === -1) {
            new Notice("ROLL LISTセクションが見つかりません");
            return;
        }

        const candidates: string[] = [];
        for (let i = rollListIdx + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith("###")) break;
            if (line.startsWith("- ")) {
                candidates.push(line.substring(2).trim());
            }
        }

        if (candidates.length === 0) {
            new Notice("ロール項目が見つかりませんでした");
            return;
        }

        const picked = await new Promise<string[] | null>((resolve) => {
            new RollRepeatModal(this.app, candidates, resolve).open();
        });

        if (!picked || picked.length === 0) return;

        // Ensure today's note exists and open it
        await this.openTodaysNote();
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        const logContent = await this.app.vault.read(activeFile);
        const logLines = logContent.split(/\r?\n/);

        // Find the second section (2nd header beginning with ##)
        let sectionCount = 0;
        let targetLineIdx = -1;
        for (let i = 0; i < logLines.length; i++) {
            if (logLines[i].startsWith("## ")) {
                sectionCount++;
                if (sectionCount === 2) {
                    targetLineIdx = i + 1;
                    break;
                }
            }
        }

        if (targetLineIdx === -1) {
            new Notice("2つ目のセクションが見つかりませんでした");
            return;
        }

        const insertLines = picked.map(roll => `- [ ] ${roll}`);
        logLines.splice(targetLineIdx, 0, ...insertLines);

        await this.app.vault.modify(activeFile, logLines.join("\n"));
        new Notice(`${picked.length}件のロールを挿入しました`);
    }

    async moveTaskToTomorrow(editor) {
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        const parsed = TaskLine.parse(lineText);
        if (!parsed) {
            new Notice("タスク行ではありません");
            return;
        }

        // 1. Prepare the task for tomorrow (reset status to [ ])
        parsed.actualStart = "";
        parsed.actualEnd = "";
        parsed.isDeferred = false;
        parsed.isChecked = false;
        parsed.skippedAt = "";
        const tomorrowTaskText = parsed.toString();

        // 2. Determine tomorrow's note path
        const folder = this.settings.dailyNoteFolderPath || DEFAULT_SETTINGS.dailyNoteFolderPath;
        const tomorrowStr = moment().add(1, 'days').format('YYYY-MM-DD');
        const filePath = `${folder}/${tomorrowStr}.md`;
        let file = this.app.vault.getAbstractFileByPath(filePath);

        if (!file) {
            // Create if not exists with basic structure
            file = await this.app.vault.create(filePath, `---\ndate: ${tomorrowStr}\n---\n\n## 0-7\n\n## 7-9\n\n## 9-19\n\n## 19-24\n`);
        }

        if (!(file instanceof TFile)) return;

        // 3. Append to tomorrow's note (below 2nd section as per convention)
        let content = await this.app.vault.read(file);
        const lines = content.split(/\r?\n/);
        let headerCount = 0;
        let insertIdx = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('## ')) {
                headerCount++;
                if (headerCount === 2) {
                    insertIdx = i + 1;
                    break;
                }
            }
        }

        if (insertIdx !== -1) {
            lines.splice(insertIdx, 0, tomorrowTaskText);
        } else {
            lines.push(tomorrowTaskText);
        }

        await this.app.vault.modify(file, lines.join("\n"));

        // 4. Remove from current note
        editor.replaceRange("", { line: cursor.line, ch: 0 }, { line: cursor.line + 1, ch: 0 });
        new Notice(`タスクを翌日 (${tomorrowStr}) に移動しました`);
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

class TimePunchModal extends Modal {
	constructor(app, onSubmit) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "時刻の強制打刻 (HHmm)" });

		new Setting(contentEl)
			.setName("時刻")
			.setDesc("4桁の数字（例: 1230）を入力してください")
			.addText((text) =>
				text
					.setPlaceholder("1230")
					.onChange((value) => {
						this.timeStr = value;
					})
					.inputEl.addEventListener('keydown', (e) => {
						if (e.key === 'Enter') {
                            this.submit();
                        }
					})
			);

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("打刻")
					.setCta()
					.onClick(() => {
						this.submit();
					})
			);
	}

    submit() {
        if (this.timeStr && this.timeStr.length === 4) {
            this.onSubmit(this.timeStr);
            this.close();
        } else {
            new obsidian.Notice("4桁の時刻を入力してください（例: 1230）");
        }
    }

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class TemplateSelectModal extends Modal {
    candidates: any[];
    onSubmit: any;
    submitted: boolean;

    constructor(app, candidates, onSubmit) {
        super(app);
        this.candidates = candidates;
        this.onSubmit = onSubmit;
        this.submitted = false;
    }

    onOpen() {
        try {
            const { contentEl } = this;
            contentEl.empty();
            contentEl.createEl("h3", { text: "テンプレートを選択してください" });

            const selected = new Set<number>();
            const list = contentEl.createDiv({ cls: "tc-template-list" });
            list.style.maxHeight = "300px";
            list.style.overflowY = "auto";
            list.style.border = "1px solid var(--background-modifier-border)";
            list.style.padding = "10px";
            list.style.marginBottom = "10px";

            this.candidates.forEach((candidate, index) => {
                const row = list.createDiv({ cls: "tc-template-item" });
                row.style.display = "flex";
                row.style.alignItems = "center";
                row.style.gap = "8px";
                row.style.cursor = "pointer";
                row.style.padding = "4px 0";

                const checkbox = row.createEl("input", { type: "checkbox" });
                const label = row.createEl("label", { text: candidate.label });
                label.style.cursor = "pointer";

                row.addEventListener("click", (event) => {
                    if (event.target !== checkbox) {
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event("change"));
                    }
                });

                checkbox.addEventListener("change", () => {
                    if (checkbox.checked) {
                        selected.add(index);
                    } else {
                        selected.delete(index);
                    }
                });
            });

            const buttonRow = contentEl.createDiv({ cls: "tc-template-actions" });
            buttonRow.style.display = "flex";
            buttonRow.style.justifyContent = "flex-end";
            buttonRow.style.gap = "8px";

            const insertButton = buttonRow.createEl("button", { text: "決定" });
            insertButton.className = "mod-cta";
            const cancelButton = buttonRow.createEl("button", { text: "キャンセル" });

            insertButton.addEventListener("click", () => {
                this.submitted = true;
                const picked = Array.from(selected)
                    .sort((a, b) => a - b)
                    .map((idx) => this.candidates[idx]);
                this.onSubmit(picked);
                this.close();
            });
            cancelButton.addEventListener("click", () => this.close());
        } catch (err) {
            console.error("TemplateSelectModal.onOpen() error:", err);
            new Notice("テンプレート選択モーダルエラー: " + (err instanceof Error ? err.message : String(err)));
        }
    }

    onClose() {
        if (!this.submitted) {
            this.onSubmit(null);
        }
        const { contentEl } = this;
        contentEl.empty();
    }
}

class RollRepeatModal extends Modal {
    candidates: string[];
    onSubmit: (selected: string[] | null) => void;
    submitted: boolean = false;

    constructor(app: App, candidates: string[], onSubmit: (selected: string[] | null) => void) {
        super(app);
        this.candidates = candidates;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "今日のtaskchuteに追加するロールを選択してください" });

        const selected = new Set<number>();
        const list = contentEl.createDiv({ cls: "tc-roll-list" });
        list.style.maxHeight = "300px";
        list.style.overflowY = "auto";
        list.style.border = "1px solid var(--background-modifier-border)";
        list.style.padding = "10px";
        list.style.marginBottom = "10px";

        this.candidates.forEach((candidate, index) => {
            const row = list.createDiv({ cls: "tc-roll-item" });
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.gap = "8px";
            row.style.cursor = "pointer";
            row.style.padding = "4px 0";

            const checkbox = row.createEl("input", { type: "checkbox" });
            const label = row.createEl("label", { text: candidate });
            label.style.cursor = "pointer";

            row.addEventListener("click", (event) => {
                if (event.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event("change"));
                }
            });

            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    selected.add(index);
                } else {
                    selected.delete(index);
                }
            });
        });

        const buttonRow = contentEl.createDiv({ cls: "tc-roll-actions" });
        buttonRow.style.display = "flex";
        buttonRow.style.justifyContent = "flex-end";
        buttonRow.style.gap = "8px";

        const insertButton = buttonRow.createEl("button", { text: "決定" });
        insertButton.className = "mod-cta";
        const cancelButton = buttonRow.createEl("button", { text: "キャンセル" });

        insertButton.addEventListener("click", () => {
            this.submitted = true;
            const picked = Array.from(selected)
                .sort((a, b) => a - b)
                .map((idx) => this.candidates[idx]);
            this.onSubmit(picked);
            this.close();
        });
        cancelButton.addEventListener("click", () => this.close());
    }

    onClose() {
        if (!this.submitted) {
            this.onSubmit(null);
        }
        const { contentEl } = this;
        contentEl.empty();
    }
}




const taskChuteStylePlugin = ViewPlugin.fromClass(class {
    constructor(view) {
        this.decorations = this.buildDecorations(view);
    }

    update(update) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view) {
        const builder = new RangeSetBuilder();
        const doc = view.state.doc;
        
        let lastParentDone = false;
        
        for (let { from, to } of view.visibleRanges) {
            let pos = from;
            while (pos <= to) {
                const line = doc.lineAt(pos);
                const lineObj = TaskLine.parse(line.text);
                
                if (lineObj) {
                    // It's a task line (has bullet)
                    const isChild = lineObj.indent.length > 0;
                    
                    if (!isChild) {
                        // It's a parent task
                        lastParentDone = !!(lineObj.isChecked || lineObj.skippedAt || (lineObj.actualStart && lineObj.actualEnd));
                        
                        const isRunning = !!(lineObj.actualStart && !lineObj.actualEnd && !lineObj.isChecked && !lineObj.skippedAt);
                        if (isRunning) {
                            builder.add(line.from, line.from, Decoration.line({
                                class: 'taskchute-line-running'
                            }));
                        } else if (lastParentDone) {
                            builder.add(line.from, line.from, Decoration.line({
                                class: 'taskchute-line-done'
                            }));
                        }
                    } else {
                        // It's a child task / memo line
                        if (lastParentDone) {
                            builder.add(line.from, line.from, Decoration.line({
                                class: 'taskchute-line-done'
                            }));
                        }
                    }
                } else {
                    // Not a task line (e.g. empty line, header)
                    // We might want to reset parent tracking if it's a header or large break
                    if (line.text.startsWith('#')) {
                        lastParentDone = false;
                    }
                }
                pos = line.to + 1;
            }
        }
        return builder.finish();
    }
}, {
    decorations: v => v.decorations
});

const taskChuteStyleExtension = [taskChuteStylePlugin];

// ─── Dashboard Panel Extension ───

export default TaskLinerPlugin;
