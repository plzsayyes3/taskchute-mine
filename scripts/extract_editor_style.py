from pathlib import Path

main_path = Path('src/main.ts')
main = main_path.read_text()
start_marker = 'const taskChuteStylePlugin = ViewPlugin.fromClass(class {'
end_marker = 'const taskChuteStyleExtension = [taskChuteStylePlugin];'
start = main.find(start_marker)
end = main.find(end_marker)
if start < 0 or end < 0 or end < start:
    raise SystemExit('editor style anchors not found')
end += len(end_marker)
block = main[start:end]
block = block.replace(end_marker, 'export const taskChuteStyleExtension = [taskChuteStylePlugin];', 1)

out = Path('src/editor/task-chute-style-extension.ts')
if out.exists():
    raise SystemExit('editor style module already exists')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(
    "import { Decoration, ViewPlugin } from '@codemirror/view';\n"
    "import { RangeSetBuilder } from '@codemirror/state';\n"
    "import { TaskLine } from '../core/task-line';\n\n"
    + block + '\n'
)

main = main[:start] + main[end:]
anchor = "import { TaskChuteScrollView } from './ui/task-chute-scroll-view';\n"
new_import = "import { taskChuteStyleExtension } from './editor/task-chute-style-extension';\n"
if anchor not in main:
    raise SystemExit('main import anchor not found')
main = main.replace(anchor, anchor + new_import, 1)
main_path.write_text(main)
print('Extracted CodeMirror task style extension')
