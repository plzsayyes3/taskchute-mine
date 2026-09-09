from pathlib import Path

path = Path('src/main.ts')
text = path.read_text()

import_anchor = "import { registerTaskLinerCommands } from './commands/register-commands';\n"
imports = (
    "import { registerCheckboxClickHook } from './lifecycle/register-checkbox-hook';\n"
    "import { registerTaskLinerUiRuntime } from './lifecycle/register-ui-runtime';\n"
)
if "registerCheckboxClickHook" not in text:
    if import_anchor not in text:
        raise SystemExit('command import anchor not found')
    text = text.replace(import_anchor, import_anchor + imports, 1)

checkbox_start = text.find("        // --- Checkbox Click Hook (LLR-style pointer-based long/short press) ---")
checkbox_end_marker = "        registerTaskLinerCommands.call(this);"
checkbox_end = text.find(checkbox_end_marker, checkbox_start)
if checkbox_start == -1 or checkbox_end == -1:
    raise SystemExit(f'checkbox markers not found: {checkbox_start=} {checkbox_end=}')
text = (
    text[:checkbox_start]
    + "        registerCheckboxClickHook.call(this);\n\n"
    + text[checkbox_end:]
)

runtime_start_marker = "\t\t// Calendar View"
runtime_start = text.find(runtime_start_marker)
runtime_end_marker = "\t\tthis.app.workspace.onLayoutReady(() => {\n\t\t\tthis.initTopBar();\n\t\t});"
runtime_end = text.find(runtime_end_marker, runtime_start)
if runtime_start == -1 or runtime_end == -1:
    raise SystemExit(f'runtime markers not found: {runtime_start=} {runtime_end=}')
runtime_end += len(runtime_end_marker)
replacement = (
    "        registerTaskLinerUiRuntime.call(this, {\n"
    "            TaskChuteCalendarView,\n"
    "            TaskChuteScrollView,\n"
    "            buildDashboardPanelExtension,\n"
    "        });"
)
text = text[:runtime_start] + replacement + text[runtime_end:]

path.write_text(text)
