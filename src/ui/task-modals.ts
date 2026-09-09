import * as obsidian from 'obsidian';
import { App, Modal, Notice, Setting, moment } from 'obsidian';

export class TaskTextModal extends Modal {
    onSubmit: (taskText: string) => void;
    taskText: string;

    constructor(app, onSubmit) {
        super(app);
        this.onSubmit = onSubmit;
        this.taskText = "";
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "タスクを追記" });

        const inputEl = contentEl.createEl("input", {
            type: "text",
            placeholder: "タスク名を入力...",
            value: this.taskText,
        });
        inputEl.style.width = "100%";
        inputEl.style.marginBottom = "15px";
        inputEl.style.fontSize = "1.1em";
        inputEl.style.padding = "8px";

        inputEl.focus();

        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = "flex";
        btnContainer.style.justifyContent = "flex-end";
        btnContainer.style.gap = "10px";

        const cancelBtn = btnContainer.createEl("button", { text: "キャンセル" });
        cancelBtn.addEventListener("click", () => this.close());

        const submitBtn = btnContainer.createEl("button", { 
            text: "追加",
            cls: "mod-cta"
        });
        
        const submitAction = () => {
            this.onSubmit(inputEl.value);
            this.close();
        };

        submitBtn.addEventListener("click", submitAction);
        inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                submitAction();
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class DatePickerModal extends Modal {
    initialDate: Date;
    onChoose: (date: Date) => void | Promise<void>;

    constructor(app, initialDate, onChoose) {
        super(app);
        this.initialDate = initialDate || new Date();
        this.onChoose = onChoose;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "日付を選択" });

        const dateStr = moment(this.initialDate).format('YYYY-MM-DD');
        const inputEl = contentEl.createEl("input", {
            type: "date",
            value: dateStr,
        });
        inputEl.style.width = "100%";
        inputEl.style.marginBottom = "15px";
        inputEl.style.padding = "8px";
        inputEl.style.fontSize = "1.1em";

        inputEl.focus();

        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = "flex";
        btnContainer.style.justifyContent = "flex-end";
        btnContainer.style.gap = "10px";

        const cancelBtn = btnContainer.createEl("button", { text: "キャンセル" });
        cancelBtn.addEventListener("click", () => this.close());

        const submitBtn = btnContainer.createEl("button", {
            text: "OK",
            cls: "mod-cta"
        });

        const submitAction = () => {
            const selectedDate = new Date(inputEl.value);
            this.onChoose(selectedDate);
            this.close();
        };

        submitBtn.addEventListener("click", submitAction);
        inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") submitAction();
            if (e.key === "Escape") this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class TimePunchModal extends Modal {
    onSubmit: (timeStr: string) => void;
    timeStr: string = '';

	constructor(app, onSubmit) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "時刻の強制打刻 (HHmm)" });

		new Setting(contentEl)
			.setName("時刻")
			.setDesc("4桁の数字（例: 1230）を入力してください")
			.addText((text) =>
				text
					.setPlaceholder("1230")
					.onChange((value) => {
						this.timeStr = value;
					})
					.inputEl.addEventListener('keydown', (e) => {
						if (e.key === 'Enter') {
                            this.submit();
                        }
					})
			);

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("打刻")
					.setCta()
					.onClick(() => {
						this.submit();
					})
			);
	}

    submit() {
        if (this.timeStr && this.timeStr.length === 4) {
            this.onSubmit(this.timeStr);
            this.close();
        } else {
            new obsidian.Notice("4桁の時刻を入力してください（例: 1230）");
        }
    }

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class TemplateSelectModal extends Modal {
    candidates: any[];
    onSubmit: any;
    submitted: boolean;

    constructor(app, candidates, onSubmit) {
        super(app);
        this.candidates = candidates;
        this.onSubmit = onSubmit;
        this.submitted = false;
    }

    onOpen() {
        try {
            const { contentEl } = this;
            contentEl.empty();
            contentEl.createEl("h3", { text: "テンプレートを選択してください" });

            const selected = new Set<number>();
            const list = contentEl.createDiv({ cls: "tc-template-list" });
            list.style.maxHeight = "300px";
            list.style.overflowY = "auto";
            list.style.border = "1px solid var(--background-modifier-border)";
            list.style.padding = "10px";
            list.style.marginBottom = "10px";

            this.candidates.forEach((candidate, index) => {
                const row = list.createDiv({ cls: "tc-template-item" });
                row.style.display = "flex";
                row.style.alignItems = "center";
                row.style.gap = "8px";
                row.style.cursor = "pointer";
                row.style.padding = "4px 0";

                const checkbox = row.createEl("input", { type: "checkbox" });
                const label = row.createEl("label", { text: candidate.label });
                label.style.cursor = "pointer";

                row.addEventListener("click", (event) => {
                    if (event.target !== checkbox) {
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event("change"));
                    }
                });

                checkbox.addEventListener("change", () => {
                    if (checkbox.checked) {
                        selected.add(index);
                    } else {
                        selected.delete(index);
                    }
                });
            });

            const buttonRow = contentEl.createDiv({ cls: "tc-template-actions" });
            buttonRow.style.display = "flex";
            buttonRow.style.justifyContent = "flex-end";
            buttonRow.style.gap = "8px";

            const insertButton = buttonRow.createEl("button", { text: "決定" });
            insertButton.className = "mod-cta";
            const cancelButton = buttonRow.createEl("button", { text: "キャンセル" });

            insertButton.addEventListener("click", () => {
                this.submitted = true;
                const picked = Array.from(selected)
                    .sort((a, b) => a - b)
                    .map((idx) => this.candidates[idx]);
                this.onSubmit(picked);
                this.close();
            });
            cancelButton.addEventListener("click", () => this.close());
        } catch (err) {
            console.error("TemplateSelectModal.onOpen() error:", err);
            new Notice("テンプレート選択モーダルエラー: " + (err instanceof Error ? err.message : String(err)));
        }
    }

    onClose() {
        if (!this.submitted) {
            this.onSubmit(null);
        }
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class RollRepeatModal extends Modal {
    candidates: string[];
    onSubmit: (selected: string[] | null) => void;
    submitted: boolean = false;

    constructor(app: App, candidates: string[], onSubmit: (selected: string[] | null) => void) {
        super(app);
        this.candidates = candidates;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "今日のtaskchuteに追加するロールを選択してください" });

        const selected = new Set<number>();
        const list = contentEl.createDiv({ cls: "tc-roll-list" });
        list.style.maxHeight = "300px";
        list.style.overflowY = "auto";
        list.style.border = "1px solid var(--background-modifier-border)";
        list.style.padding = "10px";
        list.style.marginBottom = "10px";

        this.candidates.forEach((candidate, index) => {
            const row = list.createDiv({ cls: "tc-roll-item" });
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.gap = "8px";
            row.style.cursor = "pointer";
            row.style.padding = "4px 0";

            const checkbox = row.createEl("input", { type: "checkbox" });
            const label = row.createEl("label", { text: candidate });
            label.style.cursor = "pointer";

            row.addEventListener("click", (event) => {
                if (event.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event("change"));
                }
            });

            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    selected.add(index);
                } else {
                    selected.delete(index);
                }
            });
        });

        const buttonRow = contentEl.createDiv({ cls: "tc-roll-actions" });
        buttonRow.style.display = "flex";
        buttonRow.style.justifyContent = "flex-end";
        buttonRow.style.gap = "8px";

        const insertButton = buttonRow.createEl("button", { text: "決定" });
        insertButton.className = "mod-cta";
        const cancelButton = buttonRow.createEl("button", { text: "キャンセル" });

        insertButton.addEventListener("click", () => {
            this.submitted = true;
            const picked = Array.from(selected)
                .sort((a, b) => a - b)
                .map((idx) => this.candidates[idx]);
            this.onSubmit(picked);
            this.close();
        });
        cancelButton.addEventListener("click", () => this.close());
    }

    onClose() {
        if (!this.submitted) {
            this.onSubmit(null);
        }
        const { contentEl } = this;
        contentEl.empty();
    }
}
