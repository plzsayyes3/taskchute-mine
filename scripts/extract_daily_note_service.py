from pathlib import Path

path = Path('src/main.ts')
text = path.read_text()


def replace_method(source: str, marker: str, replacement: str) -> str:
    start = source.find(marker)
    if start == -1:
        raise SystemExit(f'method marker not found: {marker}')
    brace = source.find('{', start)
    if brace == -1:
        raise SystemExit(f'opening brace not found: {marker}')

    depth = 0
    i = brace
    quote = None
    escaped = False
    line_comment = False
    block_comment = False
    template = False

    while i < len(source):
        ch = source[i]
        nxt = source[i + 1] if i + 1 < len(source) else ''

        if line_comment:
            if ch == '\n':
                line_comment = False
            i += 1
            continue
        if block_comment:
            if ch == '*' and nxt == '/':
                block_comment = False
                i += 2
                continue
            i += 1
            continue
        if quote:
            if escaped:
                escaped = False
            elif ch == '\\':
                escaped = True
            elif ch == quote:
                quote = None
            i += 1
            continue
        if template:
            if escaped:
                escaped = False
            elif ch == '\\':
                escaped = True
            elif ch == '`':
                template = False
            i += 1
            continue

        if ch == '/' and nxt == '/':
            line_comment = True
            i += 2
            continue
        if ch == '/' and nxt == '*':
            block_comment = True
            i += 2
            continue
        if ch in ('\"', "'"):
            quote = ch
            i += 1
            continue
        if ch == '`':
            template = True
            i += 1
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                return source[:start] + replacement + source[end:]
        i += 1

    raise SystemExit(f'unclosed method: {marker}')

import_anchor = "import { TaskChuteLineSettingTab } from './settings-tab';\n"
if "import { DailyNoteService } from './services/daily-note';" not in text:
    if import_anchor not in text:
        raise SystemExit('import anchor not found')
    text = text.replace(import_anchor, import_anchor + "import { DailyNoteService } from './services/daily-note';\n", 1)

field_anchor = "    settings: TaskLinerSettings;\n"
if "dailyNoteService: DailyNoteService;" not in text:
    if field_anchor not in text:
        raise SystemExit('settings field anchor not found')
    text = text.replace(field_anchor, field_anchor + "    dailyNoteService: DailyNoteService;\n", 1)

load_anchor = "        await this.loadSettings();\n        this.addSettingTab(new TaskChuteLineSettingTab(this.app, this));"
if "new DailyNoteService(this.app, () => this.settings)" not in text:
    if load_anchor not in text:
        raise SystemExit('onload anchor not found')
    text = text.replace(
        load_anchor,
        "        await this.loadSettings();\n        this.dailyNoteService = new DailyNoteService(this.app, () => this.settings);\n        this.addSettingTab(new TaskChuteLineSettingTab(this.app, this));",
        1,
    )

replacements = [
    (
        "    async openTodaysNote() {",
        "    async openTodaysNote() {\n        return this.dailyNoteService.openTodaysNote();\n    }",
    ),
    (
        "    async openTodaysDailyNote() {",
        "    async openTodaysDailyNote() {\n        return this.dailyNoteService.openTodaysDailyNote();\n    }",
    ),
    (
        "    async openRelativeDayNote(offsetDays) {",
        "    async openRelativeDayNote(offsetDays) {\n        return this.dailyNoteService.openRelativeDayNote(offsetDays);\n    }",
    ),
    (
        "    async jumpToActiveTask(leaf: obsidian.WorkspaceLeaf) {",
        "    async jumpToActiveTask(leaf: obsidian.WorkspaceLeaf) {\n        return this.dailyNoteService.jumpToActiveTask(leaf);\n    }",
    ),
]

for marker, replacement in replacements:
    text = replace_method(text, marker, replacement)

path.write_text(text)
