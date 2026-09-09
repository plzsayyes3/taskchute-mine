import { ItemView, Notice, TFile, WorkspaceLeaf, moment } from 'obsidian';

const SCROLL_BATCH_SIZE = 7;
const SAVE_DEBOUNCE_MS = 1000;
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

interface ScrollPluginHost {
    settings: { logFolderPath?: string };
}

export class TaskChuteScrollView extends ItemView {
    private plugin: ScrollPluginHost;
    private loadedDates: string[] = [];
    private saveTimers: Record<string, number> = {};
    private scrollContainer: HTMLElement | null = null;
    private isLoadingMore = false;
    private oldestLoaded: string | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: ScrollPluginHost) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return 'taskchute-scroll-view'; }
    getDisplayText() { return 'TaskChute Scroll'; }
    getIcon() { return 'scroll-text'; }

    async onOpen() {
        const container = this.contentEl;
        container.empty();
        container.addClass('tc-scroll-root');

        const header = container.createDiv({ cls: 'tc-scroll-header' });
        header.createDiv({ cls: 'tc-scroll-title', text: 'TaskChute Scroll Editor' });

        const actions = header.createDiv({ cls: 'tc-scroll-actions' });
        const todayBtn = actions.createEl('button', { cls: 'tc-cal-nav-btn tc-cal-today-btn', text: '今日へ' });
        todayBtn.onclick = () => this.scrollToToday();

        this.scrollContainer = container.createDiv({ cls: 'tc-scroll-container' });

        const today = moment();
        const dates: string[] = [];
        for (let i = 0; i < SCROLL_BATCH_SIZE; i++) {
            dates.push(moment(today).subtract(i, 'days').format('YYYY-MM-DD'));
        }
        this.oldestLoaded = dates[dates.length - 1];

        for (const dateStr of dates) {
            await this.appendDaySection(dateStr);
        }

        this.scrollContainer.addEventListener('scroll', () => {
            const el = this.scrollContainer;
            if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
                void this.loadMore();
            }
        });
    }

    async onClose() {
        for (const timer of Object.values(this.saveTimers)) {
            window.clearTimeout(timer);
        }
        this.saveTimers = {};
        this.contentEl.empty();
    }

    scrollToToday() {
        const todayEl = this.scrollContainer?.querySelector(`[data-date="${moment().format('YYYY-MM-DD')}"]`);
        if (todayEl) {
            todayEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    async loadMore() {
        if (this.isLoadingMore || !this.oldestLoaded) return;
        this.isLoadingMore = true;

        try {
            const dates: string[] = [];
            for (let i = 1; i <= SCROLL_BATCH_SIZE; i++) {
                dates.push(moment(this.oldestLoaded).subtract(i, 'days').format('YYYY-MM-DD'));
            }
            this.oldestLoaded = dates[dates.length - 1];

            for (const dateStr of dates) {
                await this.appendDaySection(dateStr);
            }
        } finally {
            this.isLoadingMore = false;
        }
    }

    async appendDaySection(dateStr: string) {
        if (this.loadedDates.includes(dateStr) || !this.scrollContainer) return;
        this.loadedDates.push(dateStr);

        const folderPath = this.plugin.settings.logFolderPath || 'taskchute-line';
        const filePath = `${folderPath}/${dateStr}.md`;
        const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
        const file = abstractFile instanceof TFile ? abstractFile : null;

        const section = this.scrollContainer.createDiv({ cls: 'tc-scroll-section', attr: { 'data-date': dateStr } });
        const headerDiv = section.createDiv({ cls: 'tc-scroll-date-header' });
        const d = moment(dateStr);
        const dayLabel = WEEKDAY_LABELS[d.day()];
        const isToday = dateStr === moment().format('YYYY-MM-DD');

        headerDiv.createEl('span', {
            cls: `tc-scroll-date-text ${isToday ? 'is-today' : ''}`,
            text: `${dateStr} (${dayLabel})`,
        });

        const openBtn = headerDiv.createEl('button', { cls: 'tc-scroll-open-btn', text: '↗ 開く' });
        openBtn.onclick = async () => {
            if (file) {
                const leaf = this.app.workspace.getLeaf(true);
                await leaf.openFile(file);
            } else {
                new Notice(`ファイルが存在しません: ${filePath}`);
            }
        };

        if (!file) {
            section.createDiv({ cls: 'tc-scroll-empty', text: '（ファイルなし）' });
            return;
        }

        const content = await this.app.vault.read(file);
        const textarea = section.createEl('textarea', {
            cls: 'tc-scroll-textarea',
            attr: { spellcheck: 'false', 'data-filepath': filePath },
        });
        textarea.value = content;

        const autoResize = () => {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        };
        window.setTimeout(autoResize, 0);

        textarea.addEventListener('input', () => {
            autoResize();
            this.debouncedSave(dateStr, filePath, textarea.value);
        });

        this.registerEvent(
            this.app.vault.on('modify', (modifiedFile) => {
                if (modifiedFile.path === filePath && document.activeElement !== textarea && modifiedFile instanceof TFile) {
                    this.app.vault.read(modifiedFile).then((newContent) => {
                        if (textarea.value !== newContent) {
                            textarea.value = newContent;
                            autoResize();
                        }
                    });
                }
            })
        );
    }

    debouncedSave(dateStr: string, filePath: string, content: string) {
        if (this.saveTimers[dateStr]) {
            window.clearTimeout(this.saveTimers[dateStr]);
        }
        this.saveTimers[dateStr] = window.setTimeout(async () => {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                await this.app.vault.modify(file, content);
            }
            delete this.saveTimers[dateStr];
        }, SAVE_DEBOUNCE_MS);
    }
}
