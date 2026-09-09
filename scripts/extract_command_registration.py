from pathlib import Path

main_path = Path('src/main.ts')
text = main_path.read_text()

start_marker = "        this.addCommand({\n            id: 'x-start-from-previous-end',"
end_marker = "\n\t\t// Calendar View"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start == -1 or end == -1:
    raise SystemExit(f'command block markers not found: start={start} end={end}')

block = text[start:end].rstrip() + "\n"
module = "import { Notice } from 'obsidian';\nimport { adjustTaskLineTime } from '../core/task-line';\n\nexport function registerTaskLinerCommands(this: any) {\n" + block + "}\n"
Path('src/commands').mkdir(parents=True, exist_ok=True)
Path('src/commands/register-commands.ts').write_text(module)

# Replace the command block before adding imports so character offsets stay valid.
replacement = "        registerTaskLinerCommands.call(this);\n"
text = text[:start] + replacement + text[end:]

import_anchor = "import { HistorySuggestController } from './services/history-suggest-controller';\n"
if "import { registerTaskLinerCommands } from './commands/register-commands';" not in text:
    if import_anchor not in text:
        raise SystemExit('command registration import anchor missing')
    text = text.replace(import_anchor, import_anchor + "import { registerTaskLinerCommands } from './commands/register-commands';\n", 1)

main_path.write_text(text)
