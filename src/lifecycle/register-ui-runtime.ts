export interface TaskLinerUiRuntimeDeps {
    TaskChuteCalendarView: any;
    TaskChuteScrollView: any;
    buildDashboardPanelExtension: (plugin: any) => any;
}

export function registerTaskLinerUiRuntime(this: any, deps: TaskLinerUiRuntimeDeps) {
    const { TaskChuteCalendarView, TaskChuteScrollView, buildDashboardPanelExtension } = deps;

    this.registerView(
        'taskliner-calendar-view',
        (leaf) => new TaskChuteCalendarView(leaf, this)
    );

    this.addCommand({
        id: 'open-calendar-view',
        name: 'カレンダービューを開く (Open Calendar View)',
        icon: 'calendar-clock',
        callback: async () => {
            const existing = this.app.workspace.getLeavesOfType('taskliner-calendar-view');
            if (existing.length > 0) {
                this.app.workspace.revealLeaf(existing[0]);
                return;
            }
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.setViewState({ type: 'taskliner-calendar-view', active: true });
            this.app.workspace.revealLeaf(leaf);
        }
    });

    this.registerView(
        'taskliner-scroll-view',
        (leaf) => new TaskChuteScrollView(leaf, this)
    );

    this.addCommand({
        id: 'open-scroll-view',
        name: 'スクロールエディタを開く (Open Scroll Editor)',
        icon: 'scroll-text',
        callback: async () => {
            const existing = this.app.workspace.getLeavesOfType('taskliner-scroll-view');
            if (existing.length > 0) {
                this.app.workspace.revealLeaf(existing[0]);
                return;
            }
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.setViewState({ type: 'taskliner-scroll-view', active: true });
            this.app.workspace.revealLeaf(leaf);
        }
    });

    this.app.workspace.onLayoutReady(async () => {
        if (this.app.isMobile && this.settings.mobileAutoOpenScroll) {
            const existing = this.app.workspace.getLeavesOfType('taskliner-scroll-view');
            if (existing.length === 0) {
                const leaf = this.app.workspace.getLeaf(true);
                await leaf.setViewState({ type: 'taskliner-scroll-view', active: true });
                this.app.workspace.revealLeaf(leaf);
            }
        }
    });

    try {
        this.dashboardPanelExtension = buildDashboardPanelExtension(this);
        this.registerEditorExtension(this.dashboardPanelExtension);
    } catch (e) {
        console.error("TaskChuteLine Dashboard Panel failed to load", e);
    }

    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass('tcl-statusbar');
    this.registerInterval(
        window.setInterval(() => {
            this.updateStatusBar();
        }, 30000)
    );

    this.registerEvent(
        this.app.workspace.on('active-leaf-change', () => {
            this.updateStatusBar();
        })
    );
    this.registerEvent(
        this.app.vault.on('modify', (file) => {
            if (file.path && file.path.startsWith(this.settings.logFolderPath + '/')) {
                this.updateStatusBar();
                this.updateTopBar();
            }
        })
    );
    this.updateStatusBar();

    this.app.workspace.onLayoutReady(() => {
        this.initTopBar();
    });
}
