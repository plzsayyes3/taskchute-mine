import { App, MarkdownView, TFile, WorkspaceLeaf, moment } from 'obsidian';
import { DEFAULT_SETTINGS, TaskLinerSettings } from '../settings';

export class DailyNoteService {
    constructor(
        private readonly app: App,
        private readonly getSettings: () => TaskLinerSettings
    ) {}

    async openTodaysNote() {
        const leaf = await this.openRelativeDayNote(0);
        if (leaf) {
            this.jumpToActiveTask(leaf);
        }
    }

    async openTodaysDailyNote() {
        const settings = this.getSettings();
        const folder = settings.dailyNoteFolderPath || DEFAULT_SETTINGS.dailyNoteFolderPath;
        const todayStr = moment().format('YYYY-MM-DD');
        const filePath = `${folder}/${todayStr}.md`;
        let file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file) {
            const folderObj = this.app.vault.getAbstractFileByPath(folder);
            if (!folderObj) {
                await this.app.vault.createFolder(folder);
            }
            file = await this.app.vault.create(filePath, '');
        }
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file as TFile);
    }

    async openRelativeDayNote(offsetDays: number) {
        const settings = this.getSettings();
        const folderPath = settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;

        let baseDate = moment();

        const activeFile = this.app.workspace.getActiveFile();
        if (offsetDays !== 0 && activeFile && activeFile.path.startsWith(folderPath + '/')) {
            const fileNameDate = moment(activeFile.basename, 'YYYY-MM-DD', true);
            if (fileNameDate.isValid()) {
                baseDate = fileNameDate;
            }
        }

        const targetDate = baseDate.add(offsetDays, 'days').format('YYYY-MM-DD');
        const filePath = `${folderPath}/${targetDate}.md`;

        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            await this.app.vault.createFolder(folderPath);
        }

        let file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file) {
            file = await this.app.vault.create(filePath, `# ${targetDate}\n\n`);
        }

        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file as TFile);
        return leaf;
    }

    jumpToActiveTask(leaf: WorkspaceLeaf) {
        setTimeout(async () => {
            const view = leaf.view;
            if (!(view instanceof MarkdownView)) return;
            const editor = view.editor;
            const lineCount = editor.lineCount();

            let runningLine = -1;
            let lastCompletedLine = -1;

            for (let i = 0; i < lineCount; i++) {
                const line = editor.getLine(i);
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
                editor.scrollIntoView(
                    { from: { line: targetLine, ch: 0 }, to: { line: targetLine, ch: 0 } },
                    true
                );

                this.app.workspace.setActiveLeaf(leaf, { focus: true });
                editor.focus();
            }
        }, 150);
    }
}
