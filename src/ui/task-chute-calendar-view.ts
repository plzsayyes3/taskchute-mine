import { ItemView, TFile, WorkspaceLeaf, moment } from 'obsidian';
import { TaskLine } from '../core/task-line';
import { DEFAULT_SETTINGS } from '../settings';

export const TASKLINER_CALENDAR_VIEW_TYPE = 'taskliner-calendar-view';

type DaySummary = {
    total: number;
    completed: number;
    running: boolean;
};

export class TaskChuteCalendarView extends ItemView {
    private plugin: any;
    private month = moment().startOf('month');
    private renderVersion = 0;

    constructor(leaf: WorkspaceLeaf, plugin: any) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return TASKLINER_CALENDAR_VIEW_TYPE;
    }

    getDisplayText() {
        return 'TaskLiner Calendar';
    }

    getIcon() {
        return 'calendar-clock';
    }

    async onOpen() {
        this.containerEl.addClass('taskliner-calendar-view');
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (this.isLogPath(file.path)) void this.render();
        }));
        this.registerEvent(this.app.vault.on('create', (file) => {
            if (this.isLogPath(file.path)) void this.render();
        }));
        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (this.isLogPath(file.path)) void this.render();
        }));
        await this.render();
    }

    private logFolderPath() {
        return this.plugin.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
    }

    private isLogPath(path: string) {
        const folder = this.logFolderPath();
        return path.startsWith(folder + '/') && /\d{4}-\d{2}-\d{2}\.md$/.test(path);
    }

    private async summarize(file: TFile | null): Promise<DaySummary> {
        if (!file) return { total: 0, completed: 0, running: false };
        try {
            const content = await this.app.vault.cachedRead(file);
            let total = 0;
            let completed = 0;
            let running = false;
            for (const line of content.split(/\r?\n/)) {
                const task = TaskLine.parse(line);
                if (!task || task.indent.length > 0) continue;
                total++;
                if (this.plugin.isCompletedLineObj(task)) completed++;
                if (this.plugin.isRunningLineObj(task)) running = true;
            }
            return { total, completed, running };
        } catch {
            return { total: 0, completed: 0, running: false };
        }
    }

    private async openDate(date: moment.Moment) {
        const folder = this.logFolderPath();
        const dateStr = date.format('YYYY-MM-DD');
        const path = `${folder}/${dateStr}.md`;
        if (!this.app.vault.getAbstractFileByPath(folder)) {
            await this.app.vault.createFolder(folder);
        }
        let file = this.app.vault.getAbstractFileByPath(path);
        if (!file) {
            file = await this.app.vault.create(path, `# ${dateStr}\n\n`);
        }
        if (file instanceof TFile) {
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
        }
    }

    private button(parent: HTMLElement, text: string, title: string, onClick: () => void) {
        const button = parent.createEl('button', { text, attr: { title } });
        button.style.minWidth = '34px';
        button.style.padding = '4px 8px';
        button.addEventListener('click', onClick);
        return button;
    }

    async render() {
        const version = ++this.renderVersion;
        const root = this.contentEl;
        root.empty();
        root.style.padding = '12px';
        root.style.overflow = 'auto';

        const header = root.createDiv();
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '8px';
        header.style.marginBottom = '12px';

        const left = header.createDiv();
        left.style.display = 'flex';
        left.style.gap = '6px';
        this.button(left, '◀', '前月', () => {
            this.month = this.month.clone().subtract(1, 'month');
            void this.render();
        });
        this.button(left, '今日', '今月へ戻る', () => {
            this.month = moment().startOf('month');
            void this.render();
        });
        this.button(left, '▶', '翌月', () => {
            this.month = this.month.clone().add(1, 'month');
            void this.render();
        });

        const title = header.createEl('strong', { text: this.month.format('YYYY年M月') });
        title.style.fontSize = '1.1em';

        const weekdays = root.createDiv();
        weekdays.style.display = 'grid';
        weekdays.style.gridTemplateColumns = 'repeat(7, minmax(0, 1fr))';
        weekdays.style.gap = '4px';
        for (const name of ['月', '火', '水', '木', '金', '土', '日']) {
            const el = weekdays.createDiv({ text: name });
            el.style.textAlign = 'center';
            el.style.fontSize = '0.8em';
            el.style.color = 'var(--text-muted)';
            el.style.padding = '2px';
        }

        const grid = root.createDiv();
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(7, minmax(0, 1fr))';
        grid.style.gap = '4px';

        const start = this.month.clone().startOf('isoWeek');
        const days = Array.from({ length: 42 }, (_, i) => start.clone().add(i, 'day'));
        const folder = this.logFolderPath();

        const summaries = await Promise.all(days.map(async (day) => {
            const path = `${folder}/${day.format('YYYY-MM-DD')}.md`;
            const candidate = this.app.vault.getAbstractFileByPath(path);
            return this.summarize(candidate instanceof TFile ? candidate : null);
        }));
        if (version !== this.renderVersion) return;

        days.forEach((day, index) => {
            const summary = summaries[index];
            const inMonth = day.month() === this.month.month();
            const isToday = day.isSame(moment(), 'day');
            const cell = grid.createEl('button');
            cell.style.minHeight = '64px';
            cell.style.padding = '6px';
            cell.style.textAlign = 'left';
            cell.style.display = 'flex';
            cell.style.flexDirection = 'column';
            cell.style.gap = '4px';
            cell.style.border = isToday ? '2px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)';
            cell.style.borderRadius = '8px';
            cell.style.background = summary.running ? 'var(--background-modifier-hover)' : 'var(--background-primary)';
            cell.style.opacity = inMonth ? '1' : '0.42';
            cell.style.color = 'var(--text-normal)';
            cell.style.cursor = 'pointer';

            const dayNo = cell.createDiv({ text: String(day.date()) });
            dayNo.style.fontWeight = isToday ? '700' : '500';
            const meta = cell.createDiv();
            meta.style.fontSize = '0.72em';
            meta.style.color = summary.running ? 'var(--text-accent)' : 'var(--text-muted)';
            if (summary.total > 0) {
                meta.setText(`${summary.running ? '▶ ' : ''}✅ ${summary.completed}/${summary.total}`);
            } else {
                meta.setText('—');
            }
            cell.addEventListener('click', () => void this.openDate(day));
        });
    }
}
