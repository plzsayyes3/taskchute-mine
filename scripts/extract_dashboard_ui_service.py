from pathlib import Path

path = Path('src/main.ts')
text = path.read_text()

METHODS = [
    ('isLogFilePath', '    isLogFilePath(filePath) {', '    isLogFilePath(filePath) {\n        return this.dashboardUiService.isLogFilePath(filePath);\n    }'),
    ('computeDashboardData', '    computeDashboardData(text) {', '    computeDashboardData(text) {\n        return this.dashboardUiService.computeDashboardData(text);\n    }'),
    ('formatMinutes', '    formatMinutes(min) {', '    formatMinutes(min) {\n        return this.dashboardUiService.formatMinutes(min);\n    }'),
    ('getCurrentBlockInfo', '    getCurrentBlockInfo(lines) {', '    getCurrentBlockInfo(lines) {\n        return this.dashboardUiService.getCurrentBlockInfo(lines);\n    }'),
    ('computeDailyNoteStats', '    async computeDailyNoteStats(dateStr) {', '    async computeDailyNoteStats(dateStr) {\n        return this.dashboardUiService.computeDailyNoteStats(dateStr);\n    }'),
    ('fetchWeatherData', '    async fetchWeatherData() {', '    async fetchWeatherData() {\n        return this.dashboardUiService.fetchWeatherData();\n    }'),
    ('weatherCodeToEmoji', '    weatherCodeToEmoji(code) {', '    weatherCodeToEmoji(code) {\n        return this.dashboardUiService.weatherCodeToEmoji(code);\n    }'),
    ('buildDayProgressBar', '    buildDayProgressBar(width) {', '    buildDayProgressBar(width) {\n        return this.dashboardUiService.buildDayProgressBar(width);\n    }'),
    ('buildWeekIndicator', '    buildWeekIndicator() {', '    buildWeekIndicator() {\n        return this.dashboardUiService.buildWeekIndicator();\n    }'),
    ('formatRemainingTime', '    formatRemainingTime(minutes) {', '    formatRemainingTime(minutes) {\n        return this.dashboardUiService.formatRemainingTime(minutes);\n    }'),
    ('updateStatusBar', '    async updateStatusBar() {', '    async updateStatusBar() {\n        return this.dashboardUiService.updateStatusBar();\n    }'),
    ('initTopBar', '    initTopBar() {', '    initTopBar() {\n        return this.dashboardUiService.initTopBar();\n    }'),
    ('updateTopBar', '    async updateTopBar() {', '    async updateTopBar() {\n        return this.dashboardUiService.updateTopBar();\n    }'),
]


def find_method(source: str, marker: str):
    start = source.find(marker)
    if start == -1:
        raise SystemExit(f'method marker not found: {marker}')
    brace = source.find('{', start)
    depth = 0
    quote = None
    escaped = False
    line_comment = False
    block_comment = False
    template = False
    i = brace
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
        if ch in ('"', "'"): quote = ch; i += 1; continue
        if ch == '`': template = True; i += 1; continue
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return start, i + 1, brace
        i += 1
    raise SystemExit(f'unclosed method: {marker}')

# Extract from the untouched source before replacing wrappers.
blocks = []
for name, marker, wrapper in METHODS:
    start, end, brace = find_method(text, marker)
    block = text[start:end]
    relative_brace = brace - start
    service_block = block.replace('this.', 'plugin.')
    service_block = service_block[:relative_brace + 1] + '\n        const plugin = this.host;' + service_block[relative_brace + 1:]
    blocks.append(service_block.strip())

# Replace from bottom to top so offsets cannot shift earlier methods.
locations = []
for name, marker, wrapper in METHODS:
    start, end, brace = find_method(text, marker)
    locations.append((start, end, wrapper))
for start, end, wrapper in sorted(locations, reverse=True):
    text = text[:start] + wrapper + text[end:]

service = """import { moment, Notice, setIcon } from 'obsidian';
import { DEFAULT_SETTINGS } from '../settings';
import { TaskLine } from '../core/task-line';

export class DashboardUiService {
    constructor(private readonly host: any) {}

""" + '\n\n'.join('    ' + b.replace('\n', '\n    ') for b in blocks) + "\n}\n"
Path('src/services/dashboard-ui.ts').write_text(service)

import_anchor = "import { HistorySuggestController } from './services/history-suggest-controller';\n"
service_import = "import { DashboardUiService } from './services/dashboard-ui';\n"
if service_import not in text:
    if import_anchor not in text:
        raise SystemExit('service import anchor not found')
    text = text.replace(import_anchor, import_anchor + service_import, 1)

field_anchor = "    historySuggestController: HistorySuggestController;\n"
field = "    dashboardUiService: DashboardUiService;\n"
if field not in text:
    if field_anchor not in text:
        raise SystemExit('field anchor not found')
    text = text.replace(field_anchor, field_anchor + field, 1)

init_anchor = "        this.historySuggestService = new HistorySuggestService();\n"
init = "        this.dashboardUiService = new DashboardUiService(this);\n"
if init not in text:
    if init_anchor not in text:
        raise SystemExit('init anchor not found')
    text = text.replace(init_anchor, init_anchor + init, 1)

path.write_text(text)
