import * as obsidian from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, TaskLinerSettings } from './settings';

interface TaskLinerSettingsHost {
    settings: TaskLinerSettings;
    saveSettings(): Promise<void>;
    updateStatusBar(): void | Promise<void>;
    updateTopBar(): void | Promise<void>;
}

class FolderSuggest extends obsidian.AbstractInputSuggest {
    constructor(app, textInputEl) {
        super(app, textInputEl);
        this.app = app;
    }

    getSuggestions(query) {
        const abstractFiles = this.app.vault.getAllLoadedFiles();
        const folders = [];
        const lowerCaseQuery = query.toLowerCase();

        abstractFiles.forEach((file) => {
            if (file instanceof obsidian.TFolder && file.path.toLowerCase().indexOf(lowerCaseQuery) !== -1) {
                folders.push(file);
            }
        });

        return folders;
    }

    renderSuggestion(file, el) {
        el.setText(file.path);
    }

    selectSuggestion(file) {
        this.textInputEl.value = file.path;
        this.textInputEl.trigger("input");
        this.close();
    }
}

class FileSuggest extends obsidian.AbstractInputSuggest {
    constructor(app, textInputEl) {
        super(app, textInputEl);
        this.app = app;
    }

    getSuggestions(query) {
        const abstractFiles = this.app.vault.getAllLoadedFiles();
        const files = [];
        const lowerCaseQuery = query.toLowerCase();

        abstractFiles.forEach((file) => {
            if (file instanceof obsidian.TFile && file.path.toLowerCase().indexOf(lowerCaseQuery) !== -1) {
                files.push(file);
            }
        });

        return files.slice(0, 100);
    }

    renderSuggestion(file, el) {
        el.setText(file.path);
    }

    selectSuggestion(file) {
        this.textInputEl.value = file.path;
        this.textInputEl.trigger("input");
        this.close();
    }
}

class IconSuggest extends obsidian.AbstractInputSuggest {
    constructor(app, textInputEl) {
        super(app, textInputEl);
        this.app = app;
    }

    getSuggestions(query) {
        const icons = obsidian.getIconIds();
        if (!query) return icons.slice(0, 100);
        return icons.filter(icon => icon.toLowerCase().contains(query.toLowerCase())).slice(0, 100);
    }

    renderSuggestion(icon, el) {
        const div = el.createDiv({ cls: "tcl-icon-suggest-item" });
        div.style.display = "flex";
        div.style.alignItems = "center";
        div.style.gap = "8px";
        
        const iconDiv = div.createDiv();
        obsidian.setIcon(iconDiv, icon);
        
        div.createSpan({ text: icon });
    }

    selectSuggestion(icon) {
        this.textInputEl.value = icon;
        this.textInputEl.trigger("input");
        this.close();
    }
}

class CommandSuggest extends obsidian.AbstractInputSuggest {
    constructor(app, textInputEl) {
        super(app, textInputEl);
        this.app = app;
    }

    getSuggestions(query) {
        const commands = this.app.commands.listCommands();
        if (!query) return commands.slice(0, 100);
        const lowerQuery = query.toLowerCase();
        return commands.filter(cmd => 
            cmd.name.toLowerCase().contains(lowerQuery) || 
            cmd.id.toLowerCase().contains(lowerQuery)
        ).slice(0, 100);
    }

    renderSuggestion(cmd, el) {
        const div = el.createDiv();
        div.createEl("b", { text: cmd.name });
        div.createDiv({ 
            text: cmd.id, 
            attr: { style: "font-size: 0.8em; color: var(--text-faint);" } 
        });
    }

    selectSuggestion(cmd) {
        this.textInputEl.value = cmd.id;
        this.textInputEl.trigger("input");
        this.close();
    }
}

export class TaskChuteLineSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'TaskChute Line Settings' });

        new Setting(containerEl)
            .setName('Log folder path')
            .setDesc('デイリーノートを保存するフォルダ (例: taskchute-line)')
            .addText(text => {
                text
                    .setPlaceholder(DEFAULT_SETTINGS.logFolderPath)
                    .setValue(this.plugin.settings.logFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.logFolderPath = value.trim() || DEFAULT_SETTINGS.logFolderPath;
                        await this.plugin.saveSettings();
                    });
                new FolderSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('Template folder path')
            .setDesc('テンプレートが保存されているフォルダ (例: templates)')
            .addText(text => {
                text
                    .setPlaceholder(DEFAULT_SETTINGS.templateFolderPath)
                    .setValue(this.plugin.settings.templateFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.templateFolderPath = value.trim();
                        await this.plugin.saveSettings();
                    });
                new FolderSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('Techo folder path')
            .setDesc('手帳データが保存されているフォルダ (例: techo)')
            .addText(text => {
                text
                    .setPlaceholder(DEFAULT_SETTINGS.techoFolderPath)
                    .setValue(this.plugin.settings.techoFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.techoFolderPath = value.trim();
                        await this.plugin.saveSettings();
                    });
                new FolderSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('Roll file path')
            .setDesc('ロールリマインダーに使用する設定ファイル (例: 11_notes/MT ROLL.md)')
            .addText(text => {
                text
                    .setPlaceholder(DEFAULT_SETTINGS.rollFilePath)
                    .setValue(this.plugin.settings.rollFilePath || DEFAULT_SETTINGS.rollFilePath)
                    .onChange(async (value) => {
                        this.plugin.settings.rollFilePath = value.trim();
                        await this.plugin.saveSettings();
                    });
                new FileSuggest(this.app, text.inputEl);
            });
        new Setting(containerEl)
            .setName('Techo import header')
            .setDesc('手帳からインポートする際のヘッダー名 (例: ## techoからインポート)')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.techoImportHeader)
                .setValue(this.plugin.settings.techoImportHeader || DEFAULT_SETTINGS.techoImportHeader)
                .onChange(async (value) => {
                    this.plugin.settings.techoImportHeader = value.trim() || DEFAULT_SETTINGS.techoImportHeader;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Techo import mode')
            .setDesc('インポート時のマージ方法 (append: 追記, replace: 置換)')
            .addDropdown(dropdown => dropdown
                .addOption('append', 'Append')
                .addOption('replace', 'Replace')
                .setValue(this.plugin.settings.techoImportMode || 'append')
                .onChange(async (value) => {
                    this.plugin.settings.techoImportMode = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Suggest debug logs')
            .setDesc('サジェスト索引の構築・挿入時に詳細ログをDeveloper Consoleへ出力')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.debugSuggestLogs)
                .onChange(async (value) => {
                    this.plugin.settings.debugSuggestLogs = !!value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('モバイルで自動的にスクロールエディタを開く')
            .setDesc('モバイル環境でObsidian起動時にスクロールエディタを自動で開きます')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.mobileAutoOpenScroll)
                .onChange(async (value) => {
                    this.plugin.settings.mobileAutoOpenScroll = !!value;
                    await this.plugin.saveSettings();
                })
            );

        containerEl.createEl('h3', { text: 'Dashboard' });

        new Setting(containerEl)
            .setName('エディタ上部にダッシュボードを表示')
            .setDesc('ログファイルを開いた時、エディタ上部に進捗ダッシュボードを表示します')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableDashboard !== false)
                .onChange(async (value) => {
                    this.plugin.settings.enableDashboard = !!value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('ステータスバーにサマリーを表示')
            .setDesc('画面下部のステータスバーに現在タスクと進捗サマリーを表示します')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableStatusBar !== false)
                .onChange(async (value) => {
                    this.plugin.settings.enableStatusBar = !!value;
                    await this.plugin.saveSettings();
                    this.plugin.updateStatusBar();
                })
            );

        new Setting(containerEl)
            .setName('画面上部にトップバーを表示')
            .setDesc('画面最上部に常時表示される進捗バーを表示します（クリックで今日のノートを開く）')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableTopBar !== false)
                .onChange(async (value) => {
                    this.plugin.settings.enableTopBar = !!value;
                    await this.plugin.saveSettings();
                    this.plugin.updateTopBar();
                })
            );

        new Setting(containerEl)
            .setName('上部バーにナビゲーションボタンを表示')
            .setDesc('画面最上部のバーに「◀ 今日 ▶」のボタンを表示します')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showTopBarNav !== false)
                .onChange(async (value) => {
                    this.plugin.settings.showTopBarNav = !!value;
                    await this.plugin.saveSettings();
                    this.plugin.updateTopBar();
                })
            );

        new Setting(containerEl)
            .setName('デイリーノートのフォルダ')
            .setDesc('デイリーノート（01_Daily等）のフォルダパス')
            .addText(text => {
                text
                    .setPlaceholder(DEFAULT_SETTINGS.dailyNoteFolderPath)
                    .setValue(this.plugin.settings.dailyNoteFolderPath || DEFAULT_SETTINGS.dailyNoteFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.dailyNoteFolderPath = value.trim() || DEFAULT_SETTINGS.dailyNoteFolderPath;
                        await this.plugin.saveSettings();
                    });
                new FolderSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('Self Twitterの見出し')
            .setDesc('デイリーノート内のSelf Twitterセクションの見出し')
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.selfTwitterHeader)
                .setValue(this.plugin.settings.selfTwitterHeader || DEFAULT_SETTINGS.selfTwitterHeader)
                .onChange(async (value) => {
                    this.plugin.settings.selfTwitterHeader = value.trim() || DEFAULT_SETTINGS.selfTwitterHeader;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('モバイル：トップバーの表示位置調整 (px)')
            .setDesc('iPhoneのノッチやダイナミックアイランドを避けるための上部余白（ピクセル単位）')
            .addText(text => text
                .setPlaceholder('0')
                .setValue(String(this.plugin.settings.mobileTopBarOffset || 0))
                .onChange(async (value) => {
                    const num = parseInt(value, 10);
                    this.plugin.settings.mobileTopBarOffset = isNaN(num) ? 0 : num;
                    await this.plugin.saveSettings();
                    this.plugin.updateTopBar();
                })
            );

        new Setting(containerEl)
            .setName('モバイル：カスタムボタン1 (アイコン名)')
            .setDesc('Lucideアイコン名を指定 (例: pencil, search, calendar 等)')
            .addText(text => {
                text
                    .setValue(this.plugin.settings.mobileCustomIcon1 || '')
                    .onChange(async (value) => {
                        this.plugin.settings.mobileCustomIcon1 = value.trim();
                        await this.plugin.saveSettings();
                        this.plugin.updateTopBar();
                    });
                new IconSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('モバイル：カスタムボタン1 (コマンドID)')
            .setDesc('実行するコマンドIDを指定')
            .addText(text => {
                text
                    .setValue(this.plugin.settings.mobileCustomCommand1 || '')
                    .onChange(async (value) => {
                        this.plugin.settings.mobileCustomCommand1 = value.trim();
                        await this.plugin.saveSettings();
                    });
                new CommandSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('モバイル：カスタムボタン2 (アイコン名)')
            .setDesc('Lucideアイコン名を指定')
            .addText(text => {
                text
                    .setValue(this.plugin.settings.mobileCustomIcon2 || '')
                    .onChange(async (value) => {
                        this.plugin.settings.mobileCustomIcon2 = value.trim();
                        await this.plugin.saveSettings();
                        this.plugin.updateTopBar();
                    });
                new IconSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('モバイル：カスタムボタン2 (コマンドID)')
            .setDesc('実行するコマンドIDを指定')
            .addText(text => {
                text
                    .setValue(this.plugin.settings.mobileCustomCommand2 || '')
                    .onChange(async (value) => {
                        this.plugin.settings.mobileCustomCommand2 = value.trim();
                        await this.plugin.saveSettings();
                        new CommandSuggest(this.app, text.inputEl);
                    });
            });

        new Setting(containerEl)
            .setName('チェックボックスタップでのタスク操作を有効化（実験的機能）')
            .setDesc('チェックボックスをタップした際、未開始の場合は「開始」、進行中の場合は「終了」を自動打刻します。（他に進行中のタスクがあれば合わせて終了させます）')
            .addToggle(toggle => toggle
                .setValue(!!this.plugin.settings.enableCheckboxClickHook)
                .onChange(async (value) => {
                    this.plugin.settings.enableCheckboxClickHook = !!value;
                    await this.plugin.saveSettings();
                })
            );
    }
}
