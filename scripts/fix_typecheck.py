from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# settings-tab.ts: explicitly declare state that previously existed only at runtime.
path = Path('src/settings-tab.ts')
text = path.read_text()
text = replace_once(text,
"class FolderSuggest extends obsidian.AbstractInputSuggest {\n    constructor(app, textInputEl) {\n        super(app, textInputEl);\n        this.app = app;\n    }",
"class FolderSuggest extends obsidian.AbstractInputSuggest<any> {\n    app: any;\n    textInputEl: HTMLInputElement;\n\n    constructor(app, textInputEl) {\n        super(app, textInputEl);\n        this.app = app;\n        this.textInputEl = textInputEl;\n    }",
'FolderSuggest')
text = replace_once(text,
"class FileSuggest extends obsidian.AbstractInputSuggest {\n    constructor(app, textInputEl) {\n        super(app, textInputEl);\n        this.app = app;\n    }",
"class FileSuggest extends obsidian.AbstractInputSuggest<any> {\n    app: any;\n    textInputEl: HTMLInputElement;\n\n    constructor(app, textInputEl) {\n        super(app, textInputEl);\n        this.app = app;\n        this.textInputEl = textInputEl;\n    }",
'FileSuggest')
text = replace_once(text,
"class IconSuggest extends obsidian.AbstractInputSuggest {\n    constructor(app, textInputEl) {\n        super(app, textInputEl);\n        this.app = app;\n    }",
"class IconSuggest extends obsidian.AbstractInputSuggest<any> {\n    app: any;\n    textInputEl: HTMLInputElement;\n\n    constructor(app, textInputEl) {\n        super(app, textInputEl);\n        this.app = app;\n        this.textInputEl = textInputEl;\n    }",
'IconSuggest')
text = replace_once(text,
"class CommandSuggest extends obsidian.AbstractInputSuggest {\n    constructor(app, textInputEl) {\n        super(app, textInputEl);\n        this.app = app;\n    }",
"class CommandSuggest extends obsidian.AbstractInputSuggest<any> {\n    app: any;\n    textInputEl: HTMLInputElement;\n\n    constructor(app, textInputEl) {\n        super(app, textInputEl);\n        this.app = app;\n        this.textInputEl = textInputEl;\n    }",
'CommandSuggest')
text = replace_once(text,
"export class TaskChuteLineSettingTab extends PluginSettingTab {\n    constructor(app, plugin) {\n        super(app, plugin);\n        this.plugin = plugin;\n    }",
"export class TaskChuteLineSettingTab extends PluginSettingTab {\n    plugin: TaskLinerSettingsHost & obsidian.Plugin;\n\n    constructor(app, plugin) {\n        super(app, plugin);\n        this.plugin = plugin;\n    }",
'TaskChuteLineSettingTab')
path.write_text(text)

# history modal: supply the generic and declare runtime fields.
path = Path('src/ui/task-history-suggest-modal.ts')
text = path.read_text()
text = replace_once(text,
"export class TaskHistorySuggestModal extends obsidian.FuzzySuggestModal {\n    constructor(app, entries, onSubmit) {",
"export class TaskHistorySuggestModal extends obsidian.FuzzySuggestModal<any> {\n    entries: any[];\n    onSubmit: (item: any) => void;\n    submitted: boolean;\n\n    constructor(app, entries, onSubmit) {",
'TaskHistorySuggestModal')
path.write_text(text)

# main.ts: declare implicit modal/editor fields, narrow abstract files, and type Promise output.
path = Path('src/main.ts')
text = path.read_text()
text = replace_once(text,
"class TaskTextModal extends Modal {\n    constructor(app, onSubmit) {",
"class TaskTextModal extends Modal {\n    onSubmit: (taskText: string) => void;\n    taskText: string;\n\n    constructor(app, onSubmit) {",
'TaskTextModal')
text = replace_once(text,
"class DatePickerModal extends Modal {\n    constructor(app, initialDate, onChoose) {",
"class DatePickerModal extends Modal {\n    initialDate: Date;\n    onChoose: (date: Date) => void | Promise<void>;\n\n    constructor(app, initialDate, onChoose) {",
'DatePickerModal')
text = replace_once(text,
"                // Add task to Daily Note\n                content += `- [ ] ${taskName}\\n`;\n                await this.app.vault.modify(dailyFile, content);",
"                // Add task to Daily Note\n                content += `- [ ] ${taskName}\\n`;\n                if (!(dailyFile instanceof TFile)) return;\n                await this.app.vault.modify(dailyFile, content);",
'dailyFile narrow')
text = replace_once(text,
"        const yesterdayFile = this.app.vault.getAbstractFileByPath(yesterdayFilePath);\n        if (!yesterdayFile) {",
"        const yesterdayFile = this.app.vault.getAbstractFileByPath(yesterdayFilePath);\n        if (!(yesterdayFile instanceof TFile)) {",
'yesterdayFile narrow')
text = replace_once(text,
"        const selected = await new Promise((resolve) => {\n            const modal = new TemplateSelectModal(this.app, candidates, resolve);",
"        const selected = await new Promise<any[] | null>((resolve) => {\n            const modal = new TemplateSelectModal(this.app, candidates, resolve);",
'template selected Promise')
text = replace_once(text,
"class TimePunchModal extends Modal {\n\tconstructor(app, onSubmit) {",
"class TimePunchModal extends Modal {\n    onSubmit: (timeStr: string) => void;\n    timeStr: string = '';\n\n\tconstructor(app, onSubmit) {",
'TimePunchModal')
text = replace_once(text,
"const taskChuteStylePlugin = ViewPlugin.fromClass(class {\n    constructor(view) {",
"const taskChuteStylePlugin = ViewPlugin.fromClass(class {\n    decorations: any;\n\n    constructor(view) {",
'decorations field')
path.write_text(text)

print('Applied typecheck compatibility declarations')
