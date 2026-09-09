import { App, Editor, Notice, TFile, moment } from 'obsidian';
import { DEFAULT_SETTINGS, TaskLinerSettings } from '../settings';
import {
    applyTechoImportToLog,
    extractTechoItemsForDate,
    normalizeTechoHeader,
    TechoImportResult,
} from '../core/techo';

export class TechoService {
    constructor(
        private readonly app: App,
        private readonly getSettings: () => TaskLinerSettings
    ) {}

    getTargetDate(): string {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            const dateMatch = activeFile.basename.match(/^\d{4}-\d{2}-\d{2}$/);
            if (dateMatch) {
                return activeFile.basename;
            }
        }
        return moment().format('YYYY-MM-DD');
    }

    normalizeTechoHeader(header: unknown): string {
        return normalizeTechoHeader(header);
    }

    extractTechoItemsForDate(content: unknown, dateStr: string): string[] {
        return extractTechoItemsForDate(content, dateStr);
    }

    applyTechoImportToLog(
        content: unknown,
        header: string,
        items: string[],
        mode: string
    ): TechoImportResult {
        return applyTechoImportToLog(content, header, items, mode);
    }

    async importTechoToday(editor: Editor) {
        const targetDate = this.getTargetDate();
        const settings = this.getSettings();
        const techoFolder = settings.techoFolderPath || DEFAULT_SETTINGS.techoFolderPath;
        const monthFileName = `${targetDate.slice(0, 7)}.md`;
        const techoFilePath = `${techoFolder}/${monthFileName}`;

        const techoFile = this.app.vault.getAbstractFileByPath(techoFilePath);
        if (!techoFile) {
            new Notice(`Techo月別ファイルが見つかりません (${techoFilePath})`);
            return;
        }

        const techoContent = await this.app.vault.read(techoFile as TFile);
        const items = this.extractTechoItemsForDate(techoContent, targetDate);
        if (items.length === 0) {
            new Notice(`${targetDate} の項目が手帳に見つかりませんでした`);
            return;
        }

        const logContent = editor.getValue();
        const rawHeader = settings.techoImportHeader || DEFAULT_SETTINGS.techoImportHeader;
        const header = this.normalizeTechoHeader(rawHeader);
        const mode = settings.techoImportMode || DEFAULT_SETTINGS.techoImportMode;

        const result = this.applyTechoImportToLog(logContent, header, items, mode);

        if (result.addedCount === 0) {
            new Notice('既に取り込み済みです');
        } else {
            editor.setValue(result.content);
            new Notice(`${result.addedCount} 件の項目をインポートしました`);
        }
    }
}
