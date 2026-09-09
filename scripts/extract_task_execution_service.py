from pathlib import Path

main_path = Path('src/main.ts')
main = main_path.read_text()

block1_start_marker = '    getCursorTaskLineInfo(editor) {'
block1_end_marker = '    debugSuggest(...args) {'
block2_start_marker = '\tendAndStartTask(editor) {'
block2_end_marker = '    getTargetDate() {'

b1s = main.find(block1_start_marker)
b1e = main.find(block1_end_marker)
b2s = main.find(block2_start_marker)
b2e = main.find(block2_end_marker)
if min(b1s, b1e, b2s, b2e) < 0:
    raise SystemExit('task execution extraction anchors not found')
if not (b1s < b1e < b2s < b2e):
    raise SystemExit('task execution anchors in unexpected order')

block1 = main[b1s:b1e].rstrip()
block2 = main[b2s:b2e].rstrip()

service_path = Path('src/services/task-execution.ts')
if service_path.exists():
    raise SystemExit('task execution service already exists')
service_path.write_text(
    "import { App, Notice, TFile, TFolder, moment } from 'obsidian';\n"
    "import { TaskLine, setLineKeepScroll } from '../core/task-line';\n"
    "import { DatePickerModal, TimePunchModal } from '../ui/task-modals';\n\n"
    "export class TaskExecutionService {\n"
    "    constructor(private readonly app: App) {}\n\n"
    + block1 + "\n\n"
    + block2 + "\n"
    "}\n"
)

block1_wrappers = '''    getCursorTaskLineInfo(editor) {
        return this.taskExecutionService.getCursorTaskLineInfo(editor);
    }

    isSkippedLineObj(lineObj) {
        return this.taskExecutionService.isSkippedLineObj(lineObj);
    }

    _handleCheckboxShortPress(editor, targetIdx) {
        return this.taskExecutionService._handleCheckboxShortPress(editor, targetIdx);
    }

    _handleCheckboxLongPress(editor, targetIdx) {
        return this.taskExecutionService._handleCheckboxLongPress(editor, targetIdx);
    }

    findLatestEndTime(editor) {
        return this.taskExecutionService.findLatestEndTime(editor);
    }

    startTaskFromPreviousEnd(editor, targetIdx) {
        return this.taskExecutionService.startTaskFromPreviousEnd(editor, targetIdx);
    }

    _endCurrentlyRunningTask(editor, endTime) {
        return this.taskExecutionService._endCurrentlyRunningTask(editor, endTime);
    }

    startTask(editor, targetIdx) {
        return this.taskExecutionService.startTask(editor, targetIdx);
    }

    endTask(editor, targetIdx) {
        return this.taskExecutionService.endTask(editor, targetIdx);
    }

    isRunningLineObj(lineObj) {
        return this.taskExecutionService.isRunningLineObj(lineObj);
    }

    isCompletedLineObj(lineObj) {
        return this.taskExecutionService.isCompletedLineObj(lineObj);
    }

    isStartableLineObj(lineObj) {
        return this.taskExecutionService.isStartableLineObj(lineObj);
    }

    isTaskExecutionRecord(lineObj) {
        return this.taskExecutionService.isTaskExecutionRecord(lineObj);
    }

'''

block2_wrappers = '''    endAndStartTask(editor) {
        return this.taskExecutionService.endAndStartTask(editor);
    }

    skipTask(editor) {
        return this.taskExecutionService.skipTask(editor);
    }

    async skipTaskWithDate(editor) {
        return this.taskExecutionService.skipTaskWithDate(editor);
    }

    toggleTaskStatus(editor) {
        return this.taskExecutionService.toggleTaskStatus(editor);
    }

    resumeTask(editor) {
        return this.taskExecutionService.resumeTask(editor);
    }

    timePunch(editor) {
        return this.taskExecutionService.timePunch(editor);
    }

'''

main = main[:b1s] + block1_wrappers + main[b1e:b2s] + block2_wrappers + main[b2e:]

import_anchor = "import { DashboardUiService } from './services/dashboard-ui';\n"
service_import = "import { TaskExecutionService } from './services/task-execution';\n"
if import_anchor not in main:
    raise SystemExit('service import anchor not found')
main = main.replace(import_anchor, import_anchor + service_import, 1)

field_anchor = '    dashboardUiService: DashboardUiService;\n'
field_line = '    taskExecutionService: TaskExecutionService;\n'
if field_anchor not in main:
    raise SystemExit('service field anchor not found')
main = main.replace(field_anchor, field_anchor + field_line, 1)

init_anchor = '        this.dashboardUiService = new DashboardUiService(this);\n'
init_line = '        this.taskExecutionService = new TaskExecutionService(this.app);\n'
if init_anchor not in main:
    raise SystemExit('service init anchor not found')
main = main.replace(init_anchor, init_anchor + init_line, 1)

main_path.write_text(main)
print('Extracted task execution service with compatibility wrappers')
