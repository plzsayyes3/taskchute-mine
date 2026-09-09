import { App, Notice, TFile, TFolder, moment } from 'obsidian';
import { TaskLine, setLineKeepScroll } from '../core/task-line';
import { DatePickerModal, TimePunchModal } from '../ui/task-modals';

export class TaskExecutionService {
    constructor(private readonly app: App) {}

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
                if (!(dailyFile instanceof TFile)) return;
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
}
