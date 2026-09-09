from pathlib import Path

main_path = Path('src/main.ts')
main = main_path.read_text()
start_marker = '    async importYesterdayCarryover(editor) {'
end_marker = '    recalcLineObj(lineObj) {'
start = main.find(start_marker)
end = main.find(end_marker)
if start < 0 or end < 0 or end <= start:
    raise SystemExit('task planning extraction anchors not found')
block = main[start:end].rstrip()

service_path = Path('src/services/task-planning.ts')
if service_path.exists():
    raise SystemExit('task planning service already exists')
service_path.write_text(
    "import { App, Notice, TFile, TFolder, moment } from 'obsidian';\n"
    "import { TaskLine } from '../core/task-line';\n"
    "import { DEFAULT_SETTINGS, TaskLinerSettings } from '../settings';\n"
    "import { RollRepeatModal, TemplateSelectModal } from '../ui/task-modals';\n\n"
    "export class TaskPlanningService {\n"
    "    constructor(\n"
    "        private readonly app: App,\n"
    "        private readonly getSettings: () => TaskLinerSettings,\n"
    "        private readonly isCompletedTask: (lineObj: TaskLine | null) => boolean,\n"
    "        private readonly openToday: () => Promise<unknown>,\n"
    "    ) {}\n\n"
    "    private get settings(): TaskLinerSettings {\n"
    "        return this.getSettings();\n"
    "    }\n\n"
    "    isCompletedLineObj(lineObj) {\n"
    "        return this.isCompletedTask(lineObj);\n"
    "    }\n\n"
    "    async openTodaysNote() {\n"
    "        return this.openToday();\n"
    "    }\n\n"
    + block + "\n"
    "}\n"
)

wrappers = '''    async importYesterdayCarryover(editor) {
        return this.taskPlanningService.importYesterdayCarryover(editor);
    }

    async getTemplateFiles() {
        return this.taskPlanningService.getTemplateFiles();
    }

    extractTemplateSectionsAllLevels(content) {
        return this.taskPlanningService.extractTemplateSectionsAllLevels(content);
    }

    async insertTemplatesMultiSelect(editor) {
        return this.taskPlanningService.insertTemplatesMultiSelect(editor);
    }

    async rollRepeat() {
        return this.taskPlanningService.rollRepeat();
    }

    async moveTaskToTomorrow(editor) {
        return this.taskPlanningService.moveTaskToTomorrow(editor);
    }

'''
main = main[:start] + wrappers + main[end:]

import_anchor = "import { TaskExecutionService } from './services/task-execution';\n"
service_import = "import { TaskPlanningService } from './services/task-planning';\n"
if import_anchor not in main:
    raise SystemExit('task planning import anchor not found')
main = main.replace(import_anchor, import_anchor + service_import, 1)

field_anchor = '    taskExecutionService: TaskExecutionService;\n'
field_line = '    taskPlanningService: TaskPlanningService;\n'
if field_anchor not in main:
    raise SystemExit('task planning field anchor not found')
main = main.replace(field_anchor, field_anchor + field_line, 1)

init_anchor = '        this.taskExecutionService = new TaskExecutionService(this.app);\n'
init = (
    init_anchor
    + "        this.taskPlanningService = new TaskPlanningService(\n"
    + "            this.app,\n"
    + "            () => this.settings,\n"
    + "            (lineObj) => this.isCompletedLineObj(lineObj),\n"
    + "            () => this.openTodaysNote(),\n"
    + "        );\n"
)
if init_anchor not in main:
    raise SystemExit('task planning init anchor not found')
main = main.replace(init_anchor, init, 1)

main_path.write_text(main)
print('Extracted task planning/template service with compatibility wrappers')
