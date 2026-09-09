import * as obsidian from 'obsidian';

export class TaskHistorySuggestModal extends obsidian.FuzzySuggestModal {
    constructor(app, entries, onSubmit) {
        super(app);
        this.entries = entries;
        this.onSubmit = onSubmit;
        this.submitted = false;
        this.setPlaceholder("過去のタスク名を検索...");
        this.setInstructions([
            { command: "↑↓", purpose: "選択" },
            { command: "Enter", purpose: "挿入" },
            { command: "Esc", purpose: "キャンセル" }
        ]);
    }

    getItems() {
        const items = (this.entries || []).filter((item) => item && typeof item === "object" && String(item.title || "").trim().length > 0);
        console.warn("[taskchute-line:suggest] modal:getItems", { count: items.length });
        return items;
    }

    _toHistoryItem(item) {
        // FuzzySuggestModal may pass a match object like { item, score, matches }.
        if (item && typeof item === "object" && item.item) {
            return this._toHistoryItem(item.item);
        }
        if (typeof item === "string") {
            return {
                title: item,
                estimate: "",
                count: 0,
                lastUsedAt: ""
            };
        }
        if (item && typeof item === "object") {
            if (item.title || item.estimate || item.lastUsedAt || item.count !== undefined) {
                return item;
            }
            // defensive fallback for unknown object shapes
            const fallbackTitle = String(item.text || item.label || item.name || "").trim();
            if (fallbackTitle) {
                return {
                    title: fallbackTitle,
                    estimate: "",
                    count: 0,
                    lastUsedAt: ""
                };
            }
            return item;
        }
        return {
            title: "",
            estimate: "",
            count: 0,
            lastUsedAt: ""
        };
    }

    getItemText(item) {
        const it = this._toHistoryItem(item);
        const title = it.title || "(no title)";
        return it.estimate ? `${title} （${it.estimate}m）` : title;
    }

    renderSuggestion(item, el) {
        const it = this._toHistoryItem(item);
        if (!it.title) {
            console.warn("[taskchute-line:suggest] modal:render:empty-title", { raw: item });
        }
        const title = el.createDiv({ cls: "tc-history-title" });
        title.setText(this.getItemText(it));
        const meta = el.createEl("small", { cls: "tc-history-meta" });
        meta.setText(`last: ${it.lastUsedAt || '-'} / count: ${it.count || 0}`);
    }

    onChooseItem(item, evt) {
        this.submitted = true;
        const chosen = this._toHistoryItem(item);
        console.warn("[taskchute-line:suggest] modal:onChooseItem", chosen);
        this.onSubmit(chosen);
    }

    onClose() {
        console.warn("[taskchute-line:suggest] modal:onClose", { submitted: this.submitted });
        // In Obsidian, onClose can fire before onChooseItem in some flows.
        // Defer cancel handling to let onChooseItem mark `submitted` first.
        setTimeout(() => {
            if (!this.submitted) {
                this.onSubmit(null);
            }
        }, 0);
    }
}
