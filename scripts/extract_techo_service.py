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

import_anchor = "import { DailyNoteService } from './services/daily-note';\n"
if "import { TechoService } from './services/techo';" not in text:
    if import_anchor not in text:
        raise SystemExit('DailyNoteService import anchor not found')
    text = text.replace(import_anchor, import_anchor + "import { TechoService } from './services/techo';\n", 1)

field_anchor = "    dailyNoteService: DailyNoteService;\n"
if "techoService: TechoService;" not in text:
    if field_anchor not in text:
        raise SystemExit('dailyNoteService field anchor not found')
    text = text.replace(field_anchor, field_anchor + "    techoService: TechoService;\n", 1)

init_anchor = "        this.dailyNoteService = new DailyNoteService(this.app, () => this.settings);\n"
if "new TechoService(this.app, () => this.settings)" not in text:
    if init_anchor not in text:
        raise SystemExit('dailyNoteService init anchor not found')
    text = text.replace(init_anchor, init_anchor + "        this.techoService = new TechoService(this.app, () => this.settings);\n", 1)

replacements = [
    (
        "    getTargetDate() {",
        "    getTargetDate() {\n        return this.techoService.getTargetDate();\n    }",
    ),
    (
        "    normalizeTechoHeader(header) {",
        "    normalizeTechoHeader(header) {\n        return this.techoService.normalizeTechoHeader(header);\n    }",
    ),
    (
        "    extractTechoItemsForDate(content, dateStr) {",
        "    extractTechoItemsForDate(content, dateStr) {\n        return this.techoService.extractTechoItemsForDate(content, dateStr);\n    }",
    ),
    (
        "    applyTechoImportToLog(content, header, items, mode) {",
        "    applyTechoImportToLog(content, header, items, mode) {\n        return this.techoService.applyTechoImportToLog(content, header, items, mode);\n    }",
    ),
    (
        "    async importTechoToday(editor) {",
        "    async importTechoToday(editor) {\n        return this.techoService.importTechoToday(editor);\n    }",
    ),
]

for marker, replacement in replacements:
    text = replace_method(text, marker, replacement)

path.write_text(text)
