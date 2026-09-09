from pathlib import Path

path = Path('src/main.ts')
text = path.read_text()


def extract_braced_block(source: str, marker: str):
    start = source.find(marker)
    if start == -1:
        raise SystemExit(f'marker not found: {marker}')
    brace = source.find('{', start)
    if brace == -1:
        raise SystemExit(f'opening brace not found: {marker}')
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
                end = i + 1
                while end < len(source) and source[end] in ' \t': end += 1
                if end < len(source) and source[end] == '\n': end += 1
                return source[start:end], source[:start] + source[end:]
        i += 1
    raise SystemExit(f'unclosed block: {marker}')

# Preserve the original lazy failure behavior for the two historical view names.
old_call = """        registerTaskLinerUiRuntime.call(this, {
            TaskChuteCalendarView,
            TaskChuteScrollView,
            buildDashboardPanelExtension,
        });"""
new_call = """        registerTaskLinerUiRuntime.call(this, {
            createCalendarView: (leaf) => new TaskChuteCalendarView(leaf, this),
            createScrollView: (leaf) => new TaskChuteScrollView(leaf, this),
            buildDashboardPanelExtension,
        });"""
if old_call not in text:
    raise SystemExit('UI runtime call marker not found')
text = text.replace(old_call, new_call, 1)

# Extract the real dashboard panel implementation verbatim.
block, text = extract_braced_block(text, 'function buildDashboardPanelExtension(plugin) ')
Path('src/ui').mkdir(parents=True, exist_ok=True)
Path('src/ui/dashboard-panel.ts').write_text(
    "import { moment } from 'obsidian';\n"
    "import { showPanel } from '@codemirror/view';\n"
    "import { StateField } from '@codemirror/state';\n\n"
    + 'export ' + block
)

anchor = "import { registerTaskLinerUiRuntime } from './lifecycle/register-ui-runtime';\n"
imp = "import { buildDashboardPanelExtension } from './ui/dashboard-panel';\n"
if imp not in text:
    if anchor not in text:
        raise SystemExit('dashboard import anchor not found')
    text = text.replace(anchor, anchor + imp, 1)

path.write_text(text)
