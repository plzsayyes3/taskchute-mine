import {
  App,
  ItemView,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  WorkspaceLeaf,
} from "obsidian";
import { Decoration, WidgetType, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder, StateEffect } from "@codemirror/state";

const CHUTE_VIEW_TYPE = "taskchute-chute-mode";
const CHUTE_MINE_VIEW_TYPE = "taskchute-mine-chute";

type TaskChuteSettings = {
  logFolderPath: string;
  templateFolderPath: string;
  enableTemplates: boolean;
  enableFocusMode: boolean;
  enableFilterMode: boolean;
  enableDim: boolean;
};

type ParsedChild = {
  lineNo: number;
  raw: string;
  type: "doing" | "done" | "memo" | "other";
  start?: string;
  end?: string;
  durationMin?: number;
};

type ParsedParent = {
  lineNo: number;
  raw: string;
  title: string;
  children: ParsedChild[];
  status: "idle" | "running" | "done";
};

type ParsedLog = {
  parents: ParsedParent[];
};

type UnfinishedHourglass = {
  hourglassLineNo: number;
  hourglassLineText: string;
  parentLineNo: number;
  parentText: string;
  startTime: string;
};

type RepairEndMode = "input" | "estimate";

const DEFAULT_SETTINGS: TaskChuteSettings = {
  logFolderPath: "taskchute",
  templateFolderPath: "",
  enableTemplates: false,
  enableFocusMode: false,
  enableFilterMode: false,
  enableDim: true,
};

export default class TaskChuteMinePlugin extends Plugin {
  settings: TaskChuteSettings;
  collapsedByKey: Map<string, boolean> = new Map();
  private filterExtension = buildFilterModeExtension(this);

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new TaskChuteSettingTab(this.app, this));
    this.registerView(CHUTE_MINE_VIEW_TYPE, (leaf) => new TaskChuteChuteView(leaf, this));
    this.registerEditorExtension(this.filterExtension);
    this.registerCommands();
    if (this.settings.enableFilterMode) {
      this.initializeCollapsedState();
      this.refreshFilterDecorations();
    }
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        if (this.settings.enableFilterMode) {
          this.refreshFilterDecorations();
        }
      })
    );
    new Notice("TaskChute Mine loaded");
  }

  onunload() {
    this.app.workspace.getLeavesOfType(CHUTE_MINE_VIEW_TYPE).forEach((leaf) => leaf.detach());
    try {
      this.app.workspace.unregisterView(CHUTE_MINE_VIEW_TYPE);
    } catch (error) {
      console.log("[TaskChute] unregister view failed", error);
    }
    console.log("TaskChute Mine unloaded");
  }

  async loadSettings() {
    const data = await this.loadData();
    const merged = Object.assign({}, DEFAULT_SETTINGS, data || {});
    if (merged.enableDim === undefined && (data as { dimMode?: boolean })?.dimMode !== undefined) {
      merged.enableDim = (data as { dimMode?: boolean }).dimMode ?? DEFAULT_SETTINGS.enableDim;
    }
    this.settings = merged;

    const logPath = this.settings.logFolderPath?.trim?.() || "";
    this.settings.logFolderPath = logPath || DEFAULT_SETTINGS.logFolderPath;
    this.settings.templateFolderPath = this.settings.templateFolderPath ?? DEFAULT_SETTINGS.templateFolderPath;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  registerCommands() {
    this.addCommand({
      id: "taskchute-open-today",
      name: "TaskChute: Open Today",
      callback: () => this.openToday(),
    });

    this.addCommand({
      id: "taskchute-open-prev-day",
      name: "TaskChute: Open Previous Day",
      callback: () => this.openPrevDay(),
    });

    this.addCommand({
      id: "taskchute-open-next-day",
      name: "TaskChute: Open Next Day",
      callback: () => this.openNextDay(),
    });

    this.addCommand({
      id: "taskchute-start",
      name: "TaskChute: Start",
      callback: () => this.start(),
    });

    this.addCommand({
      id: "taskchute-end",
      name: "TaskChute: End",
      callback: () => this.end(),
    });

    this.addCommand({
      id: "taskchute-end-and-start",
      name: "TaskChute: End and Start",
      callback: () => this.endAndStart(),
    });

    this.addCommand({
      id: "taskchute-resume",
      name: "TaskChute: Resume",
      callback: () => this.resume(),
    });

    this.addCommand({
      id: "taskchute-start-from-latest-done-time",
      name: "TaskChute: Start From Latest Done Time",
      callback: () => this.startFromLatestDoneTime(),
    });

    this.addCommand({
      id: "taskchute-time-punch",
      name: "TaskChute: Time Punch (HHmm)",
      icon: "clock",
      callback: () => this.timePunch(),
    });

    this.addCommand({
      id: "taskchute-recalc",
      name: "TaskChute: Recalculate Duration (+Xm)",
      callback: () => this.recalculateDuration(),
    });

    this.addCommand({
      id: "taskchute-insert-memo",
      name: "TaskChute: Insert Memo Line",
      callback: () => this.insertMemoLine(),
    });

    this.addCommand({
      id: "taskchute-repair-multiple-now",
      name: "TaskChute: Repair Multiple Now",
      callback: () => this.repairMultipleNowCommand(),
    });

    this.addCommand({
      id: "taskchute-toggle-focus-mode",
      name: "TaskChute: Toggle Focus Mode",
      callback: () => this.toggleFocusMode(),
    });

    this.addCommand({
      id: "taskchute-toggle-filter-mode",
      name: "TaskChute: Toggle Filter Mode",
      callback: () => this.toggleFilterMode(),
    });

    this.addCommand({
      id: "taskchute-debug-filter-log",
      name: "TaskChute: Debug Filter Log",
      callback: () => this.debugFilterLog(),
    });

    this.addCommand({
      id: "taskchute-toggle-player-mode",
      name: "TaskChute: Toggle Player Mode",
      callback: () => this.togglePlayerMode(),
    });

    this.addCommand({
      id: "taskchute-toggle-cockpit-sidebar",
      name: "TaskChute: Toggle Cockpit Sidebar",
      callback: () => this.toggleCockpitSidebar(),
    });

    this.addCommand({
      id: "taskchute-toggle-horizon-header",
      name: "TaskChute: Toggle Horizon Header",
      callback: () => this.toggleHorizonHeader(),
    });

    this.addCommand({
      id: "taskchute-open-chute-mode",
      name: "TaskChute: Open Chute Mode",
      callback: () => this.openChuteView(),
    });

    this.addCommand({
      id: "taskchute-open-chute-view",
      name: "TaskChute: Open Chute View",
      callback: () => this.openChuteView(),
    });
  }

  private todo(label: string) {
    new Notice(`TODO: ${label}`);
  }

  async openToday() {
    await this.openLogForDate(new Date());
  }

  async openPrevDay() {
    const base = this.getActiveLogDate() ?? new Date();
    const prev = addDays(base, -1);
    await this.openLogForDate(prev);
  }

  async openNextDay() {
    const base = this.getActiveLogDate() ?? new Date();
    const next = addDays(base, 1);
    await this.openLogForDate(next);
  }

  async start() {
    const ctx = await this.getActiveLogContext();
    if (!ctx) return;

    if (!(await this.guardMultipleNow(ctx, ctx.view))) {
      new Notice("修復してください");
      return;
    }

    await this.startAtContext(ctx, nowTimeString());
  }

  async end() {
    const ctx = await this.getActiveLogContext();
    if (!ctx) return;

    if (!(await this.guardMultipleNow(ctx, ctx.view))) return;

    const { file, lines, parsed } = ctx;
    console.log("[TaskChute] End: file", file.path);
    console.log("[TaskChute] End: raw lines around", lines.slice(0, 40));
    console.log("[TaskChute] End: parsed parents", parsed.parents.map((p) => ({
      lineNo: p.lineNo,
      title: p.title,
      status: p.status,
      children: p.children.map((c) => ({ lineNo: c.lineNo, raw: c.raw, type: c.type, start: c.start, end: c.end })),
    })));
    let running = findRunningChildren(parsed);
    if (running.length === 0) {
      const fallbackMatches = findAllUnfinishedHourglass(lines);
      console.log("[TaskChute] End: fallback matches", fallbackMatches);
      const fallback = fallbackMatches.map((entry) => ({
        lineNo: entry.hourglassLineNo,
        raw: entry.hourglassLineText,
        type: "doing" as const,
        start: entry.startTime,
        end: undefined,
      }));
      running = fallback;
    }
    console.log("[TaskChute] End: running", running);

    if (running.length === 0) {
      new Notice("No running task");
      return;
    }

    if (running.length > 1) {
      new Notice("Multiple running tasks");
      return;
    }

    const target = running[0];
    if (!target.start) {
      new Notice("Running task has no start time");
      return;
    }

    const endTime = nowTimeString();
    const durationMin = diffMinutes(target.start, endTime);
    const replaced = buildDoneLine(target.start, endTime, durationMin);

    const nextLines = lines.slice();
    nextLines[target.lineNo] = replaced;
    await this.app.vault.modify(file, nextLines.join("\n"));
  }

  async endAndStart() {
    const ctx = await this.getActiveLogContext();
    if (!ctx) return;

    if (!(await this.guardMultipleNow(ctx, ctx.view))) return;

    const { file, lines, parsed } = ctx;
    let running = findRunningChildren(parsed);
    if (running.length === 0) {
      const fallbackMatches = findAllUnfinishedHourglass(lines);
      const fallback = fallbackMatches.map((entry) => ({
        lineNo: entry.hourglassLineNo,
        raw: entry.hourglassLineText,
        type: "doing" as const,
        start: entry.startTime,
        end: undefined,
      }));
      running = fallback;
    }

    if (running.length === 0) {
      new Notice("No running task");
      return;
    }

    if (running.length > 1) {
      new Notice("Multiple running tasks");
      return;
    }

    const target = running[0];
    if (!target.start) {
      new Notice("Running task has no start time");
      return;
    }

    const endTime = nowTimeString();
    const durationMin = diffMinutes(target.start, endTime);
    const replaced = buildDoneLine(target.start, endTime, durationMin);

    const endedLines = lines.slice();
    endedLines[target.lineNo] = replaced;

    const nextParsed = parseLog(endedLines);
    const currentParentIndex = nextParsed.parents.findIndex((parent) =>
      parent.children.some((child) => child.lineNo === target.lineNo)
    );

    let nextLines = endedLines;
    if (currentParentIndex >= 0) {
      const nextParent = nextParsed.parents.slice(currentParentIndex + 1).find((parent) => parent.status !== "done");
      if (nextParent) {
        nextLines = insertDoingLine(endedLines, nextParent, nowTimeString());
      }
    }

    await this.app.vault.modify(file, nextLines.join("\n"));
  }

  resume() {
    this.todo("Resume");
  }

  async startFromLatestDoneTime() {
    const ctx = await this.getActiveOrTodayLogContext();
    if (!ctx) return;

    const latestTime = findLatestDoneTime(ctx.lines);
    if (!latestTime) {
      new Notice("✔️が見つからないよ");
      return;
    }

    if (!isValidTime(latestTime)) {
      new Notice("時刻を読めなかったよ");
      return;
    }

    await this.startAtContext(ctx, latestTime, "開始できるタスクが見つからないよ");
  }

  async timePunch() {
    const ctx = await this.getActiveOrTodayLogContext();
    if (!ctx) return;
    const view = ctx.view ?? this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.editor) {
      new Notice("Editor not available");
      return;
    }

    if (!(await this.guardMultipleNow(ctx, view))) return;

    const modal = new TimePunchModal(this.app, async (timeStr) => {
      const cursorLine = view.editor.getCursor().line;
      const targetParent = selectTargetParent(ctx.parsed, cursorLine);
      if (!targetParent) {
        new Notice("対象の親タスクが見つからないよ");
        return;
      }

      const unfinished = findLatestUnfinishedHourglassChild(targetParent);
      if (unfinished) {
        if (!unfinished.start) {
          new Notice("⌛の開始時刻が取れなかったよ");
          return;
        }
        const durationMin = diffMinutesWithWrap(unfinished.start, timeStr);
        const replaced = buildDoneLine(unfinished.start, timeStr, durationMin);
        const nextLines = ctx.lines.slice();
        nextLines[unfinished.lineNo] = replaced;
        await this.app.vault.modify(ctx.file, nextLines.join("\n"));
        view.editor.setCursor({ line: unfinished.lineNo, ch: replaced.length });
        return;
      }

      const choiceModal = new TimePunchChoiceModal(this.app, timeStr, async (startTime) => {
        const refreshed = await this.refreshContext(ctx.file);
        if (!refreshed) return;
        const parent = selectTargetParent(refreshed.parsed, view.editor.getCursor().line);
        if (!parent) {
          new Notice("対象の親タスクが見つからないよ");
          return;
        }
        const nextLines = insertDoingLine(refreshed.lines, parent, startTime);
        await this.app.vault.modify(refreshed.file, nextLines.join("\n"));
        const insertedLine = parent.children.length
          ? parent.children[parent.children.length - 1].lineNo + 1
          : parent.lineNo + 1;
        view.editor.setCursor({ line: insertedLine, ch: nextLines[insertedLine].length });
      });
      choiceModal.open();
    });
    modal.open();
  }

  async recalculateDuration() {
    const ctx = this.getActiveLogEditorContext();
    if (!ctx) return;
    const { editor } = ctx;
    const cursorLine = editor.getCursor().line;
    const lineText = editor.getLine(cursorLine);

    let updated = 0;
    if (isDoneLine(lineText)) {
      const next = recalcDoneLine(lineText);
      if (next && next !== lineText) {
        editor.replaceRange(next, { line: cursorLine, ch: 0 }, { line: cursorLine, ch: lineText.length });
        updated += 1;
      }
    } else if (isParentLine(lineText)) {
      const range = getParentBlockRange(editor, cursorLine);
      for (let line = range.end; line >= range.start + 1; line -= 1) {
        const text = editor.getLine(line);
        if (!isDoneLine(text)) continue;
        const next = recalcDoneLine(text);
        if (next && next !== text) {
          editor.replaceRange(next, { line, ch: 0 }, { line, ch: text.length });
          updated += 1;
        }
      }
    } else if (isChildLine(lineText)) {
      const parentLine = getParentLineIndex(editor, cursorLine);
      if (parentLine == null) {
        new Notice("Open taskchute log");
        return;
      }
      const range = getParentBlockRange(editor, parentLine);
      for (let line = range.end; line >= range.start + 1; line -= 1) {
        const text = editor.getLine(line);
        if (!isDoneLine(text)) continue;
        const next = recalcDoneLine(text);
        if (next && next !== text) {
          editor.replaceRange(next, { line, ch: 0 }, { line, ch: text.length });
          updated += 1;
        }
      }
    }

    new Notice(`Recalculated ${updated} logs`);
  }

  async insertMemoLine() {
    const ctx = this.getActiveLogEditorContext();
    if (!ctx) return;
    const { editor } = ctx;
    const cursorLine = editor.getCursor().line;
    let parentLine: number | null = null;

    if (isParentLine(editor.getLine(cursorLine))) {
      parentLine = cursorLine;
    } else {
      parentLine = getParentLineIndex(editor, cursorLine);
    }

    if (parentLine == null) {
      new Notice("Open taskchute log");
      return;
    }

    const range = getParentBlockRange(editor, parentLine);
    const insertAt = range.end + 1;
    const memoLine = "  - 📝 ";
    editor.replaceRange(`${memoLine}\n`, { line: insertAt, ch: 0 });
    editor.setCursor({ line: insertAt, ch: memoLine.length });
    new Notice("Memo inserted");
  }

  toggleFocusMode() {
    this.settings.enableFocusMode = !this.settings.enableFocusMode;
    void this.saveSettings();
    this.todo("Toggle Focus Mode");
  }

  toggleFilterMode() {
    this.settings.enableFilterMode = !this.settings.enableFilterMode;
    void this.saveSettings();
    if (this.settings.enableFilterMode) {
      this.initializeCollapsedState();
    }
    this.refreshFilterDecorations();
  }

  togglePlayerMode() {
    this.todo("Toggle Player Mode");
  }

  toggleCockpitSidebar() {
    this.todo("Toggle Cockpit Sidebar");
  }

  toggleHorizonHeader() {
    this.todo("Toggle Horizon Header");
  }

  openChuteMode() {
    this.openChuteView();
  }

  async openChuteView() {
    const existing = this.app.workspace.getLeavesOfType(CHUTE_MINE_VIEW_TYPE);
    const leaf = existing.length ? existing[0] : this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: CHUTE_MINE_VIEW_TYPE, active: true });
    this.app.workspace.setActiveLeaf(leaf, true, true);
  }

  private async getActiveLogContext() {
    const file = this.app.workspace.getActiveFile();
    if (!file || !this.isTaskchuteLogPath(file.path)) {
      new Notice("Active file is not a TaskChute log");
      return null;
    }

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const parsed = parseLog(lines);
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);

    return { file, lines, parsed, view };
  }

  private getActiveLogEditorContext() {
    const file = this.app.workspace.getActiveFile();
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!file || !view?.editor || !this.isTaskchuteLogPath(file.path)) {
      new Notice("Open taskchute log");
      return null;
    }
    return { file, editor: view.editor, view };
  }

  private initializeCollapsedState() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const doc = view?.editor?.getValue();
    if (!doc) return;
    const { parents } = collectParentRanges(doc);
    parents.forEach((parent) => {
      if (parent.status === "done") {
        const key = buildParentKey(file.path, parent.lineNo, parent.tcId);
        if (!this.collapsedByKey.has(key)) {
          this.collapsedByKey.set(key, true);
        }
      }
    });
  }

  refreshFilterDecorations() {
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        const editorView = getEditorViewFromMarkdownView(view);
        if (editorView) {
          editorView.dispatch({ effects: filterRefreshEffect.of(null) });
        }
      }
    });
  }

  private debugFilterLog() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const doc = view?.editor?.getValue();
    if (!doc) {
      console.log("[TaskChute] Debug Filter: no doc");
      return;
    }
    const result = collectParentRanges(doc);
    console.log("[TaskChute] Debug Filter: parents", result.parents.map((p) => ({
      lineNo: p.lineNo,
      text: p.text,
      status: p.status,
      children: p.children.map((c) => c.lineIndex),
    })));
    console.log("[TaskChute] Debug Filter: doneSections", result.doneSections);
  }

  private async getActiveOrTodayLogContext() {
    const file = this.app.workspace.getActiveFile();
    if (file && this.isTaskchuteLogPath(file.path)) {
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      const parsed = parseLog(lines);
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      return { file, lines, parsed, view };
    }

    const todayFile = await this.ensureLogFileForDate(new Date(), true);
    if (!todayFile) return null;
    const content = await this.app.vault.read(todayFile);
    const lines = content.split("\n");
    const parsed = parseLog(lines);
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return { file: todayFile, lines, parsed, view };
  }

  async getTodayLogFile() {
    return this.ensureLogFileForDate(new Date(), false);
  }

  async readLogText(file: TFile) {
    return this.app.vault.read(file);
  }

  async writeLogText(file: TFile, text: string) {
    await this.app.vault.modify(file, text);
  }

  async applyPatch(file: TFile, patchFn: (text: string) => string) {
    const text = await this.readLogText(file);
    const next = patchFn(text);
    if (next !== text) {
      await this.writeLogText(file, next);
    }
  }

  private async refreshContext(file: TFile) {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const parsed = parseLog(lines);
    return { file, lines, parsed };
  }

  private async repairMultipleNowCommand() {
    const ctx = await this.getActiveOrTodayLogContext();
    if (!ctx) return;
    const view = ctx.view ?? this.app.workspace.getActiveViewOfType(MarkdownView);
    await this.repairMultipleNowFlow(ctx.file, view);
  }

  private async guardMultipleNow(
    ctx: { file: TFile; lines: string[]; parsed: ParsedLog; view?: MarkdownView | null },
    view?: MarkdownView | null
  ) {
    const unfinished = findAllUnfinishedHourglass(ctx.lines);
    if (unfinished.length >= 2) {
      await this.repairMultipleNowFlow(ctx.file, view ?? ctx.view ?? null);
      return false;
    }
    return true;
  }

  private async repairMultipleNowFlow(file: TFile, view: MarkdownView | null) {
    while (true) {
      const refreshed = await this.refreshContext(file);
      if (!refreshed) return;
      const unfinished = findAllUnfinishedHourglass(refreshed.lines);
      if (unfinished.length < 2) return;

      const confirmed = await this.showRepairConfirm();
      if (!confirmed) return;

      const target = await this.showRepairPick(unfinished);
      if (!target) return;

      const endMode = await this.showRepairEndMode();
      if (!endMode) return;

      let endTime: string | null = null;
      let durationMin: number | null = null;

      if (endMode === "estimate") {
        const estimate = parseEstimateMinutes(target.parentText);
        if (!estimate) {
          new Notice("見積が無いよ。HHmm入力で終了してね");
        } else {
          endTime = shiftTime(target.startTime, estimate);
          durationMin = estimate;
        }
      }

      if (!endTime) {
        const inputTime = await this.showHHmmInput();
        if (!inputTime) return;
        endTime = inputTime;
        durationMin = diffMinutesWithWrap(target.startTime, endTime);
      }

      const freshAgain = await this.refreshContext(file);
      if (!freshAgain) return;
      if (!freshAgain.lines[target.hourglassLineNo]?.includes("⌛")) {
        new Notice("対象が見つからないよ。もう一度やってね");
        return;
      }

      const doneLine = buildDoneLine(target.startTime, endTime, durationMin ?? 0);
      const nextLines = freshAgain.lines.slice();
      nextLines[target.hourglassLineNo] = doneLine;
      await this.app.vault.modify(freshAgain.file, nextLines.join("\n"));

      if (view?.editor) {
        view.editor.setCursor({ line: target.hourglassLineNo, ch: doneLine.length });
      }

      const after = findAllUnfinishedHourglass(nextLines);
      if (after.length >= 2) {
        const again = await this.showRepairContinue();
        if (again) continue;
      }
      return;
    }
  }

  private showRepairConfirm() {
    return new Promise<boolean>((resolve) => {
      const modal = new RepairConfirmModal(this.app, resolve);
      modal.open();
    });
  }

  private showRepairContinue() {
    return new Promise<boolean>((resolve) => {
      const modal = new RepairContinueModal(this.app, resolve);
      modal.open();
    });
  }

  private showRepairPick(entries: UnfinishedHourglass[]) {
    return new Promise<UnfinishedHourglass | null>((resolve) => {
      const modal = new RepairPickNowModal(this.app, entries, resolve);
      modal.open();
    });
  }

  private showRepairEndMode() {
    return new Promise<RepairEndMode | null>((resolve) => {
      const modal = new RepairEndModeModal(this.app, resolve);
      modal.open();
    });
  }

  private showHHmmInput() {
    return new Promise<string | null>((resolve) => {
      const modal = new HHmmInputModal(this.app, resolve);
      modal.open();
    });
  }

  private async startAtContext(
    ctx: { file: TFile; lines: string[]; parsed: ParsedLog; view?: MarkdownView | null },
    timeStr: string,
    noParentMessage = "No target parent task"
  ) {
    const view = ctx.view ?? this.app.workspace.getActiveViewOfType(MarkdownView);
    const cursorLine = view?.editor?.getCursor?.().line ?? null;
    const targetParent = selectTargetParent(ctx.parsed, cursorLine);

    if (!targetParent) {
      new Notice(noParentMessage);
      return;
    }

    const nextLines = insertDoingLine(ctx.lines, targetParent, timeStr);
    await this.app.vault.modify(ctx.file, nextLines.join("\n"));

    if (view?.editor && targetParent.lineNo >= 0) {
      view.editor.setCursor({ line: targetParent.lineNo, ch: 0 });
    }
  }

  private isTaskchuteLogPath(path: string) {
    const normalized = normalizePath(path);
    const folder = normalizePath(this.settings.logFolderPath);
    if (!normalized.startsWith(folder + "/")) return false;
    return /\d{4}-\d{2}-\d{2}\.md$/.test(normalized);
  }

  private getActiveLogDate(): Date | null {
    const file = this.app.workspace.getActiveFile();
    if (!file) return null;
    const match = file.path.match(/(\d{4}-\d{2}-\d{2})\.md$/);
    if (!match) return null;
    const parsed = parseDate(match[1]);
    return parsed ?? null;
  }

  private async openLogForDate(date: Date) {
    const file = await this.ensureLogFileForDate(date, true);
    if (!file) return;
    await this.app.workspace.getLeaf(true).openFile(file, { active: true });
  }

  private async ensureLogFileForDate(date: Date, openLeaf: boolean) {
    const path = this.getLogPathForDate(date);
    await this.ensureLogFolder();

    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      const title = formatDate(date);
      const content = `# ${title}\n\n`;
      file = await this.app.vault.create(path, content);
    }

    if (!(file instanceof TFile)) {
      new Notice("Failed to open log file");
      return null;
    }

    if (openLeaf) {
      await this.app.workspace.getLeaf(true).openFile(file, { active: true });
    }

    return file;
  }

  private async ensureLogFolder() {
    const folderPath = normalizePath(this.settings.logFolderPath);
    if (!folderPath) return;
    const existing = this.app.vault.getAbstractFileByPath(folderPath);
    if (!existing) {
      await this.app.vault.createFolder(folderPath);
      return;
    }
    if (!(existing instanceof TFolder)) {
      new Notice("Log folder path points to a file");
    }
  }

  private getLogPathForDate(date: Date) {
    const folder = normalizePath(this.settings.logFolderPath);
    const name = `${formatDate(date)}.md`;
    if (!folder) return name;
    return `${folder}/${name}`;
  }
}

class TaskChuteSettingTab extends PluginSettingTab {
  plugin: TaskChuteMinePlugin;

  constructor(app: App, plugin: TaskChuteMinePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h3", { text: "General" });

    new Setting(containerEl)
      .setName("Log folder path")
      .setDesc("Folder for daily logs")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.logFolderPath)
          .setValue(this.plugin.settings.logFolderPath)
          .onChange(async (value) => {
            const next = value.trim() || DEFAULT_SETTINGS.logFolderPath;
            this.plugin.settings.logFolderPath = next;
            await this.plugin.saveSettings();
          });
      });

    containerEl.createEl("h3", { text: "Templates" });

    new Setting(containerEl)
      .setName("Template folder path")
      .setDesc("Folder for templates")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.templateFolderPath)
          .setValue(this.plugin.settings.templateFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.templateFolderPath = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Enable templates")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enableTemplates).onChange(async (value) => {
          this.plugin.settings.enableTemplates = value;
          await this.plugin.saveSettings();
        });
      });

    containerEl.createEl("h3", { text: "Display" });

    new Setting(containerEl)
      .setName("Enable focus mode")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enableFocusMode).onChange(async (value) => {
          this.plugin.settings.enableFocusMode = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Enable filter mode")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enableFilterMode).onChange(async (value) => {
          this.plugin.settings.enableFilterMode = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Enable dim mode")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enableDim).onChange(async (value) => {
          this.plugin.settings.enableDim = value;
          await this.plugin.saveSettings();
        });
      });

    containerEl.createEl("h3", { text: "Advanced (Debug)" });
    containerEl.createEl("p", { text: "Debug settings will appear here." });
  }
}

class TimePunchModal extends Modal {
  private onSubmit: (time: string) => void;

  constructor(app: App, onSubmit: (time: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Time Punch" });
    contentEl.createEl("p", { text: "HHmm (例: 0930)" });

    const inputEl = contentEl.createEl("input");
    inputEl.type = "tel";
    inputEl.inputMode = "numeric";
    inputEl.pattern = "[0-9]*";
    inputEl.placeholder = "0930";
    inputEl.addEventListener("input", () => {
      inputEl.value = inputEl.value.replace(/[^0-9]/g, "").slice(0, 4);
    });

    const buttonRow = contentEl.createDiv({ cls: "tc-timepunch-buttons" });
    const okButton = buttonRow.createEl("button", { text: "OK" });
    const cancelButton = buttonRow.createEl("button", { text: "Cancel" });

    okButton.addEventListener("click", () => {
      const value = inputEl.value.trim();
      const parsed = parseHHmmToTime(value);
      if (!parsed) {
        new Notice("HHmmだけ受け付けるよ（例: 0930）");
        return;
      }
      this.close();
      this.onSubmit(parsed);
    });

    cancelButton.addEventListener("click", () => this.close());

    setTimeout(() => inputEl.focus(), 0);
  }
}

class TimePunchChoiceModal extends Modal {
  private baseTime: string;
  private onSelect: (time: string) => void;

  constructor(app: App, baseTime: string, onSelect: (time: string) => void) {
    super(app);
    this.baseTime = baseTime;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Time Punch" });
    contentEl.createEl("p", { text: "Start time options" });

    const list = contentEl.createDiv({ cls: "tc-timepunch-choices" });
    const options = [
      { label: `Start at ${this.baseTime}`, offset: 0 },
      { label: "Start 5m before", offset: -5 },
      { label: "Start 10m before", offset: -10 },
      { label: "Start 15m before", offset: -15 },
    ];

    options.forEach((option) => {
      const button = list.createEl("button", { text: option.label });
      button.addEventListener("click", () => {
        const startTime = shiftTime(this.baseTime, option.offset);
        this.close();
        this.onSelect(startTime);
      });
    });

    const cancelButton = contentEl.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => this.close());
  }
}

class RepairConfirmModal extends Modal {
  private onSelect: (ok: boolean) => void;

  constructor(app: App, onSelect: (ok: boolean) => void) {
    super(app);
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Repair" });
    contentEl.createEl("p", { text: "再生中タスクが2つ以上あります。修復しますか？" });

    const row = contentEl.createDiv({ cls: "tc-repair-buttons" });
    const yesButton = row.createEl("button", { text: "Yes" });
    const cancelButton = row.createEl("button", { text: "Cancel" });

    yesButton.addEventListener("click", () => {
      this.close();
      this.onSelect(true);
    });
    cancelButton.addEventListener("click", () => {
      this.close();
      this.onSelect(false);
    });
  }
}

class RepairContinueModal extends Modal {
  private onSelect: (ok: boolean) => void;

  constructor(app: App, onSelect: (ok: boolean) => void) {
    super(app);
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Repair" });
    contentEl.createEl("p", { text: "まだ2つ以上あります。続けますか？" });

    const row = contentEl.createDiv({ cls: "tc-repair-buttons" });
    const yesButton = row.createEl("button", { text: "Yes" });
    const cancelButton = row.createEl("button", { text: "Cancel" });

    yesButton.addEventListener("click", () => {
      this.close();
      this.onSelect(true);
    });
    cancelButton.addEventListener("click", () => {
      this.close();
      this.onSelect(false);
    });
  }
}

class RepairPickNowModal extends Modal {
  private entries: UnfinishedHourglass[];
  private onSelect: (entry: UnfinishedHourglass | null) => void;

  constructor(app: App, entries: UnfinishedHourglass[], onSelect: (entry: UnfinishedHourglass | null) => void) {
    super(app);
    this.entries = entries;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Repair Target" });
    contentEl.createEl("p", { text: "どれを終了させるか選んでください" });

    const list = contentEl.createDiv({ cls: "tc-repair-list" });
    this.entries.forEach((entry) => {
      const label = `${entry.parentText} / ${entry.startTime} (L${entry.hourglassLineNo + 1})`;
      const button = list.createEl("button", { text: label });
      button.addEventListener("click", () => {
        this.close();
        this.onSelect(entry);
      });
    });

    const cancelButton = contentEl.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
      this.onSelect(null);
    });
  }
}

class RepairEndModeModal extends Modal {
  private onSelect: (mode: RepairEndMode | null) => void;

  constructor(app: App, onSelect: (mode: RepairEndMode | null) => void) {
    super(app);
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Repair End Mode" });
    contentEl.createEl("p", { text: "終了方法を選んでください" });

    const list = contentEl.createDiv({ cls: "tc-repair-list" });
    const inputButton = list.createEl("button", { text: "終了時刻を入力（HHmm）" });
    const estimateButton = list.createEl("button", { text: "見積もり通りで終了" });
    const cancelButton = contentEl.createEl("button", { text: "Cancel" });

    inputButton.addEventListener("click", () => {
      this.close();
      this.onSelect("input");
    });
    estimateButton.addEventListener("click", () => {
      this.close();
      this.onSelect("estimate");
    });
    cancelButton.addEventListener("click", () => {
      this.close();
      this.onSelect(null);
    });
  }
}

class HHmmInputModal extends Modal {
  private onSelect: (time: string | null) => void;

  constructor(app: App, onSelect: (time: string | null) => void) {
    super(app);
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "HHmm Input" });
    contentEl.createEl("p", { text: "HHmm (例: 0930)" });

    const inputEl = contentEl.createEl("input");
    inputEl.type = "tel";
    inputEl.inputMode = "numeric";
    inputEl.pattern = "[0-9]*";
    inputEl.placeholder = "0930";
    inputEl.addEventListener("input", () => {
      inputEl.value = inputEl.value.replace(/[^0-9]/g, "").slice(0, 4);
    });

    const row = contentEl.createDiv({ cls: "tc-repair-buttons" });
    const okButton = row.createEl("button", { text: "OK" });
    const cancelButton = row.createEl("button", { text: "Cancel" });

    okButton.addEventListener("click", () => {
      const value = inputEl.value.trim();
      const parsed = parseHHmmToTime(value);
      if (!parsed) {
        new Notice("HHmmだけ受け付けるよ（例: 0930）");
        return;
      }
      this.close();
      this.onSelect(parsed);
    });

    cancelButton.addEventListener("click", () => {
      this.close();
      this.onSelect(null);
    });

    setTimeout(() => inputEl.focus(), 0);
  }
}

class TaskChuteChuteView extends ItemView {
  private plugin: TaskChuteMinePlugin;
  private refreshTimer: number | null = null;
  private currentFile: TFile | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TaskChuteMinePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return CHUTE_MINE_VIEW_TYPE;
  }

  getDisplayText() {
    return "TaskChute Chute";
  }

  async onOpen() {
    await this.loadAndRender();
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (this.currentFile && file.path === this.currentFile.path) {
          this.scheduleRefresh();
        }
      })
    );
  }

  async onClose() {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private scheduleRefresh() {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      void this.loadAndRender();
    }, 200);
  }

  private async loadAndRender() {
    const file = await this.plugin.getTodayLogFile();
    if (!file) return;
    this.currentFile = file;
    const text = await this.plugin.readLogText(file);
    this.render(text);
  }

  private render(text: string) {
    const container = this.containerEl;
    container.empty();
    container.addClass("tc-chute");

    const lines = text.split("\n");
    const parsed = parseLog(lines);
    let running = findRunningChildren(parsed);
    const unfinished = findAllUnfinishedHourglass(lines);
    if (!running.length && unfinished.length) {
      running = unfinished.map((entry) => ({
        lineNo: entry.hourglassLineNo,
        raw: entry.hourglassLineText,
        type: "doing" as const,
        start: entry.startTime,
        end: undefined,
      }));
    }
    const hasMultipleNow = unfinished.length >= 2;
    const nowParent = running.length ? findParentByChild(parsed, running[0].lineNo) : null;

    const header = container.createDiv({ cls: "tc-chute-header" });
    header.createEl("div", { cls: "tc-chute-title", text: "Chute" });
    const actionRow = header.createDiv({ cls: "tc-chute-actions" });
    const startBtn = actionRow.createEl("button", { text: "Start" });
    const endBtn = actionRow.createEl("button", { text: "End" });
    const easBtn = actionRow.createEl("button", { text: "End&Start" });
    const timeBtn = actionRow.createEl("button", { text: "Time" });
    const repairBtn = actionRow.createEl("button", { text: "Repair" });

    const ribbon = container.createDiv({ cls: "tc-chute-ribbon" });
    const scheduleList = ribbon.createDiv({ cls: "tc-chute-ribbon-list" });
    buildScheduleItems(parsed).forEach((item) => {
      const row = scheduleList.createDiv({
        cls: `tc-chute-ribbon-row${item.status === "done" ? " is-done" : ""}${item.isNext ? " is-next" : ""}`,
      });
      row.createDiv({ cls: "tc-chute-ribbon-time", text: item.time ?? "--:--" });
      row.createDiv({ cls: "tc-chute-ribbon-label", text: item.title });
    });

    const nowBox = container.createDiv({ cls: "tc-chute-now" });
    const nowLabel = nowBox.createDiv({ cls: "tc-chute-now-label", text: "NOW" });
    if (hasMultipleNow) {
      nowLabel.setText("NOW (Multiple)");
    }
    const nowText = nowBox.createDiv({
      cls: "tc-chute-now-text",
      text: running.length ? nowParent?.title ?? "Running" : "READY",
    });
    const memoArea = nowBox.createEl("textarea", {
      cls: "tc-chute-memo",
      attr: { placeholder: "ひとことメモ" },
    });
    const memoBtn = nowBox.createEl("button", { text: "Add Memo" });

    const taskList = container.createDiv({ cls: "tc-chute-tasklist" });
    const taskHeader = taskList.createDiv({ cls: "tc-chute-tasklist-head", text: "TASK LIST" });
    const taskBody = taskList.createDiv({ cls: "tc-chute-tasklist-body" });
    parsed.parents
      .filter((parent) => parent.status === "idle")
      .forEach((parent) => {
        const item = taskBody.createDiv({ cls: "tc-chute-task" });
        item.createEl("div", { cls: "tc-chute-task-title", text: parent.title });
        const meta = buildTaskMeta(parent.title);
        if (meta) {
          item.createEl("div", { cls: "tc-chute-task-meta", text: meta });
        }
        item.addEventListener("click", () => {
          if (hasMultipleNow) {
            void this.plugin["repairMultipleNowFlow"](this.currentFile!, null);
            return;
          }
          if (running.length) {
            new Notice("今のタスクを終了してから");
            return;
          }
          void this.startFromView(parent.lineNo);
        });
      });

    startBtn.addEventListener("click", async () => {
      if (hasMultipleNow) {
        await this.plugin["repairMultipleNowFlow"](this.currentFile!, null);
        return;
      }
      if (running.length) {
        new Notice("今のタスクを終了してから");
        return;
      }
      const confirm = await this.confirmModal("上から実行しますか？");
      if (!confirm) return;
      await this.startFirstUnfinished();
    });

    endBtn.addEventListener("click", async () => {
      if (hasMultipleNow) {
        await this.plugin["repairMultipleNowFlow"](this.currentFile!, null);
        return;
      }
      await this.endRunning();
    });

    easBtn.addEventListener("click", async () => {
      if (hasMultipleNow) {
        await this.plugin["repairMultipleNowFlow"](this.currentFile!, null);
        return;
      }
      await this.endAndStartFromView();
    });

    timeBtn.addEventListener("click", async () => {
      if (hasMultipleNow) {
        await this.plugin["repairMultipleNowFlow"](this.currentFile!, null);
        return;
      }
      await this.timePunchFromView();
    });

    repairBtn.addEventListener("click", async () => {
      await this.plugin["repairMultipleNowFlow"](this.currentFile!, null);
    });

    memoBtn.addEventListener("click", async () => {
      const value = memoArea.value.trim();
      if (!value) return;
      await this.addMemo(value);
      memoArea.value = "";
    });
  }

  private async confirmModal(message: string) {
    return new Promise<boolean>((resolve) => {
      const modal = new RepairConfirmModal(this.app, resolve);
      modal.onOpen = () => {
        const { contentEl } = modal;
        contentEl.empty();
        contentEl.createEl("h3", { text: "Confirm" });
        contentEl.createEl("p", { text: message });
        const row = contentEl.createDiv({ cls: "tc-repair-buttons" });
        const yesButton = row.createEl("button", { text: "Yes" });
        const cancelButton = row.createEl("button", { text: "Cancel" });
        yesButton.addEventListener("click", () => {
          modal.close();
          resolve(true);
        });
        cancelButton.addEventListener("click", () => {
          modal.close();
          resolve(false);
        });
      };
      modal.open();
    });
  }

  private async startFromView(parentLine: number) {
    if (!this.currentFile) return;
    await this.plugin.applyPatch(this.currentFile, (text) => {
      const lines = text.split("\n");
      const parsed = parseLog(lines);
      const target = parsed.parents.find((p) => p.lineNo === parentLine);
      if (!target) return text;
      const nextLines = insertDoingLine(lines, target, nowTimeString());
      return nextLines.join("\n");
    });
    this.scheduleRefresh();
  }

  private async startFirstUnfinished() {
    if (!this.currentFile) return;
    await this.plugin.applyPatch(this.currentFile, (text) => {
      const lines = text.split("\n");
      const parsed = parseLog(lines);
      const target = parsed.parents.find((p) => p.status !== "done");
      if (!target) return text;
      const nextLines = insertDoingLine(lines, target, nowTimeString());
      return nextLines.join("\n");
    });
    this.scheduleRefresh();
  }

  private async endRunning() {
    if (!this.currentFile) return;
    await this.plugin.applyPatch(this.currentFile, (text) => {
      const lines = text.split("\n");
      const parsed = parseLog(lines);
      let running = findRunningChildren(parsed);
      if (!running.length) {
        const fallback = findAllUnfinishedHourglass(lines).map((entry) => ({
          lineNo: entry.hourglassLineNo,
          raw: entry.hourglassLineText,
          type: "doing" as const,
          start: entry.startTime,
          end: undefined,
        }));
        running = fallback;
      }
      if (running.length !== 1) return text;
      const target = running[0];
      if (!target.start) return text;
      const endTime = nowTimeString();
      const durationMin = diffMinutesWithWrap(target.start, endTime);
      const replaced = buildDoneLine(target.start, endTime, durationMin);
      const nextLines = lines.slice();
      nextLines[target.lineNo] = replaced;
      return nextLines.join("\n");
    });
    this.scheduleRefresh();
  }

  private async endAndStartFromView() {
    if (!this.currentFile) return;
    await this.plugin.applyPatch(this.currentFile, (text) => {
      const lines = text.split("\n");
      const parsed = parseLog(lines);
      let running = findRunningChildren(parsed);
      if (!running.length) {
        const fallback = findAllUnfinishedHourglass(lines).map((entry) => ({
          lineNo: entry.hourglassLineNo,
          raw: entry.hourglassLineText,
          type: "doing" as const,
          start: entry.startTime,
          end: undefined,
        }));
        running = fallback;
      }
      if (running.length !== 1) return text;
      const target = running[0];
      if (!target.start) return text;
      const endTime = nowTimeString();
      const durationMin = diffMinutesWithWrap(target.start, endTime);
      const replaced = buildDoneLine(target.start, endTime, durationMin);
      const endedLines = lines.slice();
      endedLines[target.lineNo] = replaced;

      const nextParsed = parseLog(endedLines);
      const nextParent = selectNextParentForEndStart(nextParsed, target.lineNo);
      if (!nextParent) return endedLines.join("\n");
      const nextLines = insertDoingLine(endedLines, nextParent, nowTimeString());
      return nextLines.join("\n");
    });
    this.scheduleRefresh();
  }

  private async timePunchFromView() {
    if (!this.currentFile) return;
    const modal = new TimePunchModal(this.app, async (timeStr) => {
      await this.plugin.applyPatch(this.currentFile!, (text) => {
        const lines = text.split("\n");
        const parsed = parseLog(lines);
        const running = findRunningChildren(parsed);
        if (running.length) {
          const target = running[0];
          if (!target.start) return text;
          const durationMin = diffMinutesWithWrap(target.start, timeStr);
          const replaced = buildDoneLine(target.start, timeStr, durationMin);
          const nextLines = lines.slice();
          nextLines[target.lineNo] = replaced;
          return nextLines.join("\n");
        }

        const choice = new TimePunchChoiceModal(this.app, timeStr, (startTime) => {
          void this.plugin.applyPatch(this.currentFile!, (innerText) => {
            const innerLines = innerText.split("\n");
            const innerParsed = parseLog(innerLines);
            const targetParent = innerParsed.parents.find((p) => p.status !== "done");
            if (!targetParent) return innerText;
            const nextLines = insertDoingLine(innerLines, targetParent, startTime);
            return nextLines.join("\n");
          });
        });
        choice.open();
        return text;
      });
      this.scheduleRefresh();
    });
    modal.open();
  }

  private async addMemo(value: string) {
    if (!this.currentFile) return;
    await this.plugin.applyPatch(this.currentFile, (text) => {
      const lines = text.split("\n");
      const parsed = parseLog(lines);
      let running = findRunningChildren(parsed);
      if (!running.length) {
        const fallback = findAllUnfinishedHourglass(lines).map((entry) => ({
          lineNo: entry.hourglassLineNo,
          raw: entry.hourglassLineText,
          type: "doing" as const,
          start: entry.startTime,
          end: undefined,
        }));
        running = fallback;
      }
      if (!running.length) return text;
      const parent = findParentByChild(parsed, running[0].lineNo);
      if (!parent) return text;
      const insertAt = parent.children.length
        ? parent.children[parent.children.length - 1].lineNo + 1
        : parent.lineNo + 1;
      const nextLines = lines.slice();
      nextLines.splice(insertAt, 0, `  - 📝 ${value}`);
      return nextLines.join("\n");
    });
    this.scheduleRefresh();
  }
}

// ====== Ported from mini (log parsing + line operations, simplified) ======
const filterRefreshEffect = StateEffect.define<null>();

function buildFilterModeExtension(plugin: TaskChuteMinePlugin) {
  return ViewPlugin.fromClass(
    class {
      decorations: ReturnType<typeof Decoration.set>;

      constructor(readonly view: any) {
        this.decorations = buildFilterDecorations(plugin, view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet || update.transactions.some((tr) => tr.effects.length)) {
          this.decorations = buildFilterDecorations(plugin, update.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

function buildFilterDecorations(plugin: TaskChuteMinePlugin, view: any) {
  if (!plugin.settings.enableFilterMode) {
    return Decoration.none;
  }

  const doc = view.state.doc;
  const filePath = plugin.app.workspace.getActiveFile()?.path ?? "";
  const { parents, doneSections } = collectParentRanges(doc.toString());
  const builder = new RangeSetBuilder<Decoration>();
  type Entry = { pos: number; deco: Decoration };
  const entries: Entry[] = [];

  doneSections.forEach((section) => {
    const sectionDeco = Decoration.line({ attributes: { class: "tc-section tc-done" } });
    entries.push({ pos: section.from, deco: sectionDeco });
  });

  parents.forEach((parent) => {
    const key = buildParentKey(filePath, parent.lineNo, parent.tcId);
    const isCollapsed = parent.status === "done" ? plugin.collapsedByKey.get(key) ?? true : false;
    if (parent.status === "done") {
      const cls = `tc-parent tc-done ${isCollapsed ? "tc-collapsed" : "tc-expanded"}`;
      const lineDeco = Decoration.line({ attributes: { class: cls } });
      entries.push({ pos: parent.from, deco: lineDeco });
      const widget = Decoration.widget({
        widget: new CollapseToggleWidget(plugin, key, isCollapsed),
        side: -1,
      });
      entries.push({ pos: parent.to, deco: widget });
    } else if (parent.status === "running" || parent.status === "todo") {
      const lineDeco = Decoration.line({ attributes: { class: "tc-parent" } });
      entries.push({ pos: parent.from, deco: lineDeco });
    }

    if (parent.status === "done" && isCollapsed) {
      parent.children.forEach((child) => {
        const childDeco = Decoration.line({ attributes: { class: "tc-child tc-hidden" } });
        entries.push({ pos: child.from, deco: childDeco });
      });
    } else {
      parent.children.forEach((child) => {
        const childDeco = Decoration.line({ attributes: { class: "tc-child" } });
        entries.push({ pos: child.from, deco: childDeco });
      });
    }
  });

  entries.sort((a, b) => a.pos - b.pos);
  entries.forEach((entry) => builder.add(entry.pos, entry.pos, entry.deco));
  return builder.finish();
}

class CollapseToggleWidget extends WidgetType {
  private plugin: TaskChuteMinePlugin;
  private key: string;
  private collapsed: boolean;

  constructor(plugin: TaskChuteMinePlugin, key: string, collapsed: boolean) {
    super();
    this.plugin = plugin;
    this.key = key;
    this.collapsed = collapsed;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "tc-collapse-toggle";
    span.textContent = this.collapsed ? "▸" : "▾";
    span.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = !this.collapsed;
      span.textContent = next ? "▸" : "▾";
      this.plugin.collapsedByKey.set(this.key, next);
      this.plugin.refreshFilterDecorations();
    });
    return span;
  }
}

type ParentRange = {
  lineNo: number;
  from: number;
  to: number;
  text: string;
  status: "running" | "done" | "todo";
  tcId: string | null;
  children: Array<{ from: number; to: number; lineIndex: number }>;
};

type ParentRangesResult = {
  parents: ParentRange[];
  doneSections: Array<{ lineNo: number; from: number; to: number }>;
};

function collectParentRanges(docText: string): ParentRangesResult {
  const lines = docText.split("\n");
  const parents: ParentRange[] = [];
  const doneSections: Array<{ lineNo: number; from: number; to: number }> = [];
  const sectionHeaders: Array<{ lineNo: number; from: number; to: number }> = [];
  let offset = 0;
  let current: ParentRange | null = null;

  const flushCurrent = () => {
    if (current) parents.push(current);
  };

  lines.forEach((line, index) => {
    const lineLength = line.length;
    const lineFrom = offset;
    const lineTo = offset + lineLength;
    offset += lineLength + 1;

    if (/^##\s+/.test(line)) {
      sectionHeaders.push({ lineNo: index, from: lineFrom, to: lineTo });
    }

    if (isParentLine(line)) {
      flushCurrent();
      const tcIdMatch = line.match(/tc:id=([a-z0-9_-]+)/i);
      current = {
        lineNo: index,
        from: lineFrom,
        to: lineTo,
        text: line,
        status: "todo",
        tcId: tcIdMatch ? tcIdMatch[1] : null,
        children: [],
      };
      return;
    }

    if (current && isChildLine(line)) {
      current.children.push({ from: lineFrom, to: lineTo, lineIndex: index });
      return;
    }
  });

  flushCurrent();

  parents.forEach((parent) => {
    const childLines = parent.children.map((child) => lines[child.lineIndex] ?? "");
    parent.status = getParentStatus(childLines);
  });

  sectionHeaders.forEach((section, idx) => {
    const nextLine = sectionHeaders[idx + 1]?.lineNo ?? lines.length;
    const sectionParents = parents.filter((p) => p.lineNo > section.lineNo && p.lineNo < nextLine);
    if (sectionParents.length && sectionParents.every((p) => p.status === "done")) {
      doneSections.push(section);
    }
  });

  return { parents, doneSections };
}

function getParentStatus(childLines: string[]) {
  if (childLines.length === 0) return "todo";
  const normalized = childLines.map((line) => line.replace(/\uFE0F/g, ""));
  const logLines = normalized.filter(
    (line) => line.includes("⌛") || line.includes("⏳") || line.includes("✔") || line.includes("✅") || line.includes("✓")
  );
  if (logLines.length === 0) return "todo";
  const latest = logLines[logLines.length - 1];
  if (latest.includes("⌛") || latest.includes("⏳")) return "running";
  if (latest.includes("✔") || latest.includes("✅") || latest.includes("✓")) return "done";
  return "todo";
}

function buildParentKey(path: string, lineNo: number, tcId: string | null) {
  if (tcId) return `tcid:${tcId}`;
  return `${path}#L${lineNo}`;
}

function getEditorViewFromMarkdownView(view: MarkdownView) {
  const editorAny = (view as any).editor;
  return (
    editorAny?.cm ??
    editorAny?.cmEditor ??
    editorAny?.cm?.view ??
    editorAny?.cm?.cm ??
    editorAny?.cm?.cm?.view ??
    null
  );
}

function parseLog(lines: string[]): ParsedLog {
  const parents: ParsedParent[] = [];
  let currentParent: ParsedParent | null = null;

  lines.forEach((raw, lineNo) => {
    if (isParentLine(raw)) {
      currentParent = {
        lineNo,
        raw,
        title: raw.replace(/^\s*-\s*/, "").trim(),
        children: [],
        status: "idle",
      };
      parents.push(currentParent);
      return;
    }

    if (currentParent && (isChildLine(raw) || raw.includes("⌛") || raw.includes("✔️") || raw.includes("📝"))) {
      const child = parseChildLine(raw, lineNo);
      currentParent.children.push(child);
    }
  });

  for (const parent of parents) {
    const runningChild = parent.children.find((child) => child.type === "doing" && !child.end);
    const runningByRaw = parent.children.find((child) => {
      const normalized = child.raw.replace(/\uFE0F/g, "");
      if (!(normalized.includes("⌛") || normalized.includes("⏳"))) return false;
      const content = child.raw.trim().replace(/^-\s*/, "");
      const { start, end } = parseTimeRange(content);
      return Boolean(start && !end);
    });
    if (runningChild || runningByRaw) {
      parent.status = "running";
      continue;
    }

    const doneChild = parent.children.find((child) => child.type === "done");
    const doneByRaw = parent.children.find((child) => {
      const normalized = child.raw.replace(/\uFE0F/g, "");
      return normalized.includes("✔") || normalized.includes("✅") || normalized.includes("✓");
    });
    if (doneChild || doneByRaw) {
      parent.status = "done";
    }
  }

  return { parents };
}

function findParentByLine(parsed: ParsedLog, lineNo: number) {
  return parsed.parents.find((parent) => parent.lineNo === lineNo) ?? null;
}

function selectTargetParent(parsed: ParsedLog, cursorLine: number | null) {
  let targetParent = cursorLine != null ? findParentByLine(parsed, cursorLine) : null;
  if (!targetParent) {
    targetParent = parsed.parents.find((parent) => parent.status !== "done") ?? null;
  }
  return targetParent;
}

function findParentByChild(parsed: ParsedLog, childLineNo: number) {
  return parsed.parents.find((parent) => parent.children.some((child) => child.lineNo === childLineNo)) ?? null;
}

function findRunningChildren(parsed: ParsedLog) {
  const running: ParsedChild[] = [];
  parsed.parents.forEach((parent) => {
    parent.children.forEach((child) => {
      if (child.type === "doing" && !child.end) {
        running.push(child);
      }
    });
  });
  return running;
}

function findLatestUnfinishedHourglassChild(parent: ParsedParent) {
  for (let i = parent.children.length - 1; i >= 0; i -= 1) {
    const child = parent.children[i];
    if (child.type === "doing" && !child.end) return child;
  }
  return null;
}

function findAllUnfinishedHourglass(lines: string[]): UnfinishedHourglass[] {
  const results: UnfinishedHourglass[] = [];
  let currentParent: { lineNo: number; text: string } | null = null;

  lines.forEach((line, lineNo) => {
    if (isParentLine(line)) {
      currentParent = { lineNo, text: line.replace(/^\s*-\s*/, "").trim() };
      return;
    }

    if (!currentParent) return;
    const trimmed = line.trim();
    const content = trimmed.replace(/^-\\s*/, "");
    const normalized = content.replace(/\uFE0F/g, "");
    if (!(normalized.includes("⌛") || normalized.includes("⏳"))) return;
    const { start, end } = parseTimeRange(content);
    if (!start || end) return;

    results.push({
      hourglassLineNo: lineNo,
      hourglassLineText: line,
      parentLineNo: currentParent.lineNo,
      parentText: currentParent.text,
      startTime: start,
    });
  });

  return results;
}

function buildScheduleItems(parsed: ParsedLog) {
  const items = parsed.parents
    .map((parent) => {
      const time = extractTimeFromText(parent.title);
      const isMust = /must|必須|★|⭐/i.test(parent.title);
      return { title: parent.title, time, status: parent.status, isMust };
    })
    .filter((item) => item.time || item.isMust)
    .sort((a, b) => {
      const aMin = a.time ? toMinutes(a.time) ?? 9999 : 9999;
      const bMin = b.time ? toMinutes(b.time) ?? 9999 : 9999;
      return aMin - bMin;
    });

  const nowMin = toMinutes(nowTimeString()) ?? 0;
  const nextItem = items.find((item) => item.status !== "done" && (toMinutes(item.time as string) ?? 9999) >= nowMin);
  return items.map((item) => ({ ...item, isNext: item === nextItem }));
}

function insertDoingLine(lines: string[], parent: ParsedParent, startTime: string) {
  const nextLines = lines.slice();
  const insertAt = parent.children.length
    ? parent.children[parent.children.length - 1].lineNo + 1
    : parent.lineNo + 1;
  const line = `  - ⌛ ${startTime}–`;
  nextLines.splice(insertAt, 0, line);
  return nextLines;
}

function buildDoneLine(start: string, end: string, durationMin: number) {
  const minutes = Math.max(1, durationMin);
  return `  - ✔️ ${start}–${end} +${minutes}m`;
}

function parseChildLine(raw: string, lineNo: number): ParsedChild {
  const trimmed = raw.trim();
  const content = trimmed.replace(/^-\\s*/, "");
  const normalized = content.replace(/\uFE0F/g, "");

  if (normalized.startsWith("⌛") || normalized.startsWith("⏳")) {
    const { start, end } = parseTimeRange(content);
    return { lineNo, raw, type: "doing", start, end };
  }

  if (normalized.startsWith("✔") || normalized.startsWith("✅") || normalized.startsWith("✓")) {
    const { start, end, durationMin } = parseDoneLine(content);
    return { lineNo, raw, type: "done", start, end, durationMin };
  }

  if (normalized.startsWith("📝")) {
    return { lineNo, raw, type: "memo" };
  }

  return { lineNo, raw, type: "other" };
}

function parseTimeRange(text: string) {
  const times = text.match(/\b\d{1,2}:\d{2}\b/g) ?? [];
  if (times.length === 0) return { start: undefined, end: undefined };
  return { start: times[0], end: times[1] };
}

function parseDoneLine(text: string) {
  const time = parseTimeRange(text);
  const durationMatch = text.match(/\+(\d+)m/);
  const durationMin = durationMatch ? Number(durationMatch[1]) : undefined;
  return { ...time, durationMin };
}

function parseEstimateMinutes(text: string) {
  const match = text.match(/\((\d+)\s*m?\)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function extractTimeFromText(text: string) {
  const match = text.match(/\b(\d{1,2}:\d{2})\b/);
  return match ? match[1] : null;
}

function selectNextParentForEndStart(parsed: ParsedLog, runningChildLine: number) {
  const scheduled = buildScheduleItems(parsed)
    .filter((item) => item.time)
    .map((item) => ({
      ...item,
      minutes: toMinutes(item.time as string) ?? 9999,
    }));
  const nowMin = toMinutes(nowTimeString()) ?? 0;
  const scheduledNext = scheduled
    .filter((item) => item.minutes >= nowMin)
    .sort((a, b) => a.minutes - b.minutes)[0];
  if (scheduledNext) {
    return parsed.parents.find((p) => p.title === scheduledNext.title) ?? null;
  }

  const must = parsed.parents.filter((p) => /must|必須|★|⭐/i.test(p.title) && p.status !== "done");
  if (must.length) return must[0];

  const currentParentIndex = parsed.parents.findIndex((parent) =>
    parent.children.some((child) => child.lineNo === runningChildLine)
  );
  if (currentParentIndex >= 0) {
    const nextParent = parsed.parents.slice(currentParentIndex + 1).find((parent) => parent.status !== "done");
    if (nextParent) return nextParent;
  }

  return parsed.parents.find((parent) => parent.status !== "done") ?? null;
}

function buildTaskMeta(title: string) {
  const time = extractTimeFromText(title);
  const estimate = parseEstimateMinutes(title);
  const parts: string[] = [];
  if (time) parts.push(time);
  if (estimate) parts.push(`${estimate}m`);
  return parts.length ? parts.join(" · ") : null;
}

function isParentLine(line: string) {
  return /^-\s+/.test(line);
}

function isChildLine(line: string) {
  if (/^\s+[-*]\s+/.test(line)) return true;
  const trimmed = line.trim();
  return trimmed.startsWith("⌛") || trimmed.startsWith("✔️") || trimmed.startsWith("📝") || trimmed.startsWith("✔") || trimmed.startsWith("✅") || trimmed.startsWith("✓");
}

function isDoneLine(line: string) {
  const trimmed = line.trim().replace(/\uFE0F/g, "");
  return trimmed.startsWith("✔") || trimmed.startsWith("✅") || trimmed.startsWith("✓");
}

function getParentLineIndex(editor: any, fromLine: number) {
  for (let line = fromLine; line >= 0; line -= 1) {
    const text = editor.getLine(line);
    if (isParentLine(text)) return line;
  }
  return null;
}

function getParentBlockRange(editor: any, parentLine: number) {
  let end = parentLine;
  const last = editor.lastLine();
  for (let line = parentLine + 1; line <= last; line += 1) {
    const text = editor.getLine(line);
    if (isParentLine(text)) break;
    end = line;
  }
  return { start: parentLine, end };
}

function recalcDoneLine(line: string) {
  const normalized = line.replace(/\uFE0F/g, "");
  if (!isDoneLine(normalized)) return null;
  const { start, end } = parseTimeRange(normalized);
  if (!start || !end) return null;
  const duration = diffMinutesWithWrap(start, end);
  const cleaned = line.replace(/\s\+\d+m/g, "");
  return cleaned.replace(/(✔\s*|\u2714\s*|\u2705\s*)(\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2})/, `$1$2 +${duration}m`);
}

function diffMinutes(start: string, end: string) {
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (startMin == null || endMin == null) return 0;
  const diff = endMin - startMin;
  return diff >= 0 ? Math.round(diff) : 0;
}

function diffMinutesWithWrap(start: string, end: string) {
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (startMin == null || endMin == null) return 0;
  const diff = endMin - startMin;
  if (diff >= 0) return Math.round(diff);
  return Math.round(diff + 24 * 60);
}

function toMinutes(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

function parseHHmmToTime(value: string) {
  if (!/^\d{4}$/.test(value)) return null;
  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(2, 4));
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function isValidTime(time: string) {
  return toMinutes(time) != null;
}

function shiftTime(time: string, offsetMinutes: number) {
  const base = toMinutes(time);
  if (base == null) return time;
  let next = base + offsetMinutes;
  const total = 24 * 60;
  while (next < 0) next += total;
  while (next >= total) next -= total;
  const hours = Math.floor(next / 60);
  const minutes = next % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function findLatestDoneTime(lines: string[]) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const raw = lines[i].trim();
    if (!isChildLine(lines[i])) continue;
    const content = raw.replace(/^-\\s*/, "");
    const normalized = content.replace(/\uFE0F/g, "");
    if (!(normalized.startsWith("✔") || normalized.startsWith("✅") || normalized.startsWith("✓"))) continue;
    const { start, end } = parseDoneLine(content);
    const time = end || start;
    if (time) return time;
  }
  return null;
}

function nowTimeString(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}
