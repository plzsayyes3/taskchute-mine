from pathlib import Path

path = Path('src/main.ts')
text = path.read_text()


def extract_class(source: str, class_name: str):
    marker = f'class {class_name} '
    start = source.find(marker)
    if start == -1:
        raise SystemExit(f'class not found: {class_name}')
    brace = source.find('{', start)
    if brace == -1:
        raise SystemExit(f'opening brace not found: {class_name}')
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
    raise SystemExit(f'unclosed class: {class_name}')

blocks = {}
for name in ('TaskChuteCalendarView', 'TaskChuteScrollView'):
    block, text = extract_class(text, name)
    blocks[name] = block

header = """import * as obsidian from 'obsidian';
import { App, Modal, Notice, Setting, TFile, View, moment, setIcon } from 'obsidian';
import { TaskLine, normalizeTimeStr, setLineKeepScroll, adjustTaskLineTime } from '../core/task-line';

"""
Path('src/ui').mkdir(parents=True, exist_ok=True)
for name, block in blocks.items():
    filename = 'task-chute-calendar-view.ts' if name == 'TaskChuteCalendarView' else 'task-chute-scroll-view.ts'
    Path('src/ui', filename).write_text(header + 'export ' + block)

anchor = "import { registerTaskLinerUiRuntime } from './lifecycle/register-ui-runtime';\n"
imports = (
    "import { TaskChuteCalendarView } from './ui/task-chute-calendar-view';\n"
    "import { TaskChuteScrollView } from './ui/task-chute-scroll-view';\n"
)
if imports.strip() not in text:
    if anchor not in text:
        raise SystemExit('import anchor not found')
    text = text.replace(anchor, anchor + imports, 1)

path.write_text(text)
