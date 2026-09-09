from pathlib import Path

main_path = Path('src/main.ts')
text = main_path.read_text()


def block_span(source: str, marker: str):
    start = source.find(marker)
    if start == -1:
        raise SystemExit(f'marker not found: {marker}')
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
                return start, i + 1
        i += 1

    raise SystemExit(f'unclosed block: {marker}')


def replace_method(source: str, marker: str, replacement: str) -> str:
    start, end = block_span(source, marker)
    return source[:start] + replacement + source[end:]

# Move the modal class verbatim, adding only module import/export syntax.
class_marker = 'class TaskHistorySuggestModal extends obsidian.FuzzySuggestModal'
start, end = block_span(text, class_marker)
class_text = text[start:end]
class_text = class_text.replace(
    'class TaskHistorySuggestModal extends obsidian.FuzzySuggestModal',
    'export class TaskHistorySuggestModal extends obsidian.FuzzySuggestModal',
    1,
)
ui_path = Path('src/ui/task-history-suggest-modal.ts')
ui_path.parent.mkdir(parents=True, exist_ok=True)
ui_path.write_text("import * as obsidian from 'obsidian';\n\n" + class_text + '\n')
text = text[:start] + text[end:]

import_anchor = "import { HistoryService } from './services/history';\n"
new_imports = (
    "import { HistorySuggestService } from './services/history-suggest';\n"
    "import { TaskHistorySuggestModal } from './ui/task-history-suggest-modal';\n"
)
if "import { HistorySuggestService }" not in text:
    if import_anchor not in text:
        raise SystemExit('HistoryService import anchor not found')
    text = text.replace(import_anchor, import_anchor + new_imports, 1)

field_anchor = "    historyService: HistoryService;\n"
if 'historySuggestService: HistorySuggestService;' not in text:
    if field_anchor not in text:
        raise SystemExit('historyService field anchor not found')
    text = text.replace(field_anchor, field_anchor + "    historySuggestService: HistorySuggestService;\n", 1)

init_anchor = "        this.historyService = new HistoryService(this.app, () => this.settings, () => this.saveSettings());\n"
if 'new HistorySuggestService()' not in text:
    if init_anchor not in text:
        raise SystemExit('historyService init anchor not found')
    text = text.replace(init_anchor, init_anchor + "        this.historySuggestService = new HistorySuggestService();\n", 1)

text = replace_method(
    text,
    '    _buildTaskLineFromHistoryEntry(entry, baseLineObj) {',
    '    _buildTaskLineFromHistoryEntry(entry, baseLineObj) {\n        return this.historySuggestService.buildTaskLineFromHistoryEntry(entry, baseLineObj);\n    }',
)
text = replace_method(
    text,
    '    _insertTaskLineBelow(editor, anchorIdx, lineText) {',
    '    _insertTaskLineBelow(editor, anchorIdx, lineText) {\n        return this.historySuggestService.insertTaskLineBelow(editor, anchorIdx, lineText);\n    }',
)

main_path.write_text(text)
