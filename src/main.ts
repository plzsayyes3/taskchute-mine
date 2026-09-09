import { TaskLine, normalizeTimeStr, setLineKeepScroll, adjustTaskLineTime } from './core/task-line';
import { DEFAULT_SETTINGS, TaskLinerSettings } from './settings';

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
        this.addSettingTab(new TaskChuteLineSettingTab(this.app, this));

        try {
            this.registerEditorExtension(taskChuteStyleExtension);
        } catch (e) {
            console.error("TaskChuteLine CSS Extension failed to load", e);
        }

        // --- Checkbox Click Hook (LLR-style pointer-based long/short press) ---
        let _checkboxLongPressTimer = null;
        let _checkboxPointerDownAtMs = null;
        let _suppressNextCheckboxClick = false;
        const _checkboxLongPressMsTouch = 450;
        const _checkboxLongPressMsDesktop = 900;

        const _getCheckboxEl = (ev) => {
            const target = ev.target;
            if (!target) return null;
            const isCheckbox = target.type === 'checkbox' ||
                target.classList?.contains('task-list-item-checkbox');
            if (!isCheckbox) return null;
            if (!target.closest('.markdown-source-view')) return null;
            return target;
        };

        const _getEditorAndLine = (checkboxEl) => {
            if (!checkboxEl) return null;
            const activeEditor = this.app.workspace.activeEditor;
            if (!activeEditor?.editor) return null;
            const editor = activeEditor.editor;
            const view = editor.cm;
            if (!view) return null;
            const pos = view.posAtDOM(checkboxEl);
            if (pos === null) return null;
            const line = view.state.doc.lineAt(pos);
            return { editor, lineIndex: line.number - 1 };
        };

        this.registerDomEvent(document, 'pointerdown', (ev) => {
            if (!this.settings.enableCheckboxClickHook) return;
            const checkboxEl = _getCheckboxEl(ev);
            if (!checkboxEl) return;
            _checkboxPointerDownAtMs = Date.now();
            const threshold = ev.pointerType === 'touch' ? _checkboxLongPressMsTouch : _checkboxLongPressMsDesktop;
            if (_checkboxLongPressTimer) clearTimeout(_checkboxLongPressTimer);
            _checkboxLongPressTimer = setTimeout(() => {
                _checkboxLongPressTimer = null;
                _suppressNextCheckboxClick = true;
                const info = _getEditorAndLine(checkboxEl);
                if (!info) return;
                this._handleCheckboxLongPress(info.editor, info.lineIndex);
            }, threshold);
        });

        this.registerDomEvent(document, 'pointerup', () => {
            if (_checkboxLongPressTimer) {
                clearTimeout(_checkboxLongPressTimer);
                _checkboxLongPressTimer = null;
            }
            _checkboxPointerDownAtMs = null;
        });

        this.registerDomEvent(document, 'pointercancel', () => {
            if (_checkboxLongPressTimer) {
                clearTimeout(_checkboxLongPressTimer);
                _checkboxLongPressTimer = null;
            }
            _suppressNextCheckboxClick = false;
            _checkboxPointerDownAtMs = null;
        });

        this.registerDomEvent(document, 'click', (ev) => {
            if (!this.settings.enableCheckboxClickHook) return;
            if (_suppressNextCheckboxClick) {
                _suppressNextCheckboxClick = false;
                ev.preventDefault();
                ev.stopPropagation();
                return;
            }
            const checkboxEl = _getCheckboxEl(ev);
            if (!checkboxEl) return;
            ev.preventDefault();
            ev.stopPropagation();
            const info = _getEditorAndLine(checkboxEl);
            if (!info) return;
            this._handleCheckboxShortPress(info.editor, info.lineIndex);
        }, true); // capture phase

        this.addCommand({
            id: 'x-start-from-previous-end',
            name: '[x] 前回の終了時刻から開始',
            icon: 'fast-forward',
            editorCallback: (editor, view) => {
                this.startTaskFromPreviousEnd(editor);
            }
        });

		this.addCommand({
			id: 'start-task',
			name: 'タスクの開始',
			icon: 'play',
			editorCallback: (editor, view) => {
				this.startTask(editor);
			}
		});

		this.addCommand({
			id: 'end-task',
			name: 'タスクの終了',
			icon: 'square',
			editorCallback: (editor, view) => {
				this.endTask(editor);
			}
		});

		this.addCommand({
			id: 'end-and-start-task',
			name: 'タスクの終了・開始',
			icon: 'check-circle-2',
			editorCallback: (editor, view) => {
				this.endAndStartTask(editor);
			}
		});


		this.addCommand({
			id: 'skip-task',
			name: 'タスクをスキップ (Skip Task)',
			icon: 'skip-forward',
			editorCallback: (editor, view) => {
				this.skipTask(editor);
			}
		});

		this.addCommand({
			id: 'skip-task-with-date',
			name: 'タスクを先送り（日付指定）(Skip Task with Date)',
			icon: 'calendar-plus',
			editorCallback: (editor, view) => {
				this.skipTaskWithDate(editor);
			}
		});

		this.addCommand({
			id: 'open-todays-note',
			name: '今日のノートを開く',
			icon: 'calendar',
			callback: async () => {
				await this.openTodaysNote();
			}
		});

		this.addCommand({
			id: 'open-prev-day-note',
			name: '前日のノートを開く',
			icon: 'chevron-left',
			callback: async () => {
				await this.openRelativeDayNote(-1);
			}
		});

		this.addCommand({
			id: 'open-next-day-note',
			name: '翌日のノートを開く',
			icon: 'chevron-right',
			callback: async () => {
				await this.openRelativeDayNote(1);
			}
		});

		this.addCommand({
			id: 'resume-task',
			name: 'タスクの再開 (Resume)',
			icon: 'refresh-ccw',
			editorCallback: (editor, view) => {
				this.resumeTask(editor);
			}
		});

		this.addCommand({
			id: 'time-punch-hhmm',
			name: '時刻の強制打刻 (Time Punch HHmm)',
			icon: 'edit-3',
			editorCallback: (editor, view) => {
				this.timePunch(editor);
			}
		});

		this.addCommand({
			id: 'import-techo-today',
			name: '手帳からインポート (Import Techo Today)',
			icon: 'download',
			editorCallback: async (editor, view) => {
				await this.importTechoToday(editor);
			}
		});

		this.addCommand({
			id: 'insert-templates-multi',
			name: 'テンプレート挿入 (Insert Templates Multi)',
			icon: 'file-plus',
			editorCallback: async (editor, view) => {
				console.log("Command executed: insert-templates-multi");
				new Notice("テンプレート挿入コマンド実行中...");
				await this.insertTemplatesMultiSelect(editor);
			}
		});

		this.addCommand({
			id: 'import-yesterday-carryover',
			name: '昨日の未完了タスクの持ち越し (Import Yesterday Carryover)',
			icon: 'arrow-down-to-line',
			editorCallback: async (editor, view) => {
				await this.importYesterdayCarryover(editor);
			}
		});

		this.addCommand({
			id: 'recalculate-duration',
			name: 'タスクの所要時間（XXm）の再計算 (Recalculate Duration)',
			icon: 'calculator',
			editorCallback: (editor, view) => {
				this.recalculateDuration(editor);
			}
		});

		this.addCommand({
			id: 'recalculate-all-duration',
			name: '[x] 全タスクの所要時間の再計算 (Recalculate All Duration)',
			icon: 'list-restart',
			editorCallback: (editor, view) => {
				this.recalculateAllDuration(editor);
			}
		});

		this.addCommand({
			id: 'insert-memo',
			name: 'メモ行の追加 (Insert Memo Line)',
			icon: 'sticky-note',
			editorCallback: (editor, view) => {
				this.insertMemoLine(editor);
			}
		});

		this.addCommand({
			id: 'duplicate-active-to-below-running',
			name: '現在タスクを実行中タスクの直下に複製 (Duplicate to Below Running)',
			icon: 'copy-plus',
			editorCallback: (editor, view) => {
				this.duplicateActiveTaskToBelowRunning(editor);
			}
		});

		this.addCommand({
			id: 'move-active-to-below-running',
			name: '現在タスクを実行中タスクの直下に移動 (Move to Below Running)',
			icon: 'move-horizontal',
			editorCallback: (editor, view) => {
				this.moveActiveTaskToBelowRunning(editor);
			}
		});

		this.addCommand({
			id: 'move-task-to-tomorrow',
			name: '現在タスクを翌日のノートに移動 (Move Task to Tomorrow)',
			icon: 'calendar-forward',
			editorCallback: (editor, view) => {
				this.moveTaskToTomorrow(editor);
			}
		});

		this.addCommand({
			id: 'delete-current-line',
			name: '現在の行を削除 (Delete Current Line)',
			icon: 'trash-2',
			editorCallback: (editor, view) => {
				this.deleteCurrentLine(editor);
			}
		});

		this.addCommand({
			id: 'adjust-time-minus-1m',
			name: '時刻を -1分調整 (Adjust Time -1m)',
			icon: 'alarm-clock-minus',
			editorCallback: (editor) => {
				const idx = editor.getCursor().line;
				const result = adjustTaskLineTime(editor.getLine(idx), -1);
				if (result !== null) editor.setLine(idx, result);
			}
		});

		this.addCommand({
			id: 'adjust-time-plus-1m',
			name: '時刻を +1分調整 (Adjust Time +1m)',
			icon: 'alarm-clock-plus',
			editorCallback: (editor) => {
				const idx = editor.getCursor().line;
				const result = adjustTaskLineTime(editor.getLine(idx), +1);
				if (result !== null) editor.setLine(idx, result);
			}
		});

		this.addCommand({
			id: 'end-and-start-top-task',
			name: '現在のタスクを終了し、一番上の未実行行を開始 (End and Start Top Task)',
			icon: 'target',
			editorCallback: (editor, view) => {
				this.endAndStartTopTask(editor);
			}
		});

		this.addCommand({
			id: 'insert-task-from-history-suggest',
			name: '過去タスクをサジェストして挿入 (Suggest Past Tasks)',
			icon: 'search',
			editorCallback: async (editor, view) => {
				await this.insertTaskFromHistorySuggest(editor);
			}
		});

		this.addCommand({
			id: 'task-toggle',
			name: 'タスクステータスのトグル (Toggle Task Status)',
			icon: 'refresh-cw',
			editorCallback: (editor, view) => {
				this.toggleTaskStatus(editor);
			}
		});

		this.addCommand({
			id: 'rebuild-task-suggest-index',
			name: 'サジェスト用インデックスを再構築 (Rebuild Suggest Index)',
			icon: 'database',
			callback: async () => {
				await this.rebuildTaskSuggestIndexCommand();
			}
		});

		this.addCommand({
			id: 'roll-repeat',
			name: 'ロールリピート (Roll Repeat)',
			icon: 'repeat',
			callback: async () => {
				await this.rollRepeat();
			}
		});

		// Calendar View
		this.registerView(
			'taskliner-calendar-view',
			(leaf) => new TaskChuteCalendarView(leaf, this)
		);

		this.addCommand({
			id: 'open-calendar-view',
			name: 'カレンダービューを開く (Open Calendar View)',
			icon: 'calendar-clock',
			callback: async () => {
				const existing = this.app.workspace.getLeavesOfType('taskliner-calendar-view');
				if (existing.length > 0) {
					this.app.workspace.revealLeaf(existing[0]);
					return;
				}
				const leaf = this.app.workspace.getLeaf(true);
				await leaf.setViewState({ type: 'taskliner-calendar-view', active: true });
				this.app.workspace.revealLeaf(leaf);
			}
		});

		// Scroll Editor View
		this.registerView(
			'taskliner-scroll-view',
			(leaf) => new TaskChuteScrollView(leaf, this)
		);

		this.addCommand({
			id: 'open-scroll-view',
			name: 'スクロールエディタを開く (Open Scroll Editor)',
			icon: 'scroll-text',
			callback: async () => {
				const existing = this.app.workspace.getLeavesOfType('taskliner-scroll-view');
				if (existing.length > 0) {
					this.app.workspace.revealLeaf(existing[0]);
					return;
				}
				const leaf = this.app.workspace.getLeaf(true);
				await leaf.setViewState({ type: 'taskliner-scroll-view', active: true });
				this.app.workspace.revealLeaf(leaf);
			}
		});

		// モバイルの場合、起動時にスクロールエディタを自動で開く
		this.app.workspace.onLayoutReady(async () => {
			if (this.app.isMobile && this.settings.mobileAutoOpenScroll) {
				const existing = this.app.workspace.getLeavesOfType('taskliner-scroll-view');
				if (existing.length === 0) {
					const leaf = this.app.workspace.getLeaf(true);
					await leaf.setViewState({ type: 'taskliner-scroll-view', active: true });
					this.app.workspace.revealLeaf(leaf);
				}
			}
		});

		// Dashboard: Editor top panel
		try {
			this.dashboardPanelExtension = buildDashboardPanelExtension(this);
			this.registerEditorExtension(this.dashboardPanelExtension);
		} catch (e) {
			console.error("TaskChuteLine Dashboard Panel failed to load", e);
		}

		// Dashboard: Status bar (bottom)
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass('tcl-statusbar');
		this.registerInterval(
			window.setInterval(() => {
				this.updateStatusBar();
			}, 30000)
		);

		// Update status bar on file changes and leaf switches
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateStatusBar();
			})
		);
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file.path && file.path.startsWith(this.settings.logFolderPath + '/')) {
					this.updateStatusBar();
					this.updateTopBar();
				}
			})
		);
		this.updateStatusBar();

		// Top status bar (above workspace)
		this.app.workspace.onLayoutReady(() => {
			this.initTopBar();
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
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            const dateMatch = activeFile.basename.match(/^\d{4}-\d{2}-\d{2}$/);
            if (dateMatch) {
                return activeFile.basename;
            }
        }
        return moment().format('YYYY-MM-DD');
    }

    normalizeTechoHeader(header) {
        const trimmed = String(header || "").trim();
        if (!trimmed) return "## techoからインポート";
        if (/^#{1,6}\s+/.test(trimmed)) return trimmed;
        return `## ${trimmed}`;
    }

    extractTechoItemsForDate(content, dateStr) {
        if (!content || !dateStr) return [];
        const parts = dateStr.split('-');
        if (parts.length !== 3) return [];
        const monthNum = parseInt(parts[1], 10);
        const dayNum = parseInt(parts[2], 10);
        // Supports both "03月17日" and "3月17日"
        const headerRe = new RegExp(`^##\\s*0?${monthNum}月0?${dayNum}日(?:\\([^)]*\\))?\\s*$`);
        const lines = String(content).split(/\r?\n/);
        let start = -1;
        for (let i = 0; i < lines.length; i++) {
            if (headerRe.test(lines[i].trim())) {
                start = i;
                break;
            }
        }
        if (start === -1) return [];

        let end = lines.length;
        for (let i = start + 1; i < lines.length; i++) {
            if (/^##\s+/.test(lines[i].trim())) {
                end = i;
                break;
            }
        }

        const items = [];
        for (let i = start + 1; i < end; i++) {
            const trimmed = String(lines[i] || "").trim();
            if (!trimmed) continue;
            if (/^#{1,6}\s+/.test(trimmed)) continue;
            items.push(trimmed);
        }
        return items;
    }

    applyTechoImportToLog(content, header, items, mode) {
        const lines = String(content || "").split(/\r?\n/);
        let headerIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === header) {
                headerIndex = i;
                break;
            }
        }

        if (headerIndex === -1) {
            // Header not found, append to end
            const nextLines = [...lines];
            if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== "") {
                nextLines.push("");
            }
            nextLines.push(header, ...items);
            return { content: nextLines.join("\n"), addedCount: items.length };
        }

        let blockEnd = lines.length;
        for (let i = headerIndex + 1; i < lines.length; i++) {
            if (/^#{1,6}\s+/.test(lines[i].trim())) {
                blockEnd = i;
                break;
            }
        }

        if (mode === 'replace') {
            const replaced = [...lines.slice(0, headerIndex + 1), ...items, ...lines.slice(blockEnd)];
            return { content: replaced.join("\n"), addedCount: items.length };
        } else {
            // Append mode: only add items that don't already exist in this block
            const existing = new Set();
            for (let i = headerIndex + 1; i < blockEnd; i++) {
                existing.add(lines[i].trim());
            }
            const toAppend = items.filter(item => !existing.has(item.trim()));
            const appended = [...lines.slice(0, blockEnd), ...toAppend, ...lines.slice(blockEnd)];
            return { content: appended.join("\n"), addedCount: toAppend.length };
        }
    }

    async importTechoToday(editor) {
        const targetDate = this.getTargetDate();
        const techoFolder = this.settings.techoFolderPath || DEFAULT_SETTINGS.techoFolderPath;
        const monthFileName = `${targetDate.slice(0, 7)}.md`;
        const techoFilePath = `${techoFolder}/${monthFileName}`;
        
        const techoFile = this.app.vault.getAbstractFileByPath(techoFilePath);
        if (!techoFile) {
            new Notice(`Techo月別ファイルが見つかりません (${techoFilePath})`);
            return;
        }

        const techoContent = await this.app.vault.read(techoFile);
        const items = this.extractTechoItemsForDate(techoContent, targetDate);
        if (items.length === 0) {
            new Notice(`${targetDate} の項目が手帳に見つかりませんでした`);
            return;
        }

        const logContent = editor.getValue();
        const rawHeader = this.settings.techoImportHeader || DEFAULT_SETTINGS.techoImportHeader;
        const header = this.normalizeTechoHeader(rawHeader);
        const mode = this.settings.techoImportMode || DEFAULT_SETTINGS.techoImportMode;
        
        const result = this.applyTechoImportToLog(logContent, header, items, mode);
        
        if (result.addedCount === 0) {
            new Notice("既に取り込み済みです");
        } else {
            editor.setValue(result.content);
            new Notice(`${result.addedCount} 件の項目をインポートしました`);
        }
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
        return String(title || "").replace(/\s+/g, " ").trim();
    }

    _isInvalidSuggestTitle(title) {
        const t = this._normalizeTaskTitle(title);
        if (!t) return true;
        if (/^\+\d+\s*m(?:in)?$/i.test(t)) return true;
        if (/^(?:\d{1,2}:\d{2}|\d{3,4})?[-－ー](?:\d{1,2}:\d{2}|\d{3,4})?$/.test(t)) return true;
        if (/^[-－ー]+$/.test(t)) return true;
        return false;
    }

    _upsertHistoryIndexEntry(index, lineObj, usedAt) {
        const title = this._normalizeTaskTitle(lineObj.title);
        if (!title) return;
        const key = title.toLowerCase();
        const prev = index[key];
        const next = prev ? { ...prev } : {
            title,
            estimate: "",
            count: 0,
            lastUsedAt: ""
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

    async rebuildTaskHistoryIndex() {
        const folderPath = this.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
        const files = this.app.vault.getFiles().filter((f) => f.path.startsWith(folderPath + "/") && f.extension === "md");
        const nextIndex = {};
        let recordCount = 0;
        let droppedNoTitle = 0;
        let droppedPseudo = 0;
        let usedParentFallback = 0;
        const sampleAdded = [];
        const sampleDropped = [];

        this.debugSuggest("rebuild:start", { folderPath, fileCount: files.length });

        for (const file of files) {
            let content = "";
            try {
                content = await this.app.vault.read(file);
            } catch (err) {
                console.error("Failed to read log file for history index:", file?.path, err);
                continue;
            }
            const dateMatch = file.basename.match(/^\d{4}-\d{2}-\d{2}$/);
            const datePart = dateMatch ? dateMatch[0] : "0000-00-00";
            const lines = String(content || "").split(/\r?\n/);
            let currentParentTask = null;
            let fileAdded = 0;
            let fileDropped = 0;

            for (const line of lines) {
                const parsed = TaskLine.parse(line);
                if (!parsed) {
                    continue;
                }

                const isChild = parsed.indent.length > 0;
                if (!isChild) {
                    currentParentTask = parsed;
                }

                if (!this.isTaskExecutionRecord(parsed)) {
                    continue;
                }

                const timePart = parsed.actualEnd || parsed.actualStart || parsed.skippedAt || "0000";
                const usedAt = `${datePart} ${timePart}`;

                // Legacy log format support:
                // parent line = title/estimate, child line = actual time.
                // In that case, index the parent task instead of the time-only child line.
                let source = parsed;
                if (isChild && currentParentTask && this._normalizeTaskTitle(currentParentTask.title)) {
                    source = currentParentTask;
                    usedParentFallback++;
                }

                const sourceTitle = this._normalizeTaskTitle(source.title);
                if (!sourceTitle || this._isInvalidSuggestTitle(sourceTitle)) {
                    droppedNoTitle++;
                    fileDropped++;
                    if (sampleDropped.length < 10) {
                        sampleDropped.push({ file: file.path, line, reason: "invalid-title" });
                    }
                    continue;
                }

                recordCount++;
                fileAdded++;
                this._upsertHistoryIndexEntry(nextIndex, source, usedAt);
                if (sampleAdded.length < 10) {
                    sampleAdded.push({ usedAt, title: sourceTitle, file: file.path });
                }
            }

            this.debugSuggest("rebuild:file", { file: file.path, lines: lines.length, added: fileAdded, dropped: fileDropped });
        }

        this.settings.taskHistoryIndex = nextIndex;
        this.settings.taskHistoryIndexUpdatedAt = moment().format("YYYY-MM-DD HH:mm:ss");
        this.settings.taskHistoryIndexVersion = DEFAULT_SETTINGS.taskHistoryIndexVersion;
        await this.saveSettings();

        this.debugSuggest("rebuild:done", {
            uniqueCount: Object.keys(nextIndex).length,
            recordCount,
            droppedNoTitle,
            droppedPseudo,
            usedParentFallback,
            sampleAdded,
            sampleDropped
        });

        return {
            fileCount: files.length,
            recordCount,
            uniqueCount: Object.keys(nextIndex).length
        };
    }

    async rebuildTaskSuggestIndexCommand() {
        this.debugSuggestAlways("command:rebuild-index", {
            debugSuggestLogs: !!this.settings?.debugSuggestLogs
        });
        const stats = await this.rebuildTaskHistoryIndex();
        new Notice(`サジェスト索引を更新: ${stats.uniqueCount}件（記録${stats.recordCount}件 / ファイル${stats.fileCount}件）`);
    }

    _historyEntriesForSuggest() {
        const raw = this.settings.taskHistoryIndex || {};
        const normalized = [];
        let dropped = 0;
        const droppedSamples = [];

        for (const [key, value] of Object.entries(raw)) {
            // current schema: { title, estimate, count, lastUsedAt }
            if (value && typeof value === "object" && !Array.isArray(value)) {
                const title = this._normalizeTaskTitle(value.title || key);
                if (!title || this._isInvalidSuggestTitle(title)) {
                    dropped++;
                    if (droppedSamples.length < 10) droppedSamples.push({ key, value });
                    continue;
                }
                normalized.push({
                    title,
                    estimate: value.estimate ? String(value.estimate) : "",
                    count: Number.isFinite(value.count) ? value.count : parseInt(value.count || "0", 10) || 0,
                    lastUsedAt: value.lastUsedAt ? String(value.lastUsedAt) : ""
                });
                continue;
            }

            // legacy schema fallback: key=title, value=estimate or count
            const fallbackTitle = this._normalizeTaskTitle(key);
            if (!fallbackTitle || this._isInvalidSuggestTitle(fallbackTitle)) {
                dropped++;
                if (droppedSamples.length < 10) droppedSamples.push({ key, value });
                continue;
            }
            normalized.push({
                title: fallbackTitle,
                estimate: typeof value === "string" && /^\d+$/.test(value) ? value : "",
                count: typeof value === "number" ? value : 0,
                lastUsedAt: ""
            });
        }

        // Merge duplicates by title, keeping latest timestamp and non-empty estimate.
        const dedup = {};
        for (const item of normalized) {
            const k = this._normalizeTaskTitle(item.title).toLowerCase();
            const prev = dedup[k];
            if (!prev) {
                dedup[k] = { ...item };
                continue;
            }
            prev.count = (prev.count || 0) + (item.count || 0);
            if (!prev.estimate && item.estimate) prev.estimate = item.estimate;
            if ((item.lastUsedAt || "") > (prev.lastUsedAt || "")) {
                prev.lastUsedAt = item.lastUsedAt;
                prev.title = item.title;
                if (item.estimate) prev.estimate = item.estimate;
            }
        }
        const merged = Object.values(dedup);
        const invalidAfterMerge = merged.filter((x) => this._isInvalidSuggestTitle(x?.title)).length;

        this.debugSuggest("suggest:entries:normalize", {
            rawCount: Object.keys(raw).length,
            normalizedCount: normalized.length,
            mergedCount: merged.length,
            invalidAfterMerge,
            dropped,
            droppedSamples
        });

        return merged.sort((a, b) => {
            if ((b.lastUsedAt || "") !== (a.lastUsedAt || "")) {
                return (b.lastUsedAt || "").localeCompare(a.lastUsedAt || "");
            }
            return (b.count || 0) - (a.count || 0);
        });
    }

    _buildTaskLineFromHistoryEntry(entry, baseLineObj) {
        const tl = new TaskLine();
        tl.indent = baseLineObj ? baseLineObj.indent : "";
        tl.bullet = baseLineObj ? baseLineObj.bullet : "- ";
        tl.title = entry.title;
        tl.estimate = entry.estimate || "";
        return tl.toString();
    }

    _insertTaskLineBelow(editor, anchorIdx, lineText) {
        const lineCount = editor.lineCount();
        if (lineCount <= 0) {
            editor.setValue(lineText);
            editor.setCursor({ line: 0, ch: lineText.length });
            return;
        }

        // Insert below the anchor. If anchor is the last line, append safely at EOF.
        if (anchorIdx >= lineCount - 1) {
            const lastIdx = lineCount - 1;
            const lastText = editor.getLine(lastIdx);
            if (lastText.length === 0) {
                editor.replaceRange(lineText, { line: lastIdx, ch: 0 });
                editor.setCursor({ line: lastIdx, ch: lineText.length });
            } else {
                editor.replaceRange(`\n${lineText}`, { line: lastIdx, ch: lastText.length });
                editor.setCursor({ line: lastIdx + 1, ch: lineText.length });
            }
            return;
        }

        const insertAt = Math.max(0, anchorIdx + 1);
        editor.replaceRange(`${lineText}\n`, { line: insertAt, ch: 0 });
        editor.setCursor({ line: insertAt, ch: lineText.length });
    }

    async insertTaskFromHistorySuggest(editor) {
        this.debugSuggestAlways("command:insert-from-history", {
            debugSuggestLogs: !!this.settings?.debugSuggestLogs
        });
        await this.rebuildTaskHistoryIndex();
        const entries = this._historyEntriesForSuggest();
        const sampleTitles = entries.slice(0, 20).map((x) => ({
            title: x?.title,
            estimate: x?.estimate || "",
            count: x?.count || 0,
            lastUsedAt: x?.lastUsedAt || ""
        }));
        this.debugSuggestAlways("suggest:open", {
            entryCount: entries.length,
            sampleEntries: sampleTitles
        });
        this.debugSuggestAlways("suggest:open:titles", sampleTitles.map((x, i) =>
            `${i + 1}. ${x.title || "(empty)"} | est=${x.estimate || "-"} | count=${x.count || 0} | last=${x.lastUsedAt || "-"}`
        ).join("\n"));
        if (entries.length === 0) {
            new Notice("過去の実行履歴が見つかりません");
            return;
        }

        const selected = await new Promise((resolve) => {
            const modal = new TaskHistorySuggestModal(this.app, entries, resolve);
            modal.open();
        });
        this.debugSuggestAlways("suggest:selected:raw", selected);
        if (!selected) return;
        if (!selected.title) {
            new Notice("無効な履歴エントリです。インデックスを再構築してください。");
            this.debugSuggest("suggest:selected:invalid", selected);
            return;
        }

        const runningIdx = this._findRunningTaskIndex(editor);
        const latestIdx = this._findLatestExecutedTaskIndex(editor);
        const anchorIdx = runningIdx !== -1 ? runningIdx : (latestIdx !== -1 ? latestIdx : editor.getCursor().line);
        const anchorObj = anchorIdx >= 0 && anchorIdx < editor.lineCount()
            ? TaskLine.parse(editor.getLine(anchorIdx))
            : null;

        const insertLineText = this._buildTaskLineFromHistoryEntry(selected, anchorObj);
        this.debugSuggestAlways("suggest:insert", {
            selected,
            runningIdx,
            latestIdx,
            anchorIdx,
            insertLineText
        });
        this._insertTaskLineBelow(editor, anchorIdx, insertLineText);
        new Notice("過去タスクを挿入しました");
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
        const leaf = await this.openRelativeDayNote(0);
        if (leaf) {
            this.jumpToActiveTask(leaf);
        }
    }

    async openTodaysDailyNote() {
        const folder = this.settings.dailyNoteFolderPath || DEFAULT_SETTINGS.dailyNoteFolderPath;
        const todayStr = moment().format('YYYY-MM-DD');
        const filePath = `${folder}/${todayStr}.md`;
        let file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file) {
            // Create if not exists
            let folderObj = this.app.vault.getAbstractFileByPath(folder);
            if (!folderObj) {
                await this.app.vault.createFolder(folder);
            }
            file = await this.app.vault.create(filePath, '');
        }
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
    }

    async openRelativeDayNote(offsetDays) {
        const folderPath = this.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
        
        let baseDate = moment();
        
        // If there is an active file in the target folder AND offset is NOT 0, use its date as the base
        // (This allows relative navigation +/- 1 day from the current view)
        const activeFile = this.app.workspace.getActiveFile();
        if (offsetDays !== 0 && activeFile && activeFile.path.startsWith(folderPath + '/')) {
            const fileNameDate = moment(activeFile.basename, 'YYYY-MM-DD', true);
            if (fileNameDate.isValid()) {
                baseDate = fileNameDate;
            }
        }

        const targetDate = baseDate.add(offsetDays, 'days').format('YYYY-MM-DD');
        const filePath = `${folderPath}/${targetDate}.md`;

        let folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            await this.app.vault.createFolder(folderPath);
        }

        let file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file) {
            file = await this.app.vault.create(filePath, `# ${targetDate}\n\n`);
        }

        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
        return leaf;
    }

    async jumpToActiveTask(leaf: obsidian.WorkspaceLeaf) {
        // Wait a small timeout for the view to be fully ready
        setTimeout(async () => {
            const view = leaf.view;
            if (!(view instanceof obsidian.MarkdownView)) return;
            const editor = view.editor;
            const lineCount = editor.lineCount();
            
            let runningLine = -1;
            let lastCompletedLine = -1;
            
            for (let i = 0; i < lineCount; i++) {
                const line = editor.getLine(i);
                // Simple string checks for icons
                if (line.includes('▶️') || line.includes('🏃')) {
                    runningLine = i;
                } else if (line.includes('✔️') || line.includes('✅') || line.includes('[x]')) {
                    lastCompletedLine = i;
                }
            }
            
            let targetLine = -1;
            if (runningLine !== -1) {
                targetLine = runningLine + 1;
            } else if (lastCompletedLine !== -1) {
                targetLine = lastCompletedLine + 1;
            }
            
            if (targetLine !== -1) {
                if (targetLine >= lineCount) targetLine = lineCount - 1;
                
                editor.setCursor({ line: targetLine, ch: 0 });
                editor.scrollIntoView({ from: { line: targetLine, ch: 0 }, to: { line: targetLine, ch: 0 } }, true);
                
                // Focus the editor
                this.app.workspace.setActiveLeaf(leaf, { focus: true });
                editor.focus();
            }
        }, 150);
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

class FolderSuggest extends obsidian.AbstractInputSuggest {
    constructor(app, textInputEl) {
        super(app, textInputEl);
        this.app = app;
    }

    getSuggestions(query) {
        const abstractFiles = this.app.vault.getAllLoadedFiles();
        const folders = [];
        const lowerCaseQuery = query.toLowerCase();

        abstractFiles.forEach((file) => {
            if (file instanceof obsidian.TFolder && file.path.toLowerCase().indexOf(lowerCaseQuery) !== -1) {
                folders.push(file);
            }
        });

        return folders;
    }

    renderSuggestion(file, el) {
        el.setText(file.path);
    }

    selectSuggestion(file) {
        this.textInputEl.value = file.path;
        this.textInputEl.trigger("input");
        this.close();
    }
}

class FileSuggest extends obsidian.AbstractInputSuggest {
    constructor(app, textInputEl) {
        super(app, textInputEl);
        this.app = app;
    }

    getSuggestions(query) {
        const abstractFiles = this.app.vault.getAllLoadedFiles();
        const files = [];
        const lowerCaseQuery = query.toLowerCase();

        abstractFiles.forEach((file) => {
            if (file instanceof obsidian.TFile && file.path.toLowerCase().indexOf(lowerCaseQuery) !== -1) {
                files.push(file);
            }
        });

        return files.slice(0, 100);
    }

    renderSuggestion(file, el) {
        el.setText(file.path);
    }

    selectSuggestion(file) {
        this.textInputEl.value = file.path;
        this.textInputEl.trigger("input");
        this.close();
    }
}

class IconSuggest extends obsidian.AbstractInputSuggest {
    constructor(app, textInputEl) {
        super(app, textInputEl);
        this.app = app;
    }

    getSuggestions(query) {
        const icons = obsidian.getIconIds();
        if (!query) return icons.slice(0, 100);
        return icons.filter(icon => icon.toLowerCase().contains(query.toLowerCase())).slice(0, 100);
    }

    renderSuggestion(icon, el) {
        const div = el.createDiv({ cls: "tcl-icon-suggest-item" });
        div.style.display = "flex";
        div.style.alignItems = "center";
        div.style.gap = "8px";
        
        const iconDiv = div.createDiv();
        obsidian.setIcon(iconDiv, icon);
        
        div.createSpan({ text: icon });
    }

    selectSuggestion(icon) {
        this.textInputEl.value = icon;
        this.textInputEl.trigger("input");
        this.close();
    }
}

class CommandSuggest extends obsidian.AbstractInputSuggest {
    constructor(app, textInputEl) {
        super(app, textInputEl);
        this.app = app;
    }

    getSuggestions(query) {
        const commands = this.app.commands.listCommands();
        if (!query) return commands.slice(0, 100);
        const lowerQuery = query.toLowerCase();
        return commands.filter(cmd => 
            cmd.name.toLowerCase().contains(lowerQuery) || 
            cmd.id.toLowerCase().contains(lowerQuery)
        ).slice(0, 100);
    }

    renderSuggestion(cmd, el) {
        const div = el.createDiv();
        div.createEl("b", { text: cmd.name });
        div.createDiv({ 
            text: cmd.id, 
            attr: { style: "font-size: 0.8em; color: var(--text-faint);" } 
        });
    }

    selectSuggestion(cmd) {
        this.textInputEl.value = cmd.id;
        this.textInputEl.trigger("input");
        this.close();
    }
}

class TaskHistorySuggestModal extends obsidian.FuzzySuggestModal {
    constructor(app, entries, onSubmit) {
        super(app);
        this.entries = entries;
        this.onSubmit = onSubmit;
        this.submitted = false;
        this.setPlaceholder("過去のタスク名を検索...");
        this.setInstructions([
            { command: "↑↓", purpose: "選択" },
            { command: "Enter", purpose: "挿入" },
            { command: "Esc", purpose: "キャンセル" }
        ]);
    }

    getItems() {
        const items = (this.entries || []).filter((item) => item && typeof item === "object" && String(item.title || "").trim().length > 0);
        console.warn("[taskchute-line:suggest] modal:getItems", { count: items.length });
        return items;
    }

    _toHistoryItem(item) {
        // FuzzySuggestModal may pass a match object like { item, score, matches }.
        if (item && typeof item === "object" && item.item) {
            return this._toHistoryItem(item.item);
        }
        if (typeof item === "string") {
            return {
                title: item,
                estimate: "",
                count: 0,
                lastUsedAt: ""
            };
        }
        if (item && typeof item === "object") {
            if (item.title || item.estimate || item.lastUsedAt || item.count !== undefined) {
                return item;
            }
            // defensive fallback for unknown object shapes
            const fallbackTitle = String(item.text || item.label || item.name || "").trim();
            if (fallbackTitle) {
                return {
                    title: fallbackTitle,
                    estimate: "",
                    count: 0,
                    lastUsedAt: ""
                };
            }
            return item;
        }
        return {
            title: "",
            estimate: "",
            count: 0,
            lastUsedAt: ""
        };
    }

    getItemText(item) {
        const it = this._toHistoryItem(item);
        const title = it.title || "(no title)";
        return it.estimate ? `${title} （${it.estimate}m）` : title;
    }

    renderSuggestion(item, el) {
        const it = this._toHistoryItem(item);
        if (!it.title) {
            console.warn("[taskchute-line:suggest] modal:render:empty-title", { raw: item });
        }
        const title = el.createDiv({ cls: "tc-history-title" });
        title.setText(this.getItemText(it));
        const meta = el.createEl("small", { cls: "tc-history-meta" });
        meta.setText(`last: ${it.lastUsedAt || '-'} / count: ${it.count || 0}`);
    }

    onChooseItem(item, evt) {
        this.submitted = true;
        const chosen = this._toHistoryItem(item);
        console.warn("[taskchute-line:suggest] modal:onChooseItem", chosen);
        this.onSubmit(chosen);
    }

    onClose() {
        console.warn("[taskchute-line:suggest] modal:onClose", { submitted: this.submitted });
        // In Obsidian, onClose can fire before onChooseItem in some flows.
        // Defer cancel handling to let onChooseItem mark `submitted` first.
        setTimeout(() => {
            if (!this.submitted) {
                this.onSubmit(null);
            }
        }, 0);
    }
}

class TaskChuteLineSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'TaskChute Line Settings' });

        new Setting(containerEl)
            .setName('Log folder path')
            .setDesc('デイリーノートを保存するフォルダ (例: taskchute-line)')
            .addText(text => {
                text
                    .setPlaceholder(DEFAULT_SETTINGS.logFolderPath)
                    .setValue(this.plugin.settings.logFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.logFolderPath = value.trim() || DEFAULT_SETTINGS.logFolderPath;
                        await this.plugin.saveSettings();
                    });
                new FolderSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('Template folder path')
            .setDesc('テンプレートが保存されているフォルダ (例: templates)')
            .addText(text => {
                text
                    .setPlaceholder(DEFAULT_SETTINGS.templateFolderPath)
                    .setValue(this.plugin.settings.templateFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.templateFolderPath = value.trim();
                        await this.plugin.saveSettings();
                    });
                new FolderSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('Techo folder path')
            .setDesc('手帳データが保存されているフォルダ (例: techo)')
            .addText(text => {
                text
                    .setPlaceholder(DEFAULT_SETTINGS.techoFolderPath)
                    .setValue(this.plugin.settings.techoFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.techoFolderPath = value.trim();
                        await this.plugin.saveSettings();
                    });
                new FolderSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('Roll file path')
            .setDesc('ロールリマインダーに使用する設定ファイル (例: 11_notes/MT ROLL.md)')
            .addText(text => {
                text
                    .setPlaceholder(DEFAULT_SETTINGS.rollFilePath)
                    .setValue(this.plugin.settings.rollFilePath || DEFAULT_SETTINGS.rollFilePath)
                    .onChange(async (value) => {
                        this.plugin.settings.rollFilePath = value.trim();
                        await this.plugin.saveSettings();
                    });
                new FileSuggest(this.app, text.inputEl);
            });
        new Setting(containerEl)
            .setName('Techo import header')
            .setDesc('手帳からインポートする際のヘッダー名 (例: ## techoからインポート)')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.techoImportHeader)
                .setValue(this.plugin.settings.techoImportHeader || DEFAULT_SETTINGS.techoImportHeader)
                .onChange(async (value) => {
                    this.plugin.settings.techoImportHeader = value.trim() || DEFAULT_SETTINGS.techoImportHeader;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Techo import mode')
            .setDesc('インポート時のマージ方法 (append: 追記, replace: 置換)')
            .addDropdown(dropdown => dropdown
                .addOption('append', 'Append')
                .addOption('replace', 'Replace')
                .setValue(this.plugin.settings.techoImportMode || 'append')
                .onChange(async (value) => {
                    this.plugin.settings.techoImportMode = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Suggest debug logs')
            .setDesc('サジェスト索引の構築・挿入時に詳細ログをDeveloper Consoleへ出力')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.debugSuggestLogs)
                .onChange(async (value) => {
                    this.plugin.settings.debugSuggestLogs = !!value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('モバイルで自動的にスクロールエディタを開く')
            .setDesc('モバイル環境でObsidian起動時にスクロールエディタを自動で開きます')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.mobileAutoOpenScroll)
                .onChange(async (value) => {
                    this.plugin.settings.mobileAutoOpenScroll = !!value;
                    await this.plugin.saveSettings();
                })
            );

        containerEl.createEl('h3', { text: 'Dashboard' });

        new Setting(containerEl)
            .setName('エディタ上部にダッシュボードを表示')
            .setDesc('ログファイルを開いた時、エディタ上部に進捗ダッシュボードを表示します')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableDashboard !== false)
                .onChange(async (value) => {
                    this.plugin.settings.enableDashboard = !!value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('ステータスバーにサマリーを表示')
            .setDesc('画面下部のステータスバーに現在タスクと進捗サマリーを表示します')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableStatusBar !== false)
                .onChange(async (value) => {
                    this.plugin.settings.enableStatusBar = !!value;
                    await this.plugin.saveSettings();
                    this.plugin.updateStatusBar();
                })
            );

        new Setting(containerEl)
            .setName('画面上部にトップバーを表示')
            .setDesc('画面最上部に常時表示される進捗バーを表示します（クリックで今日のノートを開く）')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableTopBar !== false)
                .onChange(async (value) => {
                    this.plugin.settings.enableTopBar = !!value;
                    await this.plugin.saveSettings();
                    this.plugin.updateTopBar();
                })
            );

        new Setting(containerEl)
            .setName('上部バーにナビゲーションボタンを表示')
            .setDesc('画面最上部のバーに「◀ 今日 ▶」のボタンを表示します')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showTopBarNav !== false)
                .onChange(async (value) => {
                    this.plugin.settings.showTopBarNav = !!value;
                    await this.plugin.saveSettings();
                    this.plugin.updateTopBar();
                })
            );

        new Setting(containerEl)
            .setName('デイリーノートのフォルダ')
            .setDesc('デイリーノート（01_Daily等）のフォルダパス')
            .addText(text => {
                text
                    .setPlaceholder(DEFAULT_SETTINGS.dailyNoteFolderPath)
                    .setValue(this.plugin.settings.dailyNoteFolderPath || DEFAULT_SETTINGS.dailyNoteFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.dailyNoteFolderPath = value.trim() || DEFAULT_SETTINGS.dailyNoteFolderPath;
                        await this.plugin.saveSettings();
                    });
                new FolderSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('Self Twitterの見出し')
            .setDesc('デイリーノート内のSelf Twitterセクションの見出し')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.selfTwitterHeader)
                .setValue(this.plugin.settings.selfTwitterHeader || DEFAULT_SETTINGS.selfTwitterHeader)
                .onChange(async (value) => {
                    this.plugin.settings.selfTwitterHeader = value.trim() || DEFAULT_SETTINGS.selfTwitterHeader;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('モバイル：トップバーの表示位置調整 (px)')
            .setDesc('iPhoneのノッチやダイナミックアイランドを避けるための上部余白（ピクセル単位）')
            .addText(text => text
                .setPlaceholder('0')
                .setValue(String(this.plugin.settings.mobileTopBarOffset || 0))
                .onChange(async (value) => {
                    const num = parseInt(value, 10);
                    this.plugin.settings.mobileTopBarOffset = isNaN(num) ? 0 : num;
                    await this.plugin.saveSettings();
                    this.plugin.updateTopBar();
                })
            );

        new Setting(containerEl)
            .setName('モバイル：カスタムボタン1 (アイコン名)')
            .setDesc('Lucideアイコン名を指定 (例: pencil, search, calendar 等)')
            .addText(text => {
                text
                    .setValue(this.plugin.settings.mobileCustomIcon1 || '')
                    .onChange(async (value) => {
                        this.plugin.settings.mobileCustomIcon1 = value.trim();
                        await this.plugin.saveSettings();
                        this.plugin.updateTopBar();
                    });
                new IconSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('モバイル：カスタムボタン1 (コマンドID)')
            .setDesc('実行するコマンドIDを指定')
            .addText(text => {
                text
                    .setValue(this.plugin.settings.mobileCustomCommand1 || '')
                    .onChange(async (value) => {
                        this.plugin.settings.mobileCustomCommand1 = value.trim();
                        await this.plugin.saveSettings();
                    });
                new CommandSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('モバイル：カスタムボタン2 (アイコン名)')
            .setDesc('Lucideアイコン名を指定')
            .addText(text => {
                text
                    .setValue(this.plugin.settings.mobileCustomIcon2 || '')
                    .onChange(async (value) => {
                        this.plugin.settings.mobileCustomIcon2 = value.trim();
                        await this.plugin.saveSettings();
                        this.plugin.updateTopBar();
                    });
                new IconSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('モバイル：カスタムボタン2 (コマンドID)')
            .setDesc('実行するコマンドIDを指定')
            .addText(text => {
                text
                    .setValue(this.plugin.settings.mobileCustomCommand2 || '')
                    .onChange(async (value) => {
                        this.plugin.settings.mobileCustomCommand2 = value.trim();
                        await this.plugin.saveSettings();
                        new CommandSuggest(this.app, text.inputEl);
                    });
            });

        new Setting(containerEl)
            .setName('チェックボックスタップでのタスク操作を有効化（実験的機能）')
            .setDesc('チェックボックスをタップした際、未開始の場合は「開始」、進行中の場合は「終了」を自動打刻します。（他に進行中のタスクがあれば合わせて終了させます）')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.enableCheckboxClickHook)
                .onChange(async (value) => {
                    this.plugin.settings.enableCheckboxClickHook = !!value;
                    await this.plugin.saveSettings();
                })
            );
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
