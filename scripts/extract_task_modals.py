from pathlib import Path

main_path = Path('src/main.ts')
main = main_path.read_text()

first_start = main.find('class TaskTextModal extends Modal {')
first_end = main.find('class TaskLinerPlugin extends Plugin {')
second_start = main.find('class TimePunchModal extends Modal {')
second_end = main.find('const taskChuteStylePlugin = ViewPlugin.fromClass')

if min(first_start, first_end, second_start, second_end) < 0:
    raise SystemExit('modal extraction anchors not found')
if not (first_start < first_end < second_start < second_end):
    raise SystemExit('modal extraction anchors in unexpected order')

first_block = main[first_start:first_end].rstrip()
second_block = main[second_start:second_end].rstrip()

classes = [
    'TaskTextModal',
    'DatePickerModal',
    'TimePunchModal',
    'TemplateSelectModal',
    'RollRepeatModal',
]
modal_body = first_block + '\n\n' + second_block + '\n'
for name in classes:
    modal_body = modal_body.replace(f'class {name} extends Modal', f'export class {name} extends Modal', 1)

modal_file = Path('src/ui/task-modals.ts')
if modal_file.exists():
    raise SystemExit('src/ui/task-modals.ts already exists')
modal_file.write_text(
    "import * as obsidian from 'obsidian';\n"
    "import { App, Modal, Notice, Setting, moment } from 'obsidian';\n\n"
    + modal_body
)

# Remove the extracted definitions from main, preserving the TaskLiner class and editor extension.
main = main[:first_start] + main[first_end:second_start] + main[second_end:]

import_anchor = "import { TaskChuteScrollView } from './ui/task-chute-scroll-view';\n"
modal_import = "import { TaskTextModal, DatePickerModal, TimePunchModal, TemplateSelectModal, RollRepeatModal } from './ui/task-modals';\n"
if import_anchor not in main:
    raise SystemExit('main import anchor not found')
main = main.replace(import_anchor, import_anchor + modal_import, 1)

main_path.write_text(main)
print('Extracted TaskLiner modals')
