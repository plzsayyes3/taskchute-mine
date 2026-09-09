import { Notice } from 'obsidian';
import { adjustTaskLineTime } from '../core/task-line';

export function registerTaskLinerCommands(this: any) {
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
}
