import { TaskLine, normalizeTimeStr, setLineKeepScroll, adjustTaskLineTime } from './core/task-line';
import { DEFAULT_SETTINGS, TaskLinerSettings } from './settings';
import { TaskChuteLineSettingTab } from './settings-tab';
import { DailyNoteService } from './services/daily-note';
import { TechoService } from './services/techo';
import { HistoryService } from './services/history';
import { HistorySuggestService } from './services/history-suggest';
import { HistorySuggestController } from './services/history-suggest-controller';
import { registerTaskLinerCommands } from './commands/register-commands';
import { registerCheckboxClickHook } from './lifecycle/register-checkbox-hook';
import { registerTaskLinerUiRuntime } from './lifecycle/register-ui-runtime';

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
            TaskChuteCalendarView,
            TaskChuteScrollView,
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
        if (!filePath) return false;
        const folder = this.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
        return filePath.startsWith(folder + '/') && /\d{4}-\d{2}-\d{2}\.md$/.test(filePath);
    }

    computeDashboardData(text) {
        const lines = text.split(/\r?\n/);
        let totalTasks = 0;
        let completedTasks = 0;
        let runningTask = null;
        let remainingEstimateMin = 0;
        let noEstimateCount = 0;

        // Detect current block (## section)
        const blockInfo = this.getCurrentBlockInfo(lines);
        let blockRemainingMin = 0;
        let inCurrentBlock = false;
        let currentSectionHeader = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Track section headers
            const sectionMatch = line.match(/^##\s+(\d+)-(\d+)/);
            if (sectionMatch) {
                currentSectionHeader = line;
                inCurrentBlock = blockInfo && blockInfo.headerLine === i;
                continue;
            }

            const lineObj = TaskLine.parse(line);
            if (!lineObj) continue;
            if (lineObj.indent.length > 0) continue;

            totalTasks++;

            if (this.isCompletedLineObj(lineObj)) {
                completedTasks++;
            } else if (this.isRunningLineObj(lineObj)) {
                runningTask = {
                    title: lineObj.title,
                    estimate: lineObj.estimate,
                    actualStart: lineObj.actualStart
                };
                if (lineObj.estimate) {
                    const est = parseInt(lineObj.estimate, 10);
                    if (!isNaN(est) && lineObj.actualStart) {
                        const now = moment();
                        const startM = moment(lineObj.actualStart, 'HHmm');
                        if (startM.isValid()) {
                            const elapsed = now.diff(startM, 'minutes');
                            const remaining = Math.max(0, est - elapsed);
                            remainingEstimateMin += remaining;
                            if (inCurrentBlock) blockRemainingMin += remaining;
                        }
                    } else {
                        remainingEstimateMin += est;
                        if (inCurrentBlock) blockRemainingMin += est;
                    }
                } else {
                    noEstimateCount++;
                }
            } else {
                // Startable / idle task
                if (lineObj.estimate) {
                    const est = parseInt(lineObj.estimate, 10);
                    if (!isNaN(est)) {
                        remainingEstimateMin += est;
                        if (inCurrentBlock) blockRemainingMin += est;
                    }
                } else {
                    noEstimateCount++;
                }
            }
        }

        const now = moment();
        const estimatedEnd = remainingEstimateMin > 0
            ? now.clone().add(remainingEstimateMin, 'minutes').format('HH:mm')
            : now.format('HH:mm');
        
        const blockEstimatedEnd = blockRemainingMin > 0
            ? now.clone().add(blockRemainingMin, 'minutes').format('HH:mm')
            : now.format('HH:mm');

        return {
            totalTasks,
            completedTasks,
            runningTask,
            remainingEstimateMin,
            blockRemainingMin,
            blockName: blockInfo ? blockInfo.name : '',
            noEstimateCount,
            estimatedEnd,
            blockEstimatedEnd,
            currentTime: now.format('HH:mm')
        };
    }

    formatMinutes(min) {
        const h = Math.floor(min / 60);
        const m = min % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    getCurrentBlockInfo(lines) {
        const nowH = moment().hour();
        let lastHeader = null;
        let lastHeaderLine = -1;

        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/^##\s+(\d+)-(\d+)/);
            if (match) {
                const startH = parseInt(match[1], 10);
                const endH = parseInt(match[2], 10);
                if (nowH >= startH && nowH < endH) {
                    return { name: `${match[1]}-${match[2]}`, startH, endH, headerLine: i };
                }
                lastHeader = { name: `${match[1]}-${match[2]}`, startH, endH, headerLine: i };
                lastHeaderLine = i;
            }
        }
        return lastHeader;
    }

    async computeDailyNoteStats(dateStr) {
        const folder = this.settings.dailyNoteFolderPath || DEFAULT_SETTINGS.dailyNoteFolderPath;
        const filePath = `${folder}/${dateStr}.md`;
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file) return { h4Count: 0, charCount: 0, selfTwitterCount: 0 };

        try {
            const content = await this.app.vault.read(file);
            const lines = content.split(/\r?\n/);

            // H4 count
            const h4Count = lines.filter(l => /^####\s+/.test(l)).length;

            // Character count
            const charCount = content.length;

            // Self Twitter count
            const stHeader = this.settings.selfTwitterHeader || DEFAULT_SETTINGS.selfTwitterHeader;
            let selfTwitterCount = 0;
            let inSelfTwitter = false;
            for (const line of lines) {
                if (line.trim() === stHeader.trim()) {
                    inSelfTwitter = true;
                    continue;
                }
                if (inSelfTwitter) {
                    // Stop at next heading of same or higher level
                    if (/^#{1,4}\s+/.test(line) && line.trim() !== stHeader.trim()) {
                        inSelfTwitter = false;
                        continue;
                    }
                    // Count top-level list items only (no indent)
                    if (/^-\s+/.test(line)) {
                        selfTwitterCount++;
                    }
                }
            }

            return { h4Count, charCount, selfTwitterCount };
        } catch (e) {
            return { h4Count: 0, charCount: 0, selfTwitterCount: 0 };
        }
    }

    async fetchWeatherData() {
        // Cache for 15 minutes
        const now = Date.now();
        if (this._weatherCache && (now - this._weatherCacheTime) < 15 * 60 * 1000) {
            return this._weatherCache;
        }

        try {
            const url = 'https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&current=temperature_2m,weather_code,pressure_msl&timezone=Asia/Tokyo';
            const response = await fetch(url);
            const json = await response.json();
            const current = json.current || {};
            const result = {
                temp: current.temperature_2m,
                pressure: current.pressure_msl,
                weatherCode: current.weather_code,
                emoji: this.weatherCodeToEmoji(current.weather_code)
            };
            this._weatherCache = result;
            this._weatherCacheTime = now;
            return result;
        } catch (e) {
            return this._weatherCache || { temp: null, pressure: null, weatherCode: null, emoji: '—' };
        }
    }

    weatherCodeToEmoji(code) {
        if (code == null) return '—';
        if (code === 0) return '☀️';
        if (code <= 3) return '⛅';
        if (code <= 48) return '🌫';
        if (code <= 67) return '🌧';
        if (code <= 77) return '❄';
        if (code <= 82) return '🌧';
        return '⛈';
    }

    buildDayProgressBar(width) {
        const now = moment();
        const minutesElapsed = now.hour() * 60 + now.minute();
        const totalMinutes = 24 * 60;
        const filled = Math.round((minutesElapsed / totalMinutes) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    buildWeekIndicator() {
        // Monday=1, Sunday=7 (isoWeekday)
        const dayOfWeek = moment().isoWeekday(); // 1=Mon ... 7=Sun
        const dayNames = ['月', '火', '水', '木', '金', '土', '日'];
        let dots = '';
        for (let i = 1; i <= 7; i++) {
            dots += i <= dayOfWeek ? '●' : '○';
        }
        return { dots, dayName: dayNames[dayOfWeek - 1] };
    }

    formatRemainingTime(minutes) {
        if (minutes <= 0) return '0m';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h > 0 && m > 0) return `${h}h${m}m`;
        if (h > 0) return `${h}h`;
        return `${m}m`;
    }

    async updateStatusBar() {
        if (!this.statusBarEl) return;
        if (!this.settings.enableStatusBar) {
            this.statusBarEl.textContent = '';
            return;
        }

        // Read today's log file
        const folder = this.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
        const todayStr = moment().format('YYYY-MM-DD');
        const filePath = `${folder}/${todayStr}.md`;
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file) {
            this.statusBarEl.textContent = '';
            return;
        }

        try {
            const content = await this.app.vault.read(file);
            const data = this.computeDashboardData(content);

            const parts = [];
            if (data.runningTask) {
                const taskName = data.runningTask.title.length > 15
                    ? data.runningTask.title.substring(0, 15) + '…'
                    : data.runningTask.title;
                parts.push(`▶ ${taskName}`);
            }
            parts.push(`✅ ${data.completedTasks}/${data.totalTasks}`);
            parts.push(`🏁 ${data.estimatedEnd}`);
            this.statusBarEl.textContent = parts.join('  |  ');
        } catch (e) {
            this.statusBarEl.textContent = '';
        }
    }

    initTopBar() {
        if (this.topBarEl) return;

        this.topBarEl = document.createElement('div');
        this.topBarEl.className = 'tcl-topbar';

        // Build 4-line structure
        const line1 = document.createElement('div');
        line1.className = 'tcl-topbar-line1';
        const line2 = document.createElement('div');
        line2.className = 'tcl-topbar-line2';
        const line3 = document.createElement('div');
        line3.className = 'tcl-topbar-line3';
        const line4 = document.createElement('div');
        line4.className = 'tcl-topbar-line4';
        
        this.topBarEl.appendChild(line1);
        this.topBarEl.appendChild(line2);
        this.topBarEl.appendChild(line3);
        this.topBarEl.appendChild(line4);

        this.topBarLine1El = line1;
        this.topBarLine2El = line2;
        this.topBarLine3El = line3;
        this.topBarLine4El = line4;

        // Mobile toggle button (expand/collapse line2)
        if (this.app.isMobile) {
            this.topBarEl.classList.add('is-mobile');
            const toggle = document.createElement('div');
            toggle.className = 'tcl-topbar-toggle';
            toggle.innerHTML = '▲';
            this.topBarEl.appendChild(toggle);
            this.topBarToggleEl = toggle;
            this._topBarExpanded = true;
            this.topBarEl.classList.add('tcl-topbar-expanded');

            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this._topBarExpanded = !this._topBarExpanded;
                if (this._topBarExpanded) {
                    this.topBarEl.classList.add('tcl-topbar-expanded');
                    toggle.innerHTML = '▲';
                } else {
                    this.topBarEl.classList.remove('tcl-topbar-expanded');
                    toggle.innerHTML = '▼';
                }
            });
        }

        // Apply mobile offset if any
        if (this.app.isMobile && this.settings.mobileTopBarOffset) {
            this.topBarEl.style.paddingTop = `${this.settings.mobileTopBarOffset}px`;
        }

        // Reload button (↻) - Far Right
        this.topBarReloadEl = document.createElement('div');
        this.topBarReloadEl.className = 'tcl-topbar-reload';
        this.topBarReloadEl.innerHTML = '↻';
        this.topBarReloadEl.title = '情報を更新';
        this.topBarEl.appendChild(this.topBarReloadEl);
        this.topBarReloadEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this._weatherCache = null; 
            this.updateTopBar();
            this.topBarReloadEl.classList.add('is-spinning');
            setTimeout(() => this.topBarReloadEl.classList.remove('is-spinning'), 600);
        });
        this.topBarEl.addEventListener('click', () => {
            const folder = this.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
            const todayStr = moment().format('YYYY-MM-DD');
            const filePath = `${folder}/${todayStr}.md`;
            this.app.workspace.openLinkText(filePath, '', true);
        });

        // Insert after title bar if exists, or at top of app-container
        const appEl = document.querySelector('.app-container');
        if (appEl) {
            const titlebar = appEl.querySelector('.titlebar');
            if (titlebar) {
                // Insert after titlebar to avoid overlapping buttons
                titlebar.after(this.topBarEl);
            } else {
                appEl.insertBefore(this.topBarEl, appEl.firstChild);
            }
        } else {
            // Extreme fallback
            const workspaceEl = document.querySelector('.workspace');
            if (workspaceEl && workspaceEl.parentElement) {
                workspaceEl.parentElement.insertBefore(this.topBarEl, workspaceEl);
            }
        }

        // Line 1 click → open taskchute log
        line1.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openTodaysNote();
        });

        // Line 2 click → check if clicked on note-stats area, then open daily note
        line2.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = e.target;
            if (target instanceof HTMLElement && target.closest('.tcl-tb-note-stats')) {
                this.openTodaysDailyNote();
            } else {
                this.openTodaysNote();
            }
        });

        // Mobile Line 4 click (stats row)
        line4.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openTodaysDailyNote();
        });

        this.updateTopBar();

        // Auto-refresh every 30 seconds
        this.topBarIntervalId = window.setInterval(() => {
            this.updateTopBar();
        }, 30000);

        // Also update on leaf change
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.updateTopBar();
            })
        );
    }

    async updateTopBar() {
        if (!this.topBarEl) return;

        if (!this.settings.enableTopBar) {
            this.topBarEl.style.display = 'none';
            return;
        }
        this.topBarEl.style.display = '';

        // Apply mobile offset if any
        if (this.app.isMobile && this.settings.mobileTopBarOffset) {
            this.topBarEl.style.paddingTop = `${this.settings.mobileTopBarOffset}px`;
        } else {
            this.topBarEl.style.paddingTop = '';
        }

        const folder = this.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
        const todayStr = moment().format('YYYY-MM-DD');
        const filePath = `${folder}/${todayStr}.md`;
        const file = this.app.vault.getAbstractFileByPath(filePath);

        // Fetch weather (async, cached 15min)
        const weather = await this.fetchWeatherData();

        // Daily note stats
        const dailyStats = await this.computeDailyNoteStats(todayStr);

        // Progress bars
        const dayBar = this.buildDayProgressBar(20);
        const weekInfo = this.buildWeekIndicator();
        const nowTime = moment().format('HH:mm');

        if (!file) {
            // Line 1: time + no log + weather
            let weatherHtml = '';
            if (weather.temp != null) {
                const pressureClass = weather.pressure < 1013 ? 'tcl-tb-pressure-low' : '';
                weatherHtml = `<span class="tcl-tb-weather">${weather.emoji} ${weather.temp}°C</span><span class="tcl-tb-pressure ${pressureClass}">${Math.round(weather.pressure)}hPa</span>`;
            }
            let l1 = '';
            if (this.settings.showTopBarNav) {
                l1 += `<span class="tcl-tb-nav"><span class="tcl-tb-nav-btn" id="tcl-tb-prev">◀</span><span class="tcl-tb-nav-btn" id="tcl-tb-today">今日</span><span class="tcl-tb-nav-btn" id="tcl-tb-next">▶</span></span>`;
            }
            l1 += `<span class="tcl-tb-time">${nowTime}</span><span class="tcl-tb-idle">ログなし</span><span class="tcl-tb-spacer"></span>${weatherHtml}`;
            this.topBarLine1El.innerHTML = l1;
            
            if (this.settings.showTopBarNav) {
                this.topBarLine1El.querySelector('#tcl-tb-prev')?.addEventListener('click', (e) => { e.stopPropagation(); this.openRelativeDayNote(-1); });
                this.topBarLine1El.querySelector('#tcl-tb-today')?.addEventListener('click', (e) => { e.stopPropagation(); this.openTodaysNote(); });
                this.topBarLine1El.querySelector('#tcl-tb-next')?.addEventListener('click', (e) => { e.stopPropagation(); this.openRelativeDayNote(1); });
            }

            // Line 2: daily stats + progress bars
            this.topBarLine2El.innerHTML = `<span class="tcl-tb-note-stats">□${dailyStats.h4Count} ✎${dailyStats.charCount.toLocaleString()} 𝕏${dailyStats.selfTwitterCount}</span><span class="tcl-tb-spacer"></span><span class="tcl-tb-daybar">${dayBar}</span><span class="tcl-tb-daybar-label">${nowTime}/24h</span><span class="tcl-tb-weekdots">${weekInfo.dots}</span><span class="tcl-tb-weekday">${weekInfo.dayName}</span>`;
            return;
        }

        try {
            const content = await this.app.vault.read(file);
            const data = this.computeDashboardData(content);

            if (this.app.isMobile) {
                // === REDESIGNED 4-ROW MOBILE LAYOUT (Reference Match) ===
                
                // Row 1: 3-column Grid (End Estimations | Time & Task | Weather)
                let r1 = `<div class="tcl-mobile-grid-3">`;
                
                // Left Col: Day End & NoEst
                r1 += `<div class="tcl-mobile-col left">
                    <span class="tcl-tb-remaining">🏁 ${data.estimatedEnd}</span>
                    <span class="tcl-tb-noest">!${data.noEstimateCount} 残り</span>
                </div>`;
                
                // Center Col: Current Time & Task & Nav
                let taskHtml = `<span class="tcl-tb-idle">待機中</span>`;
                if (data.runningTask) {
                    taskHtml = `<span class="tcl-tb-running tcl-red-text">▶ ${data.runningTask.title.substring(0, 15)}</span>`;
                }
                r1 += `<div class="tcl-mobile-col center">`;
                if (this.settings.showTopBarNav) {
                    r1 += `
                    <div class="tcl-tb-nav" style="margin-right:0; justify-content:center; margin-bottom: 2px;">
                        <span class="tcl-tb-nav-btn" id="tcl-tb-prev-m">◀</span>
                        <span class="tcl-tb-nav-btn" id="tcl-tb-today-m">今日</span>
                        <span class="tcl-tb-nav-btn" id="tcl-tb-next-m">▶</span>
                    </div>`;
                }
                r1 += `
                    <span class="tcl-tb-time" style="font-size: 1.25em; line-height: 1;">${data.currentTime}</span>
                    ${taskHtml}
                </div>`;
                
                // Right Col: Pressure & Weather
                let weatherHtml = 'n/a';
                if (weather.temp != null) {
                    const pressureClass = weather.pressure < 1013 ? 'tcl-red-text' : '';
                    weatherHtml = `
                        <span class="tcl-tb-pressure ${pressureClass}" style="font-weight: 700;">${Math.round(weather.pressure)}hPa</span>
                        <span class="tcl-tb-weather">${weather.emoji} ${weather.temp}°C</span>
                    `;
                }
                r1 += `<div class="tcl-mobile-col right">${weatherHtml}</div>`;
                r1 += `</div>`;
                this.topBarLine1El.innerHTML = r1;

                // Row 2: Thick Progress Bar with Text Overlay
                const pct = Math.round((moment().hours() * 60 + moment().minutes()) / (24 * 60) * 100);
                this.topBarLine2El.innerHTML = `
                    <div class="tcl-tb-daybar-container">
                        <div class="tcl-tb-daybar-fill" style="width: ${pct}%"></div>
                        <div class="tcl-tb-daybar-text">${data.currentTime} / 24h (${pct}%)</div>
                    </div>
                `;

                // Row 3: Buttons (Open Yesterday | Add Task Icon | Custom 1 | Custom 2)
                this.topBarLine3El.innerHTML = `
                    <div class="tcl-mobile-btn-row">
                        <div class="tcl-mobile-btn" id="tcl-btn-yesterday" style="flex: 2;"><span>‹</span> 昨日を開く</div>
                        <div class="tcl-mobile-btn" id="tcl-btn-addtask" title="タスクを追記"></div>
                        <div class="tcl-mobile-btn" id="tcl-btn-custom1" title="カスタム1"></div>
                        <div class="tcl-mobile-btn" id="tcl-btn-custom2" title="カスタム2"></div>
                    </div>
                `;
                
                const btnPrevM = this.topBarLine1El.querySelector('#tcl-tb-prev-m');
                const btnTodayM = this.topBarLine1El.querySelector('#tcl-tb-today-m');
                const btnNextM = this.topBarLine1El.querySelector('#tcl-tb-next-m');
                
                btnPrevM?.addEventListener('click', (e) => { e.stopPropagation(); this.openRelativeDayNote(-1); });
                btnTodayM?.addEventListener('click', (e) => { e.stopPropagation(); this.openTodaysNote(); });
                btnNextM?.addEventListener('click', (e) => { e.stopPropagation(); this.openRelativeDayNote(1); });

                const btnYesterday = this.topBarLine3El.querySelector('#tcl-btn-yesterday');
                const btnAddTask = this.topBarLine3El.querySelector('#tcl-btn-addtask');
                const btnCustom1 = this.topBarLine3El.querySelector('#tcl-btn-custom1');
                const btnCustom2 = this.topBarLine3El.querySelector('#tcl-btn-custom2');

                if (btnYesterday) {
                    btnYesterday.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        new Notice("昨日を開きます...");
                        this.openRelativeDayNote(-1);
                    }, true);
                }
                
                if (btnAddTask) {
                    setIcon(btnAddTask, 'list-plus');
                    btnAddTask.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        new Notice("タスク追加...");
                        this.addTaskFromBar();
                    }, true);
                }

                if (btnCustom1 && this.settings.mobileCustomIcon1) {
                    setIcon(btnCustom1, this.settings.mobileCustomIcon1);
                    btnCustom1.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        if (this.settings.mobileCustomCommand1) {
                            new Notice("コマンド1実行...");
                            this.app.commands.executeCommandById(this.settings.mobileCustomCommand1);
                        } else {
                            new Notice("コマンドIDが設定されていません");
                        }
                    }, true);
                }

                if (btnCustom2 && this.settings.mobileCustomIcon2) {
                    setIcon(btnCustom2, this.settings.mobileCustomIcon2);
                    btnCustom2.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        if (this.settings.mobileCustomCommand2) {
                            new Notice("コマンド2実行...");
                            this.app.commands.executeCommandById(this.settings.mobileCustomCommand2);
                        } else {
                            new Notice("コマンドIDが設定されていません");
                        }
                    }, true);
                }

                // Row 4: 3-column Stats Row
                this.topBarLine4El.innerHTML = `
                    <div class="tcl-mobile-grid-3" style="padding: 4px 0;">
                        <div class="tcl-mobile-col"><span>🕒 ${dailyStats.h4Count}</span></div>
                        <div class="tcl-mobile-col" style="border-left: 1px solid var(--background-modifier-border); border-right: 1px solid var(--background-modifier-border);">
                            <span>✎ ${dailyStats.charCount.toLocaleString()}</span>
                        </div>
                        <div class="tcl-mobile-col"><span>⌛ ${this.formatMinutes(data.remainingEstimateMin)}</span></div>
                    </div>
                `;

            } else {
                // LINE 1: Task + Block + Day + NoEst + Weather
                let l1 = '';
                if (this.settings.showTopBarNav) {
                    l1 += `<span class="tcl-tb-nav"><span class="tcl-tb-nav-btn" id="tcl-tb-prev">◀</span><span class="tcl-tb-nav-btn" id="tcl-tb-today">今日</span><span class="tcl-tb-nav-btn" id="tcl-tb-next">▶</span></span>`;
                }
                l1 += `<span class="tcl-tb-time">${data.currentTime}</span>`;
                if (data.runningTask) {
                    const est = data.runningTask.estimate ? `（${data.runningTask.estimate}m）` : '';
                    l1 += `<span class="tcl-tb-running">▶ ${data.runningTask.title}${est}</span>`;
                } else {
                    l1 += `<span class="tcl-tb-idle">待機中</span>`;
                }
                if (data.blockName) {
                    l1 += `<span class="tcl-tb-sep">│</span><span class="tcl-tb-block">■${data.blockName} 🏁${data.blockEstimatedEnd}</span>`;
                }
                l1 += `<span class="tcl-tb-sep">│</span><span class="tcl-tb-remaining">■日終 ${data.estimatedEnd}</span>`;
                if (data.noEstimateCount > 0) {
                    l1 += `<span class="tcl-tb-noest">!${data.noEstimateCount}</span>`;
                }
                l1 += `<span class="tcl-tb-spacer"></span>`;
                if (weather.temp != null) {
                    const pressureClass = weather.pressure < 1013 ? 'tcl-tb-pressure-low' : '';
                    l1 += `<span class="tcl-tb-weather">${weather.emoji} ${weather.temp}°C</span><span class="tcl-tb-pressure ${pressureClass}">${Math.round(weather.pressure)}hPa</span>`;
                }
                this.topBarLine1El.innerHTML = l1;
                
                if (this.settings.showTopBarNav) {
                    this.topBarLine1El.querySelector('#tcl-tb-prev')?.addEventListener('click', (e) => { e.stopPropagation(); this.openRelativeDayNote(-1); });
                    this.topBarLine1El.querySelector('#tcl-tb-today')?.addEventListener('click', (e) => { e.stopPropagation(); this.openTodaysNote(); });
                    this.topBarLine1El.querySelector('#tcl-tb-next')?.addEventListener('click', (e) => { e.stopPropagation(); this.openRelativeDayNote(1); });
                }

                // LINE 2: Daily note stats + Double Progress bars
                // Calculate Task Progress for Top Bar
                let taskBarHtml = '';
                if (data.runningTask) {
                    const estMin = parseInt(data.runningTask.estimate, 10);
                    const startTime = moment(data.runningTask.actualStart, 'HHmm');
                    const elapsedMin = Math.round(moment().diff(startTime, 'minutes'));
                    
                    let statusClass = 'on-track';
                    let progressPct = 0;
                    let label = '';
                    
                    if (isNaN(estMin) || estMin <= 0) {
                        statusClass = 'no-estimate';
                        progressPct = 100;
                        label = '見積なし';
                    } else if (elapsedMin > estMin) {
                        statusClass = 'over-due';
                        progressPct = 100;
                        label = `超過: ${elapsedMin - estMin}分`;
                    } else {
                        statusClass = 'on-track';
                        progressPct = Math.round((elapsedMin / estMin) * 100);
                        label = `${elapsedMin}/${estMin}分 (${progressPct}%)`;
                    }
                    
                    taskBarHtml = `
                        <div class="tcl-tb-bar-row task-bar-row ${statusClass}">
                            <div class="tcl-tb-bar-fill" style="width: ${progressPct}%"></div>
                            <span class="tcl-tb-bar-label">${label}</span>
                        </div>`;
                } else {
                    taskBarHtml = `<div class="tcl-tb-bar-row task-bar-row idle"><span class="tcl-tb-bar-label">待機中</span></div>`;
                }

                const dayPct = Math.round((moment().hours() * 60 + moment().minutes()) / (24 * 60) * 100);
                const dayBarHtml = `
                    <div class="tcl-tb-bar-row day-bar-row">
                        <div class="tcl-tb-bar-fill" style="width: ${dayPct}%"></div>
                        <span class="tcl-tb-bar-label">${data.currentTime} / 24h (${dayPct}%)</span>
                    </div>`;

                this.topBarLine2El.innerHTML = `
                    <span class="tcl-tb-note-stats">□${dailyStats.h4Count} ✎${dailyStats.charCount.toLocaleString()} 𝕏${dailyStats.selfTwitterCount}</span>
                    <span class="tcl-tb-spacer"></span>
                    <div class="tcl-tb-double-bar">
                        ${taskBarHtml}
                        ${dayBarHtml}
                    </div>
                    <span class="tcl-tb-sep">│</span>
                    <span class="tcl-tb-weekdots">${weekInfo.dots}</span>
                    <span class="tcl-tb-weekday">${weekInfo.dayName}</span>`;
                
                // Clear lines 3 & 4
                this.topBarLine3El.innerHTML = '';
                this.topBarLine4El.innerHTML = '';
            }
        } catch (e) {
            console.error("[taskchute-line] updateTopBar error:", e);
            this.topBarLine1El.innerHTML = `<span class="tcl-tb-time">${nowTime}</span><span class="tcl-tb-idle">Error</span>`;
            this.topBarLine2El.innerHTML = '';
            this.topBarLine3El.innerHTML = '';
            this.topBarLine4El.innerHTML = '';
        }
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
function buildDashboardPanelExtension(plugin) {
    const dashboardField = StateField.define({
        create() {
            return null;
        },
        update(value, tr) {
            return value;
        },
        provide(field) {
            return showPanel.from(field, () => {
                // Check if dashboard is enabled and we're viewing a log file
                const activeFile = plugin.app.workspace.getActiveFile();
                if (!plugin.settings.enableDashboard) return null;
                // Allow showing only nav buttons if not in a log file
                const isLog = activeFile && plugin.isLogFilePath(activeFile.path);

                return (view) => {
                    const dom = document.createElement('div');
                    dom.className = 'tcl-dashboard';

                    const line0 = document.createElement('div');
                    line0.className = 'tcl-dashboard-nav';
                    const line1 = document.createElement('div');
                    line1.className = 'tcl-dashboard-line1';
                    const line2 = document.createElement('div');
                    line2.className = 'tcl-dashboard-line2';
                    dom.appendChild(line0);
                    dom.appendChild(line1);
                    dom.appendChild(line2);

                    // Add mobile toggle if on mobile
                    if (plugin.app.isMobile) {
                        const toggle = document.createElement('div');
                        toggle.className = 'tcl-dashboard-toggle';
                        toggle.innerHTML = '▼';
                        dom.appendChild(toggle);
                        let expanded = false;
                        toggle.addEventListener('click', (e) => {
                            e.stopPropagation();
                            expanded = !expanded;
                            if (expanded) {
                                dom.classList.add('tcl-dashboard-expanded');
                                toggle.innerHTML = '▲';
                            } else {
                                dom.classList.remove('tcl-dashboard-expanded');
                                toggle.innerHTML = '▼';
                            }
                        });
                    }

                    function refresh() {
                        const text = view.state.doc.toString();
                        const data = plugin.computeDashboardData(text);

                        // Line 0: Navigation
                        const currentFile = plugin.app.workspace.getActiveFile();
                        const isLog = currentFile && plugin.isLogFilePath(currentFile.path);
                        const fileDate = isLog ? moment(currentFile.basename, 'YYYY-MM-DD', true) : moment();
                        
                        line0.innerHTML = '';
                        const prevBtn = line0.createEl('button', { text: '◀', cls: 'tcl-nav-btn' });
                        const todayBtn = line0.createEl('button', { text: isLog ? fileDate.format('YYYY-MM-DD (ddd)') : '今日を開く', cls: 'tcl-nav-btn tcl-nav-today' });
                        const nextBtn = line0.createEl('button', { text: '▶', cls: 'tcl-nav-btn' });
                        
                        prevBtn.onclick = () => plugin.openRelativeDayNote(-1);
                        todayBtn.onclick = () => plugin.openTodaysNote();
                        nextBtn.onclick = () => plugin.openRelativeDayNote(1);

                        if (!isLog) {
                            line1.innerHTML = '<span class="tcl-d-idle">ログファイル以外を表示中</span>';
                            line2.innerHTML = '';
                            return;
                        }

                        // Line 1: Current task info
                        let l1 = '';
                        const timeSpan = `<span class="tcl-d-time">🕐 ${data.currentTime}</span>`;
                        if (data.runningTask) {
                            const est = data.runningTask.estimate ? `（${data.runningTask.estimate}m）` : '';
                            const startFmt = data.runningTask.actualStart
                                ? data.runningTask.actualStart.replace(/(\d{2})(\d{2})/, '$1:$2')
                                : '--:--';
                            l1 = `${timeSpan}<span class="tcl-d-sep">│</span><span class="tcl-d-running">▶ ${data.runningTask.title}${est}</span><span class="tcl-d-sep">│</span><span class="tcl-d-start">開始 ${startFmt}</span>`;
                        } else {
                            l1 = `${timeSpan}<span class="tcl-d-sep">│</span><span class="tcl-d-idle">待機中</span>`;
                        }
                        line1.innerHTML = l1;

                        // Line 2: Summary
                        const remainStr = plugin.formatRemainingTime(data.remainingEstimateMin);
                        const pct = data.totalTasks > 0 ? Math.round((data.completedTasks / data.totalTasks) * 100) : 0;
                        line2.innerHTML = `<span class="tcl-d-progress">✅ ${data.completedTasks}/${data.totalTasks}</span><span class="tcl-d-pct">${pct}%</span><span class="tcl-d-sep">│</span><span class="tcl-d-remaining">⏱ 残り ${remainStr}</span><span class="tcl-d-sep">│</span><span class="tcl-d-eta">🏁 推定終了 ${data.estimatedEnd}</span>`;
                    }

                    refresh();

                    // Auto-refresh every 30 seconds for time updates
                    const intervalId = window.setInterval(refresh, 30000);

                    return {
                        dom: dom,
                        top: true,
                        update(update) {
                            if (update.docChanged) {
                                refresh();
                            }
                        },
                        destroy() {
                            window.clearInterval(intervalId);
                        }
                    };
                };
            });
        }
    });

    return [dashboardField];
}

export default TaskLinerPlugin;
