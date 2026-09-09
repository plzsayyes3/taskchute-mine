export interface TaskLinerSettings {
    logFolderPath: string;
    templateFolderPath: string;
    techoFolderPath: string;
    techoImportHeader: string;
    techoImportMode: string;
    debugSuggestLogs: boolean;
    mobileAutoOpenScroll: boolean;
    enableDashboard: boolean;
    enableStatusBar: boolean;
    enableTopBar: boolean;
    enableCheckboxClickHook: boolean;
    dailyNoteFolderPath: string;
    selfTwitterHeader: string;
    mobileTopBarOffset: number;
    mobileCustomIcon1: string;
    mobileCustomCommand1: string;
    mobileCustomIcon2: string;
    mobileCustomCommand2: string;
    taskHistoryIndex: Record<string, any>;
    taskHistoryIndexUpdatedAt: string;
    taskHistoryIndexVersion: number;
    rollFilePath: string;
    showTopBarNav: boolean;
}

export const DEFAULT_SETTINGS: TaskLinerSettings = {
    logFolderPath: 'taskchute-line',
    templateFolderPath: 'templates',
    techoFolderPath: 'techo',
    techoImportHeader: '## techoからインポート',
    techoImportMode: 'append',
    debugSuggestLogs: false,
    mobileAutoOpenScroll: false,
    enableDashboard: true,
    enableStatusBar: true,
    enableTopBar: true,
    enableCheckboxClickHook: true,
    dailyNoteFolderPath: '01_Daily',
    selfTwitterHeader: '#### Self Twitter',
    mobileTopBarOffset: 0,
    mobileCustomIcon1: 'pencil',
    mobileCustomCommand1: '',
    mobileCustomIcon2: 'search',
    mobileCustomCommand2: '',
    taskHistoryIndex: {},
    taskHistoryIndexUpdatedAt: '',
    taskHistoryIndexVersion: 1,
    rollFilePath: '11_notes/MT ROLL.md',
    showTopBarNav: true
};
