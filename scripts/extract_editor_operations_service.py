from pathlib import Path

main_path = Path('src/main.ts')
main = main_path.read_text()

block1_start_marker = '    recalcLineObj(lineObj) {'
block1_end_marker = '    _normalizeTaskTitle(title) {'
block2_start_marker = '    duplicateActiveTaskToBelowRunning(editor) {'
block2_end_marker = '    async openTodaysNote() {'

b1s = main.find(block1_start_marker)
b1e = main.find(block1_end_marker)
b2s = main.find(block2_start_marker)
b2e = main.find(block2_end_marker)
if min(b1s, b1e, b2s, b2e) < 0:
    raise SystemExit('editor operation extraction anchors not found')
if not (b1s < b1e < b2s < b2e):
    raise SystemExit('editor operation anchors in unexpected order')

block1 = main[b1s:b1e].rstrip()
block2 = main[b2s:b2e].rstrip()

service_path = Path('src/services/editor-operations.ts')
if service_path.exists():
    raise SystemExit('editor operations service already exists')
service_path.write_text(
    "import { Notice, moment } from 'obsidian';\n"
    "import { TaskLine } from '../core/task-line';\n\n"
    "export class EditorOperationsService {\n"
    "    constructor(\n"
    "        private readonly getCursorInfo: (editor: any) => any,\n"
    "        private readonly isRunningTask: (lineObj: TaskLine | null) => boolean,\n"
    "        private readonly isStartableTask: (lineObj: TaskLine | null) => boolean,\n"
    "        private readonly isExecutionRecord: (lineObj: TaskLine | null) => boolean,\n"
    "    ) {}\n\n"
    "    getCursorTaskLineInfo(editor) {\n"
    "        return this.getCursorInfo(editor);\n"
    "    }\n\n"
    "    isRunningLineObj(lineObj) {\n"
    "        return this.isRunningTask(lineObj);\n"
    "    }\n\n"
    "    isStartableLineObj(lineObj) {\n"
    "        return this.isStartableTask(lineObj);\n"
    "    }\n\n"
    "    isTaskExecutionRecord(lineObj) {\n"
    "        return this.isExecutionRecord(lineObj);\n"
    "    }\n\n"
    + block1 + "\n\n"
    + block2 + "\n"
    "}\n"
)

block1_wrappers = '''    recalcLineObj(lineObj) {
        return this.editorOperationsService.recalcLineObj(lineObj);
    }

    recalculateDuration(editor) {
        return this.editorOperationsService.recalculateDuration(editor);
    }

    recalculateAllDuration(editor) {
        return this.editorOperationsService.recalculateAllDuration(editor);
    }

    insertMemoLine(editor) {
        return this.editorOperationsService.insertMemoLine(editor);
    }

    _findRunningTaskIndex(editor) {
        return this.editorOperationsService._findRunningTaskIndex(editor);
    }

    _findLatestExecutedTaskIndex(editor) {
        return this.editorOperationsService._findLatestExecutedTaskIndex(editor);
    }

'''
block2_wrappers = '''    duplicateActiveTaskToBelowRunning(editor) {
        return this.editorOperationsService.duplicateActiveTaskToBelowRunning(editor);
    }

    moveActiveTaskToBelowRunning(editor) {
        return this.editorOperationsService.moveActiveTaskToBelowRunning(editor);
    }

    deleteCurrentLine(editor) {
        return this.editorOperationsService.deleteCurrentLine(editor);
    }

    endAndStartTopTask(editor) {
        return this.editorOperationsService.endAndStartTopTask(editor);
    }

'''

# Replace from right to left so original offsets remain valid.
main = main[:b2s] + block2_wrappers + main[b2e:]
main = main[:b1s] + block1_wrappers + main[b1e:]

import_anchor = "import { TaskPlanningService } from './services/task-planning';\n"
service_import = "import { EditorOperationsService } from './services/editor-operations';\n"
if import_anchor not in main:
    raise SystemExit('editor operations import anchor not found')
main = main.replace(import_anchor, import_anchor + service_import, 1)

field_anchor = '    taskPlanningService: TaskPlanningService;\n'
field_line = '    editorOperationsService: EditorOperationsService;\n'
if field_anchor not in main:
    raise SystemExit('editor operations field anchor not found')
main = main.replace(field_anchor, field_anchor + field_line, 1)

init_anchor = '''        this.taskPlanningService = new TaskPlanningService(
            this.app,
            () => this.settings,
            (lineObj) => this.isCompletedLineObj(lineObj),
            () => this.openTodaysNote(),
        );
'''
init = init_anchor + '''        this.editorOperationsService = new EditorOperationsService(
            (editor) => this.getCursorTaskLineInfo(editor),
            (lineObj) => this.isRunningLineObj(lineObj),
            (lineObj) => this.isStartableLineObj(lineObj),
            (lineObj) => this.isTaskExecutionRecord(lineObj),
        );
'''
if init_anchor not in main:
    raise SystemExit('editor operations init anchor not found')
main = main.replace(init_anchor, init, 1)

main_path.write_text(main)
print('Extracted editor operations service with compatibility wrappers')
