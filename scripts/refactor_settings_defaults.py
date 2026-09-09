from pathlib import Path

path = Path('src/main.ts')
text = path.read_text()

old_import = "import { TaskLine, normalizeTimeStr, setLineKeepScroll, adjustTaskLineTime } from './core/task-line';\n"
new_import = old_import + "import { DEFAULT_SETTINGS, TaskLinerSettings } from './settings';\n"
if "from './settings'" not in text:
    if old_import not in text:
        raise SystemExit('TaskLine import marker not found')
    text = text.replace(old_import, new_import, 1)

start = text.find("const DEFAULT_SETTINGS = {")
if start == -1:
    raise SystemExit('DEFAULT_SETTINGS start marker not found')
end_marker = "\n};\n\nclass TaskTextModal"
end = text.find(end_marker, start)
if end == -1:
    raise SystemExit('DEFAULT_SETTINGS end marker not found')
text = text[:start] + "class TaskTextModal" + text[end + len(end_marker):]

text = text.replace("    settings: any;", "    settings: TaskLinerSettings;", 1)
path.write_text(text)
