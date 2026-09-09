import { App, Notice, TFile, TFolder, moment } from 'obsidian';
import { TaskLine } from '../core/task-line';
import { DEFAULT_SETTINGS, TaskLinerSettings } from '../settings';
import { RollRepeatModal, TemplateSelectModal } from '../ui/task-modals';

export class TaskPlanningService {
    constructor(
        private readonly app: App,
        private readonly getSettings: () => TaskLinerSettings,
        private readonly isCompletedTask: (lineObj: TaskLine | null) => boolean,
        private readonly openToday: () => Promise<unknown>,
    ) {}

    private get settings(): TaskLinerSettings {
        return this.getSettings();
    }

    isCompletedLineObj(lineObj) {
        return this.isCompletedTask(lineObj);
    }

    async openTodaysNote() {
        return this.openToday();
    }

    async importYesterdayCarryover(editor) {
        const folderPath = this.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
        const yesterdayStr = moment().subtract(1, 'days').format('YYYY-MM-DD');
        const yesterdayFilePath = `${folderPath}/${yesterdayStr}.md`;

        const yesterdayFile = this.app.vault.getAbstractFileByPath(yesterdayFilePath);
        if (!(yesterdayFile instanceof TFile)) {
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

        const selected = await new Promise<any[] | null>((resolve) => {
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
}
