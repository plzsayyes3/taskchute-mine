from pathlib import Path

path = Path('src/main.ts')
text = path.read_text()

import_line = "import { TaskLine, normalizeTimeStr, setLineKeepScroll, adjustTaskLineTime } from './core/task-line';\nimport { DEFAULT_SETTINGS, TaskLinerSettings } from './settings';\n"
replacement_import = import_line + "import { TaskChuteLineSettingTab } from './settings-tab';\n"
if import_line not in text:
    raise SystemExit('expected import block not found')
text = text.replace(import_line, replacement_import, 1)

start = text.find('class FolderSuggest extends obsidian.AbstractInputSuggest')
if start == -1:
    raise SystemExit('FolderSuggest start not found')
end_marker = '\nconst taskChuteStylePlugin = ViewPlugin.fromClass'
end = text.find(end_marker, start)
if end == -1:
    raise SystemExit('settings UI end marker not found')
block = text[start:end]

history_start = block.find('class TaskHistorySuggestModal extends obsidian.FuzzySuggestModal')
settings_start = block.find('class TaskChuteLineSettingTab extends PluginSettingTab')
if history_start == -1 or settings_start == -1 or history_start > settings_start:
    raise SystemExit('unexpected settings/history class layout')

helpers = block[:history_start]
history = block[history_start:settings_start]
settings_tab = block[settings_start:]

settings_tab_text = """import * as obsidian from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, TaskLinerSettings } from './settings';

interface TaskLinerSettingsHost {
    settings: TaskLinerSettings;
    saveSettings(): Promise<void>;
    updateStatusBar(): void | Promise<void>;
    updateTopBar(): void | Promise<void>;
}

""" + helpers + settings_tab
settings_tab_text = settings_tab_text.replace(
    'class TaskChuteLineSettingTab extends PluginSettingTab',
    'export class TaskChuteLineSettingTab extends PluginSettingTab',
    1,
)

text = text[:start] + history + text[end:]
path.write_text(text)
Path('src/settings-tab.ts').write_text(settings_tab_text)
