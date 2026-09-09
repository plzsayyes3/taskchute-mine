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
            if ch == '\n': line_comment = False
            i += 1; continue
        if block_comment:
            if ch == '*' and nxt == '/': block_comment = False; i += 2; continue
            i += 1; continue
        if quote:
            if escaped: escaped = False
            elif ch == '\\': escaped = True
            elif ch == quote: quote = None
            i += 1; continue
        if template:
            if escaped: escaped = False
            elif ch == '\\': escaped = True
            elif ch == '`': template = False
            i += 1; continue
        if ch == '/' and nxt == '/': line_comment = True; i += 2; continue
        if ch == '/' and nxt == '*': block_comment = True; i += 2; continue
        if ch in ('\"', "'"): quote = ch; i += 1; continue
        if ch == '`': template = True; i += 1; continue
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return source[:start] + replacement + source[i+1:]
        i += 1
    raise SystemExit(f'unclosed method: {marker}')

anchor = "import { HistorySuggestService } from './services/history-suggest';\n"
if "HistorySuggestController" not in text:
    if anchor not in text: raise SystemExit('history suggest import anchor missing')
    text = text.replace(anchor, anchor + "import { HistorySuggestController } from './services/history-suggest-controller';\n", 1)

field_anchor = "    historySuggestService: HistorySuggestService;\n"
if "historySuggestController: HistorySuggestController;" not in text:
    if field_anchor not in text: raise SystemExit('historySuggestService field missing')
    text = text.replace(field_anchor, field_anchor + "    historySuggestController: HistorySuggestController;\n", 1)

init_anchor = "        this.historySuggestService = new HistorySuggestService();\n"
if "new HistorySuggestController" not in text:
    if init_anchor not in text: raise SystemExit('historySuggestService init missing')
    init = init_anchor + "        this.historySuggestController = new HistorySuggestController({\n            app: this.app,\n            getSettings: () => this.settings,\n            historyService: this.historyService,\n            historySuggestService: this.historySuggestService,\n            findRunningTaskIndex: (editor) => this._findRunningTaskIndex(editor),\n            findLatestExecutedTaskIndex: (editor) => this._findLatestExecutedTaskIndex(editor),\n            debugSuggest: (...args) => this.debugSuggest(...args),\n            debugSuggestAlways: (...args) => this.debugSuggestAlways(...args),\n        });\n"
    text = text.replace(init_anchor, init, 1)

text = replace_method(
    text,
    "    async insertTaskFromHistorySuggest(editor) {",
    "    async insertTaskFromHistorySuggest(editor) {\n        return this.historySuggestController.insertTaskFromHistorySuggest(editor);\n    }",
)

# Modal is now owned only by the controller; remove stale main import if present.
text = text.replace("import { TaskHistorySuggestModal } from './ui/task-history-suggest-modal';\n", "")

path.write_text(text)
