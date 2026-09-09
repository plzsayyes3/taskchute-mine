import { ItemView, TFile, WorkspaceLeaf, moment } from 'obsidian';
import { TaskLine } from '../core/task-line';

const HOUR_START = 5;
const HOUR_END = 25;
const TOTAL_HOURS = HOUR_END - HOUR_START;

const SECTION_COLORS = [
    'hsl(210, 65%, 55%)',
    'hsl(160, 55%, 45%)',
    'hsl(280, 50%, 55%)',
    'hsl(340, 55%, 55%)',
    'hsl(30, 70%, 55%)',
    'hsl(50, 70%, 50%)',
    'hsl(120, 45%, 45%)',
    'hsl(195, 60%, 50%)',
];

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

interface CalendarPluginHost {
    settings: { logFolderPath?: string };
}

interface CalendarTask {
    title: string;
    startMin: number;
    endMin: number;
    estimate: string;
    sectionIndex: number;
    color: string;
}

export class TaskChuteCalendarView extends ItemView {
    private plugin: CalendarPluginHost;
    private mode: 'timeline' | 'block' = 'timeline';
    private currentDate = moment().format('YYYY-MM-DD');
    private weekStartDate = moment().startOf('isoWeek').format('YYYY-MM-DD');

    constructor(leaf: WorkspaceLeaf, plugin: CalendarPluginHost) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return 'taskchute-calendar-view'; }
    getDisplayText() { return 'TaskChute Calendar'; }
    getIcon() { return 'calendar-clock'; }

    async onOpen() {
        await this.renderView();
    }

    async onClose() {
        this.contentEl.empty();
    }

    async loadDayTasks(dateStr: string): Promise<CalendarTask[]> {
        const folderPath = this.plugin.settings.logFolderPath || 'taskchute-line';
        const filePath = `${folderPath}/${dateStr}.md`;
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return [];

        const content = await this.app.vault.read(file);
        const lines = content.split(/\r?\n/);
        const tasks: CalendarTask[] = [];
        let sectionIndex = 0;

        for (const line of lines) {
            if (/^#{1,6}\s+/.test(line)) {
                sectionIndex++;
                continue;
            }
            const parsed = TaskLine.parse(line);
            if (!parsed) continue;
            if (!parsed.actualStart || !parsed.actualEnd) continue;
            if (parsed.indent.length > 0) continue;

            const startMin = this.hhmm2min(parsed.actualStart);
            const endMin = this.hhmm2min(parsed.actualEnd);
            if (startMin === null || endMin === null) continue;

            tasks.push({
                title: parsed.title,
                startMin,
                endMin: endMin < startMin ? endMin + 24 * 60 : (endMin === startMin ? startMin + 1 : endMin),
                estimate: parsed.estimate,
                sectionIndex,
                color: SECTION_COLORS[sectionIndex % SECTION_COLORS.length],
            });
        }
        return tasks;
    }

    hhmm2min(str: string): number | null {
        if (!str || str.length < 3) return null;
        const s = str.replace(':', '');
        const h = parseInt(s.substring(0, s.length - 2), 10);
        const m = parseInt(s.substring(s.length - 2), 10);
        if (isNaN(h) || isNaN(m)) return null;
        return h * 60 + m;
    }

    min2hhmm(min: number): string {
        const h = Math.floor(min / 60) % 24;
        const m = min % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    async renderView() {
        const container = this.contentEl;
        container.empty();
        container.addClass('tc-cal-root');

        const header = container.createDiv({ cls: 'tc-cal-header' });
        this.renderHeader(header);

        const body = container.createDiv({ cls: 'tc-cal-body' });
        if (this.mode === 'timeline') {
            await this.renderTimeline(body);
        } else {
            await this.renderBlockCalendar(body);
        }
    }

    renderHeader(header: HTMLElement) {
        const left = header.createDiv({ cls: 'tc-cal-header-left' });
        const right = header.createDiv({ cls: 'tc-cal-header-right' });

        const toggleTimeline = right.createEl('button', {
            cls: `tc-cal-mode-btn ${this.mode === 'timeline' ? 'is-active' : ''}`,
            text: 'Timeline',
        });
        toggleTimeline.onclick = () => { this.mode = 'timeline'; void this.renderView(); };

        const toggleBlock = right.createEl('button', {
            cls: `tc-cal-mode-btn ${this.mode === 'block' ? 'is-active' : ''}`,
            text: 'Week',
        });
        toggleBlock.onclick = () => { this.mode = 'block'; void this.renderView(); };

        if (this.mode === 'timeline') {
            const prevBtn = left.createEl('button', { cls: 'tc-cal-nav-btn', text: '◀' });
            prevBtn.onclick = () => {
                this.currentDate = moment(this.currentDate).subtract(1, 'day').format('YYYY-MM-DD');
                void this.renderView();
            };

            const dateLabel = left.createEl('span', { cls: 'tc-cal-date-label' });
            const d = moment(this.currentDate);
            dateLabel.setText(`${d.format('YYYY-MM-DD')} (${WEEKDAY_LABELS[d.day()]})`);

            const todayBtn = left.createEl('button', { cls: 'tc-cal-nav-btn tc-cal-today-btn', text: '今日' });
            todayBtn.onclick = () => {
                this.currentDate = moment().format('YYYY-MM-DD');
                void this.renderView();
            };

            const nextBtn = left.createEl('button', { cls: 'tc-cal-nav-btn', text: '▶' });
            nextBtn.onclick = () => {
                this.currentDate = moment(this.currentDate).add(1, 'day').format('YYYY-MM-DD');
                void this.renderView();
            };
        } else {
            const prevBtn = left.createEl('button', { cls: 'tc-cal-nav-btn', text: '◀' });
            prevBtn.onclick = () => {
                this.weekStartDate = moment(this.weekStartDate).subtract(7, 'days').format('YYYY-MM-DD');
                void this.renderView();
            };

            const ws = moment(this.weekStartDate);
            const we = moment(this.weekStartDate).add(6, 'days');
            left.createEl('span', { cls: 'tc-cal-date-label', text: `${ws.format('MM/DD')} – ${we.format('MM/DD')}` });

            const todayBtn = left.createEl('button', { cls: 'tc-cal-nav-btn tc-cal-today-btn', text: '今週' });
            todayBtn.onclick = () => {
                this.weekStartDate = moment().startOf('isoWeek').format('YYYY-MM-DD');
                void this.renderView();
            };

            const nextBtn = left.createEl('button', { cls: 'tc-cal-nav-btn', text: '▶' });
            nextBtn.onclick = () => {
                this.weekStartDate = moment(this.weekStartDate).add(7, 'days').format('YYYY-MM-DD');
                void this.renderView();
            };
        }
    }

    async renderTimeline(body: HTMLElement) {
        const tasks = await this.loadDayTasks(this.currentDate);
        const grid = body.createDiv({ cls: 'tc-cal-timeline' });
        const axis = grid.createDiv({ cls: 'tc-cal-time-axis' });
        for (let h = HOUR_START; h <= HOUR_END; h++) {
            const label = axis.createDiv({ cls: 'tc-cal-time-label' });
            label.setText(this.min2hhmm(h * 60));
            label.style.top = `${((h - HOUR_START) / TOTAL_HOURS) * 100}%`;
        }

        const col = grid.createDiv({ cls: 'tc-cal-task-column' });
        for (let h = HOUR_START; h <= HOUR_END; h++) {
            const line = col.createDiv({ cls: 'tc-cal-grid-line' });
            line.style.top = `${((h - HOUR_START) / TOTAL_HOURS) * 100}%`;
        }

        const now = moment();
        if (this.currentDate === now.format('YYYY-MM-DD')) {
            const nowMin = now.hours() * 60 + now.minutes();
            const adjustedNow = nowMin < HOUR_START * 60 ? nowMin + 24 * 60 : nowMin;
            if (adjustedNow >= HOUR_START * 60 && adjustedNow <= HOUR_END * 60) {
                const nowLine = col.createDiv({ cls: 'tc-cal-now-line' });
                nowLine.style.top = `${((adjustedNow - HOUR_START * 60) / (TOTAL_HOURS * 60)) * 100}%`;
            }
        }

        for (const task of tasks) {
            const adjStart = task.startMin < HOUR_START * 60 ? task.startMin + 24 * 60 : task.startMin;
            const adjEnd = task.endMin < HOUR_START * 60 ? task.endMin + 24 * 60 : task.endMin;
            const clampStart = Math.max(adjStart, HOUR_START * 60);
            const clampEnd = Math.min(adjEnd, HOUR_END * 60);
            if (clampStart >= clampEnd) continue;

            const topPct = ((clampStart - HOUR_START * 60) / (TOTAL_HOURS * 60)) * 100;
            const heightPct = ((clampEnd - clampStart) / (TOTAL_HOURS * 60)) * 100;
            const bar = col.createDiv({ cls: 'tc-cal-task-bar' });
            bar.style.top = `${topPct}%`;
            bar.style.height = `${Math.max(heightPct, 0.4)}%`;
            bar.style.backgroundColor = task.color;

            const duration = clampEnd - clampStart;
            const timeLabel = `${this.min2hhmm(task.startMin)} - ${this.min2hhmm(task.endMin % (24 * 60))}`;
            const cleanTitle = task.title.replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
            bar.createDiv({ cls: 'tc-cal-bar-title', text: cleanTitle });
            if (heightPct > 3) {
                bar.createDiv({ cls: 'tc-cal-bar-meta', text: `${timeLabel}  (${duration}min)` });
            }
            bar.setAttribute('aria-label', `${cleanTitle}\n${timeLabel} (${duration}min)`);
        }

        if (tasks.length === 0) {
            col.createDiv({ cls: 'tc-cal-empty', text: 'この日の実績データはありません' });
        }
    }

    async renderBlockCalendar(body: HTMLElement) {
        const wrapper = body.createDiv({ cls: 'tc-cal-block-wrapper' });
        const headerRow = wrapper.createDiv({ cls: 'tc-cal-block-header' });
        headerRow.createDiv({ cls: 'tc-cal-block-header-cell tc-cal-block-axis-cell' });

        const days: string[] = [];
        const today = moment().format('YYYY-MM-DD');
        for (let i = 0; i < 7; i++) {
            const d = moment(this.weekStartDate).add(i, 'days');
            const dateStr = d.format('YYYY-MM-DD');
            days.push(dateStr);
            const cell = headerRow.createDiv({ cls: `tc-cal-block-header-cell ${dateStr === today ? 'is-today' : ''}` });
            cell.setText(`${d.format('MM/DD')} ${WEEKDAY_LABELS[d.day()]}`);
            cell.onclick = () => {
                this.currentDate = dateStr;
                this.mode = 'timeline';
                void this.renderView();
            };
            cell.style.cursor = 'pointer';
        }

        const gridBody = wrapper.createDiv({ cls: 'tc-cal-block-grid' });
        const axis = gridBody.createDiv({ cls: 'tc-cal-time-axis tc-cal-block-axis' });
        for (let h = HOUR_START; h <= HOUR_END; h += 2) {
            const label = axis.createDiv({ cls: 'tc-cal-time-label' });
            label.setText(this.min2hhmm(h * 60));
            label.style.top = `${((h - HOUR_START) / TOTAL_HOURS) * 100}%`;
        }

        const allTasks = await Promise.all(days.map((d) => this.loadDayTasks(d)));
        for (let i = 0; i < 7; i++) {
            const col = gridBody.createDiv({ cls: `tc-cal-block-col ${days[i] === today ? 'is-today' : ''}` });
            for (let h = HOUR_START; h <= HOUR_END; h += 2) {
                const line = col.createDiv({ cls: 'tc-cal-grid-line' });
                line.style.top = `${((h - HOUR_START) / TOTAL_HOURS) * 100}%`;
            }

            if (days[i] === today) {
                const now = moment();
                const nowMin = now.hours() * 60 + now.minutes();
                const adjustedNow = nowMin < HOUR_START * 60 ? nowMin + 24 * 60 : nowMin;
                if (adjustedNow >= HOUR_START * 60 && adjustedNow <= HOUR_END * 60) {
                    const nowLine = col.createDiv({ cls: 'tc-cal-now-line' });
                    nowLine.style.top = `${((adjustedNow - HOUR_START * 60) / (TOTAL_HOURS * 60)) * 100}%`;
                }
            }

            for (const task of allTasks[i]) {
                const adjStart = task.startMin < HOUR_START * 60 ? task.startMin + 24 * 60 : task.startMin;
                const adjEnd = task.endMin < HOUR_START * 60 ? task.endMin + 24 * 60 : task.endMin;
                const clampStart = Math.max(adjStart, HOUR_START * 60);
                const clampEnd = Math.min(adjEnd, HOUR_END * 60);
                if (clampStart >= clampEnd) continue;

                const topPct = ((clampStart - HOUR_START * 60) / (TOTAL_HOURS * 60)) * 100;
                const heightPct = ((clampEnd - clampStart) / (TOTAL_HOURS * 60)) * 100;
                const bar = col.createDiv({ cls: 'tc-cal-task-bar tc-cal-block-bar' });
                bar.style.top = `${topPct}%`;
                bar.style.height = `${Math.max(heightPct, 0.4)}%`;
                bar.style.backgroundColor = task.color;

                const duration = clampEnd - clampStart;
                const cleanTitle = task.title.replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
                if (heightPct > 4) {
                    bar.createDiv({ cls: 'tc-cal-bar-title', text: cleanTitle });
                }
                bar.setAttribute('aria-label', `${cleanTitle}\n${this.min2hhmm(task.startMin)}-${this.min2hhmm(task.endMin % (24 * 60))} (${duration}min)`);
            }
        }
    }
}
