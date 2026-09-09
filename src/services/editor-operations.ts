import { Notice, moment } from 'obsidian';
import { TaskLine } from '../core/task-line';

export class EditorOperationsService {
    constructor(
        private readonly getCursorInfo: (editor: any) => any,
        private readonly isRunningTask: (lineObj: TaskLine | null) => boolean,
        private readonly isStartableTask: (lineObj: TaskLine | null) => boolean,
        private readonly isExecutionRecord: (lineObj: TaskLine | null) => boolean,
    ) {}

    getCursorTaskLineInfo(editor) {
        return this.getCursorInfo(editor);
    }

    isRunningLineObj(lineObj) {
        return this.isRunningTask(lineObj);
    }

    isStartableLineObj(lineObj) {
        return this.isStartableTask(lineObj);
    }

    isTaskExecutionRecord(lineObj) {
        return this.isExecutionRecord(lineObj);
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
}
