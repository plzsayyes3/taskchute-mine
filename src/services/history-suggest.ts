import { Editor } from 'obsidian';
import { TaskLine } from '../core/task-line';
import { TaskHistoryEntry } from '../core/history';

export class HistorySuggestService {
    buildTaskLineFromHistoryEntry(entry: TaskHistoryEntry, baseLineObj: TaskLine | null): string {
        const tl = new TaskLine();
        tl.indent = baseLineObj ? baseLineObj.indent : '';
        tl.bullet = baseLineObj ? baseLineObj.bullet : '- ';
        tl.title = entry.title;
        tl.estimate = entry.estimate || '';
        return tl.toString();
    }

    insertTaskLineBelow(editor: Editor, anchorIdx: number, lineText: string): void {
        const lineCount = editor.lineCount();
        if (lineCount <= 0) {
            editor.setValue(lineText);
            editor.setCursor({ line: 0, ch: lineText.length });
            return;
        }

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
}
