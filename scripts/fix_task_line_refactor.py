from pathlib import Path

main_path = Path('src/main.ts')
text = main_path.read_text(encoding='utf-8')
old_import = "import { TaskLine, normalizeTimeStr } from './core/task-line';"
new_import = "import { TaskLine, normalizeTimeStr, setLineKeepScroll, adjustTaskLineTime } from './core/task-line';"
if old_import not in text and new_import not in text:
    raise SystemExit('Expected TaskLine import not found')
if old_import in text:
    text = text.replace(old_import, new_import, 1)
main_path.write_text(text, encoding='utf-8')

core_path = Path('src/core/task-line.ts')
core = core_path.read_text(encoding='utf-8')
helpers = r'''

export function setLineKeepScroll(editor, idx, text) {
    const view = editor.cm;
    const scrollTop = view ? view.scrollDOM.scrollTop : null;
    editor.setLine(idx, text);
    if (view && scrollTop !== null) view.scrollDOM.scrollTop = scrollTop;
}

export function adjustTaskLineTime(lineText, deltaMinutes) {
    const lineObj = TaskLine.parse(lineText);
    if (!lineObj) return null;
    // Priority: actualEnd → actualStart → planEnd → planStart
    let field = null;
    if (lineObj.actualEnd) field = 'actualEnd';
    else if (lineObj.actualStart) field = 'actualStart';
    else if (lineObj.planEnd) field = 'planEnd';
    else if (lineObj.planStart) field = 'planStart';
    if (!field) return null;
    const normalized = normalizeTimeStr(lineObj[field]);
    if (!normalized || !normalized.includes(':')) return null;
    const [h, m] = normalized.split(':').map(Number);
    const date = new Date(2000, 0, 1, h, m);
    date.setMinutes(date.getMinutes() + deltaMinutes);
    const newH = String(date.getHours()).padStart(2, '0');
    const newM = String(date.getMinutes()).padStart(2, '0');
    lineObj[field] = `${newH}:${newM}`;
    return lineObj.toString();
}
'''
if 'export function setLineKeepScroll' not in core:
    core = core.rstrip() + helpers + '\n'
core_path.write_text(core, encoding='utf-8')

test_path = Path('tests/task-line.test.cjs')
test = test_path.read_text(encoding='utf-8')
test = test.replace("const { TaskLine, normalizeTimeStr } = require('../.test-dist/task-line.cjs');", "const { TaskLine, normalizeTimeStr, adjustTaskLineTime } = require('../.test-dist/task-line.cjs');")
extra = "\nassert.equal(adjustTaskLineTime('- [/] Write report 【09:30-】', 5), '- [/] Write report 【09:35-】');\nassert.equal(adjustTaskLineTime('- [x] Write report 【09:30-10:00 / 30m】', -5), '- [x] Write report 【09:30-09:55 / 30m】');\n"
if '09:35-' not in test:
    test = test.replace("assert.equal(TaskLine.parse('not a task'), null);", "assert.equal(TaskLine.parse('not a task'), null);" + extra)
test_path.write_text(test, encoding='utf-8')
