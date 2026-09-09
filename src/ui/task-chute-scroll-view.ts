import { ItemView, Notice, TFile, WorkspaceLeaf, moment } from 'obsidian';
import { TaskLine } from '../core/task-line';
import { DEFAULT_SETTINGS } from '../settings';

export const TASKLINER_SCROLL_VIEW_TYPE = 'taskliner-scroll-view';

type TaskRow = {
    lineIndex: number;
    task: TaskLine;
};

export class TaskChuteScrollView extends ItemView {
    private plugin: any;
    private date = moment().startOf('day');
    private renderVersion = 0;

    constructor(leaf: WorkspaceLeaf, plugin: any) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return TASKLINER_SCROLL_VIEW_TYPE;
    }

    getDisplayText() {
        return 'TaskLiner Scroll';
    }

    getIcon() {
        return 'scroll-text';
    }

    async onOpen() {
        this.containerEl.addClass('taskliner-scroll-view');
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file.path === this.targetPath()) void this.render();
        }));
        this.registerEvent(this.app.vault.on('create', (file) => {
            if (file.path === this.targetPath()) void this.render();
        }));
        await this.render();
    }

    private logFolderPath() {
        return this.plugin.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
    }

    private targetPath() {
        return `${this.logFolderPath()}/${this.date.format('YYYY-MM-DD')}.md`;
    }

    private async getFile(create = false): Promise<TFile | null> {
        const folder = this.logFolderPath();
        const path = this.targetPath();
        if (!this.app.vault.getAbstractFileByPath(folder) && create) {
            await this.app.vault.createFolder(folder);
        }
        let file = this.app.vault.getAbstractFileByPath(path);
        if (!file && create) {
            const dateStr = this.date.format('YYYY-MM-DD');
            file = await this.app.vault.create(path, `# ${dateStr}\n\n`);
        }
        return file instanceof TFile ? file : null;
    }

    private isTopLevel(task: TaskLine | null) {
        return !!task && task.indent.length === 0;
    }

    private readTaskRows(lines: string[]): TaskRow[] {
        const rows: TaskRow[] = [];
        lines.forEach((line, lineIndex) => {
            const task = TaskLine.parse(line);
            if (this.isTopLevel(task)) rows.push({ lineIndex, task: task as TaskLine });
        });
        return rows;
    }

    private async modifyFile(mutator: (lines: string[]) => boolean | void) {
        const file = await this.getFile(true);
        if (!file) return;
        const content = await this.app.vault.read(file);
        const lines = content.split(/\r?\n/);
        const changed = mutator(lines);
        if (changed === false) return;
        await this.app.vault.modify(file, lines.join('\n'));
        await this.render();
    }

    private async startTask(lineIndex: number) {
        await this.modifyFile((lines) => {
            const target = TaskLine.parse(lines[lineIndex]);
            if (!target || !this.plugin.isStartableLineObj(target)) return false;
            const now = moment().format('HH:mm');
            for (let i = 0; i < lines.length; i++) {
                const running = TaskLine.parse(lines[i]);
                if (running && this.plugin.isRunningLineObj(running)) {
                    running.skippedAt = '';
                    running.actualEnd = now;
                    lines[i] = running.toString();
                }
            }
            target.actualStart = now;
            target.actualEnd = '';
            target.skippedAt = '';
            lines[lineIndex] = target.toString();
            return true;
        });
    }

    private async endRunningTask() {
        let ended = false;
        await this.modifyFile((lines) => {
            const now = moment().format('HH:mm');
            for (let i = 0; i < lines.length; i++) {
                const task = TaskLine.parse(lines[i]);
                if (task && this.plugin.isRunningLineObj(task)) {
                    task.skippedAt = '';
                    task.actualEnd = now;
                    lines[i] = task.toString();
                    ended = true;
                    break;
                }
            }
            return ended;
        });
        if (!ended) new Notice('実行中のタスクが見つかりません');
    }

    private async endAndStartNext() {
        let started = false;
        await this.modifyFile((lines) => {
            const now = moment().format('HH:mm');
            let runningIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                const task = TaskLine.parse(lines[i]);
                if (task && this.plugin.isRunningLineObj(task)) {
                    task.skippedAt = '';
                    task.actualEnd = now;
                    lines[i] = task.toString();
                    runningIndex = i;
                    break;
                }
            }

            const candidates = this.readTaskRows(lines).filter(({ task }) => this.plugin.isStartableLineObj(task));
            const next = candidates.find(({ lineIndex }) => lineIndex > runningIndex) || candidates[0];
            if (!next) return runningIndex !== -1;
            const target = TaskLine.parse(lines[next.lineIndex]);
            if (!target) return runningIndex !== -1;
            target.actualStart = now;
            target.actualEnd = '';
            target.skippedAt = '';
            lines[next.lineIndex] = target.toString();
            started = true;
            return true;
        });
        if (!started) new Notice('開始できる次のタスクが見つかりません');
    }

    private async addTask(title: string) {
        const clean = title.trim();
        if (!clean) return;
        await this.modifyFile((lines) => {
            while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
            if (lines.length > 0) lines.push('');
            lines.push(`- [ ] ${clean}`);
            lines.push('');
            return true;
        });
    }

    private async openSource() {
        const file = await this.getFile(true);
        if (!file) return;
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
    }

    private controlButton(parent: HTMLElement, text: string, title: string, onClick: () => void) {
        const button = parent.createEl('button', { text, attr: { title } });
        button.style.padding = '6px 10px';
        button.addEventListener('click', onClick);
        return button;
    }

    async render() {
        const version = ++this.renderVersion;
        const root = this.contentEl;
        root.empty();
        root.style.height = '100%';
        root.style.boxSizing = 'border-box';
        root.style.display = 'flex';
        root.style.flexDirection = 'column';
        root.style.padding = '10px';
        root.style.gap = '10px';
        root.style.overflow = 'hidden';

        const header = root.createDiv();
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '8px';

        const nav = header.createDiv();
        nav.style.display = 'flex';
        nav.style.gap = '5px';
        this.controlButton(nav, '◀', '前日', () => {
            this.date = this.date.clone().subtract(1, 'day');
            void this.render();
        });
        this.controlButton(nav, '今日', '今日へ戻る', () => {
            this.date = moment().startOf('day');
            void this.render();
        });
        this.controlButton(nav, '▶', '翌日', () => {
            this.date = this.date.clone().add(1, 'day');
            void this.render();
        });

        const dateEl = header.createEl('strong', { text: this.date.format('YYYY-MM-DD (ddd)') });
        dateEl.style.fontSize = '0.95em';
        this.controlButton(header, 'Markdown', '元のログを開く', () => void this.openSource());

        const file = await this.getFile(false);
        let content = '';
        if (file) {
            try {
                content = await this.app.vault.cachedRead(file);
            } catch {
                content = '';
            }
        }
        if (version !== this.renderVersion) return;

        const lines = content.split(/\r?\n/);
        const tasks = this.readTaskRows(lines);
        const running = tasks.find(({ task }) => this.plugin.isRunningLineObj(task));
        const completed = tasks.filter(({ task }) => this.plugin.isCompletedLineObj(task)).length;

        const nowBox = root.createDiv();
        nowBox.style.border = '1px solid var(--background-modifier-border)';
        nowBox.style.borderRadius = '10px';
        nowBox.style.padding = '10px';
        nowBox.style.background = 'var(--background-primary)';
        const label = nowBox.createDiv({ text: 'NOW' });
        label.style.fontSize = '0.72em';
        label.style.color = 'var(--text-muted)';
        const nowTitle = nowBox.createDiv({ text: running ? running.task.title : 'READY' });
        nowTitle.style.fontSize = '1.15em';
        nowTitle.style.fontWeight = '700';
        nowTitle.style.color = running ? 'var(--text-accent)' : 'var(--text-muted)';
        if (running?.task.actualStart) {
            const start = nowBox.createDiv({ text: `開始 ${running.task.actualStart}` });
            start.style.fontSize = '0.8em';
            start.style.color = 'var(--text-muted)';
        }

        const summary = root.createDiv({ text: `✅ ${completed}/${tasks.length}` });
        summary.style.fontSize = '0.82em';
        summary.style.color = 'var(--text-muted)';

        const actions = root.createDiv();
        actions.style.display = 'grid';
        actions.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        actions.style.gap = '6px';
        this.controlButton(actions, '■ End', '実行中タスクを終了', () => void this.endRunningTask());
        this.controlButton(actions, '⏭ E&S', '終了して次を開始', () => void this.endAndStartNext());

        const addRow = root.createDiv();
        addRow.style.display = 'flex';
        addRow.style.gap = '6px';
        const input = addRow.createEl('input', { type: 'text', attr: { placeholder: 'タスクを追加' } });
        input.style.flex = '1';
        input.style.minWidth = '0';
        const add = this.controlButton(addRow, '＋ Add', '末尾にタスクを追加', () => {
            const value = input.value;
            input.value = '';
            void this.addTask(value);
        });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') add.click();
        });

        const list = root.createDiv();
        list.style.flex = '1 1 auto';
        list.style.overflow = 'auto';
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '5px';
        list.style.paddingBottom = '10px';

        if (tasks.length === 0) {
            const empty = list.createDiv({ text: file ? 'タスクはまだありません' : 'この日のログはまだありません' });
            empty.style.padding = '16px';
            empty.style.textAlign = 'center';
            empty.style.color = 'var(--text-muted)';
        }

        tasks.forEach(({ lineIndex, task }, index) => {
            const isRunning = this.plugin.isRunningLineObj(task);
            const isCompleted = this.plugin.isCompletedLineObj(task);
            const isSkipped = this.plugin.isSkippedLineObj(task);
            const button = list.createEl('button');
            button.style.display = 'grid';
            button.style.gridTemplateColumns = '30px minmax(0, 1fr) auto';
            button.style.alignItems = 'center';
            button.style.gap = '8px';
            button.style.width = '100%';
            button.style.padding = '8px';
            button.style.border = isRunning ? '1px solid var(--interactive-accent)' : '1px solid var(--background-modifier-border)';
            button.style.borderRadius = '9px';
            button.style.background = isRunning ? 'var(--background-modifier-hover)' : 'var(--background-primary)';
            button.style.color = 'var(--text-normal)';
            button.style.textAlign = 'left';
            button.style.opacity = isCompleted || isSkipped ? '0.58' : '1';

            const marker = isCompleted ? '✓' : isRunning ? '▶' : isSkipped ? '↪' : String(index + 1);
            const markerEl = button.createDiv({ text: marker });
            markerEl.style.textAlign = 'center';
            markerEl.style.color = isRunning ? 'var(--text-accent)' : 'var(--text-muted)';
            const title = button.createDiv({ text: task.title || '(untitled)' });
            title.style.overflow = 'hidden';
            title.style.textOverflow = 'ellipsis';
            title.style.whiteSpace = 'nowrap';
            const metaParts = [];
            if (task.estimate) metaParts.push(`${task.estimate}m`);
            if (task.actualStart) metaParts.push(task.actualStart);
            if (task.actualEnd) metaParts.push(`→${task.actualEnd}`);
            const meta = button.createDiv({ text: metaParts.join(' ') });
            meta.style.fontSize = '0.75em';
            meta.style.color = 'var(--text-muted)';
            meta.style.fontVariantNumeric = 'tabular-nums';

            if (isRunning) {
                button.title = 'タップで終了';
                button.addEventListener('click', () => void this.endRunningTask());
            } else if (!isCompleted && !isSkipped && this.plugin.isStartableLineObj(task)) {
                button.title = 'タップで開始';
                button.addEventListener('click', () => void this.startTask(lineIndex));
            } else {
                button.disabled = true;
            }
        });
    }
}
