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
                return source[:start] + replacement + source[i + 1:]
        i += 1

    raise SystemExit(f'unclosed method: {marker}')

import_anchor = "import { TechoService } from './services/techo';\n"
if "import { HistoryService } from './services/history';" not in text:
    if import_anchor not in text:
        raise SystemExit('TechoService import anchor not found')
    text = text.replace(import_anchor, import_anchor + "import { HistoryService } from './services/history';\n", 1)

field_anchor = "    techoService: TechoService;\n"
if "historyService: HistoryService;" not in text:
    if field_anchor not in text:
        raise SystemExit('techoService field anchor not found')
    text = text.replace(field_anchor, field_anchor + "    historyService: HistoryService;\n", 1)

init_anchor = "        this.techoService = new TechoService(this.app, () => this.settings);\n"
if "new HistoryService(" not in text:
    if init_anchor not in text:
        raise SystemExit('techoService init anchor not found')
    text = text.replace(
        init_anchor,
        init_anchor + "        this.historyService = new HistoryService(this.app, () => this.settings, () => this.saveSettings());\n",
        1,
    )

replacements = [
    (
        "    _normalizeTaskTitle(title) {",
        "    _normalizeTaskTitle(title) {\n        return this.historyService.normalizeTaskTitle(title);\n    }",
    ),
    (
        "    _isInvalidSuggestTitle(title) {",
        "    _isInvalidSuggestTitle(title) {\n        return this.historyService.isInvalidSuggestTitle(title);\n    }",
    ),
    (
        "    _upsertHistoryIndexEntry(index, lineObj, usedAt) {",
        "    _upsertHistoryIndexEntry(index, lineObj, usedAt) {\n        return this.historyService.upsertHistoryIndexEntry(index, lineObj, usedAt);\n    }",
    ),
    (
        "    async rebuildTaskHistoryIndex() {",
        "    async rebuildTaskHistoryIndex() {\n        return this.historyService.rebuildTaskHistoryIndex();\n    }",
    ),
    (
        "    async rebuildTaskSuggestIndexCommand() {",
        "    async rebuildTaskSuggestIndexCommand() {\n        return this.historyService.rebuildTaskSuggestIndexCommand();\n    }",
    ),
    (
        "    _historyEntriesForSuggest() {",
        "    _historyEntriesForSuggest() {\n        return this.historyService.historyEntriesForSuggest();\n    }",
    ),
]

for marker, replacement in replacements:
    text = replace_method(text, marker, replacement)

path.write_text(text)
