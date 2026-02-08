"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => TaskChuteMinePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_view = require("@codemirror/view");
var import_state = require("@codemirror/state");
var CHUTE_MINE_VIEW_TYPE = "taskchute-mine-chute";
var DEFAULT_SETTINGS = {
  logFolderPath: "taskchute",
  templateFolderPath: "",
  enableTemplates: false,
  enableFocusMode: false,
  enableFilterMode: false,
  enableDim: true
};
var TaskChuteMinePlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.collapsedByKey = /* @__PURE__ */ new Map();
    this.filterExtension = buildFilterModeExtension(this);
  }
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
    new import_obsidian.Notice("TaskChute Mine loaded");
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
    var _a, _b, _c, _d;
    const data = await this.loadData();
    const merged = Object.assign({}, DEFAULT_SETTINGS, data || {});
    if (merged.enableDim === void 0 && (data == null ? void 0 : data.dimMode) !== void 0) {
      merged.enableDim = (_a = data.dimMode) != null ? _a : DEFAULT_SETTINGS.enableDim;
    }
    this.settings = merged;
    const logPath = ((_c = (_b = this.settings.logFolderPath) == null ? void 0 : _b.trim) == null ? void 0 : _c.call(_b)) || "";
    this.settings.logFolderPath = logPath || DEFAULT_SETTINGS.logFolderPath;
    this.settings.templateFolderPath = (_d = this.settings.templateFolderPath) != null ? _d : DEFAULT_SETTINGS.templateFolderPath;
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  registerCommands() {
    this.addCommand({
      id: "taskchute-open-today",
      name: "TaskChute: Open Today",
      callback: () => this.openToday()
    });
    this.addCommand({
      id: "taskchute-open-prev-day",
      name: "TaskChute: Open Previous Day",
      callback: () => this.openPrevDay()
    });
    this.addCommand({
      id: "taskchute-open-next-day",
      name: "TaskChute: Open Next Day",
      callback: () => this.openNextDay()
    });
    this.addCommand({
      id: "taskchute-start",
      name: "TaskChute: Start",
      callback: () => this.start()
    });
    this.addCommand({
      id: "taskchute-end",
      name: "TaskChute: End",
      callback: () => this.end()
    });
    this.addCommand({
      id: "taskchute-end-and-start",
      name: "TaskChute: End and Start",
      callback: () => this.endAndStart()
    });
    this.addCommand({
      id: "taskchute-resume",
      name: "TaskChute: Resume",
      callback: () => this.resume()
    });
    this.addCommand({
      id: "taskchute-start-from-latest-done-time",
      name: "TaskChute: Start From Latest Done Time",
      callback: () => this.startFromLatestDoneTime()
    });
    this.addCommand({
      id: "taskchute-time-punch",
      name: "TaskChute: Time Punch (HHmm)",
      icon: "clock",
      callback: () => this.timePunch()
    });
    this.addCommand({
      id: "taskchute-recalc",
      name: "TaskChute: Recalculate Duration (+Xm)",
      callback: () => this.recalculateDuration()
    });
    this.addCommand({
      id: "taskchute-insert-memo",
      name: "TaskChute: Insert Memo Line",
      callback: () => this.insertMemoLine()
    });
    this.addCommand({
      id: "taskchute-repair-multiple-now",
      name: "TaskChute: Repair Multiple Now",
      callback: () => this.repairMultipleNowCommand()
    });
    this.addCommand({
      id: "taskchute-toggle-focus-mode",
      name: "TaskChute: Toggle Focus Mode",
      callback: () => this.toggleFocusMode()
    });
    this.addCommand({
      id: "taskchute-toggle-filter-mode",
      name: "TaskChute: Toggle Filter Mode",
      callback: () => this.toggleFilterMode()
    });
    this.addCommand({
      id: "taskchute-debug-filter-log",
      name: "TaskChute: Debug Filter Log",
      callback: () => this.debugFilterLog()
    });
    this.addCommand({
      id: "taskchute-toggle-player-mode",
      name: "TaskChute: Toggle Player Mode",
      callback: () => this.togglePlayerMode()
    });
    this.addCommand({
      id: "taskchute-toggle-cockpit-sidebar",
      name: "TaskChute: Toggle Cockpit Sidebar",
      callback: () => this.toggleCockpitSidebar()
    });
    this.addCommand({
      id: "taskchute-toggle-horizon-header",
      name: "TaskChute: Toggle Horizon Header",
      callback: () => this.toggleHorizonHeader()
    });
    this.addCommand({
      id: "taskchute-open-chute-mode",
      name: "TaskChute: Open Chute Mode",
      callback: () => this.openChuteView()
    });
    this.addCommand({
      id: "taskchute-open-chute-view",
      name: "TaskChute: Open Chute View",
      callback: () => this.openChuteView()
    });
  }
  todo(label) {
    new import_obsidian.Notice(`TODO: ${label}`);
  }
  async openToday() {
    await this.openLogForDate(/* @__PURE__ */ new Date());
  }
  async openPrevDay() {
    var _a;
    const base = (_a = this.getActiveLogDate()) != null ? _a : /* @__PURE__ */ new Date();
    const prev = addDays(base, -1);
    await this.openLogForDate(prev);
  }
  async openNextDay() {
    var _a;
    const base = (_a = this.getActiveLogDate()) != null ? _a : /* @__PURE__ */ new Date();
    const next = addDays(base, 1);
    await this.openLogForDate(next);
  }
  async start() {
    const ctx = await this.getActiveLogContext();
    if (!ctx) return;
    if (!await this.guardMultipleNow(ctx, ctx.view)) {
      new import_obsidian.Notice("\u4FEE\u5FA9\u3057\u3066\u304F\u3060\u3055\u3044");
      return;
    }
    await this.startAtContext(ctx, nowTimeString());
  }
  async end() {
    const ctx = await this.getActiveLogContext();
    if (!ctx) return;
    if (!await this.guardMultipleNow(ctx, ctx.view)) return;
    const { file, lines, parsed } = ctx;
    console.log("[TaskChute] End: file", file.path);
    console.log("[TaskChute] End: raw lines around", lines.slice(0, 40));
    console.log("[TaskChute] End: parsed parents", parsed.parents.map((p) => ({
      lineNo: p.lineNo,
      title: p.title,
      status: p.status,
      children: p.children.map((c) => ({ lineNo: c.lineNo, raw: c.raw, type: c.type, start: c.start, end: c.end }))
    })));
    let running = findRunningChildren(parsed);
    if (running.length === 0) {
      const fallbackMatches = findAllUnfinishedHourglass(lines);
      console.log("[TaskChute] End: fallback matches", fallbackMatches);
      const fallback = fallbackMatches.map((entry) => ({
        lineNo: entry.hourglassLineNo,
        raw: entry.hourglassLineText,
        type: "doing",
        start: entry.startTime,
        end: void 0
      }));
      running = fallback;
    }
    console.log("[TaskChute] End: running", running);
    if (running.length === 0) {
      new import_obsidian.Notice("No running task");
      return;
    }
    if (running.length > 1) {
      new import_obsidian.Notice("Multiple running tasks");
      return;
    }
    const target = running[0];
    if (!target.start) {
      new import_obsidian.Notice("Running task has no start time");
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
    if (!await this.guardMultipleNow(ctx, ctx.view)) return;
    const { file, lines, parsed } = ctx;
    let running = findRunningChildren(parsed);
    if (running.length === 0) {
      const fallbackMatches = findAllUnfinishedHourglass(lines);
      const fallback = fallbackMatches.map((entry) => ({
        lineNo: entry.hourglassLineNo,
        raw: entry.hourglassLineText,
        type: "doing",
        start: entry.startTime,
        end: void 0
      }));
      running = fallback;
    }
    if (running.length === 0) {
      new import_obsidian.Notice("No running task");
      return;
    }
    if (running.length > 1) {
      new import_obsidian.Notice("Multiple running tasks");
      return;
    }
    const target = running[0];
    if (!target.start) {
      new import_obsidian.Notice("Running task has no start time");
      return;
    }
    const endTime = nowTimeString();
    const durationMin = diffMinutes(target.start, endTime);
    const replaced = buildDoneLine(target.start, endTime, durationMin);
    const endedLines = lines.slice();
    endedLines[target.lineNo] = replaced;
    const nextParsed = parseLog(endedLines);
    const currentParentIndex = nextParsed.parents.findIndex(
      (parent) => parent.children.some((child) => child.lineNo === target.lineNo)
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
      new import_obsidian.Notice("\u2714\uFE0F\u304C\u898B\u3064\u304B\u3089\u306A\u3044\u3088");
      return;
    }
    if (!isValidTime(latestTime)) {
      new import_obsidian.Notice("\u6642\u523B\u3092\u8AAD\u3081\u306A\u304B\u3063\u305F\u3088");
      return;
    }
    await this.startAtContext(ctx, latestTime, "\u958B\u59CB\u3067\u304D\u308B\u30BF\u30B9\u30AF\u304C\u898B\u3064\u304B\u3089\u306A\u3044\u3088");
  }
  async timePunch() {
    var _a;
    const ctx = await this.getActiveOrTodayLogContext();
    if (!ctx) return;
    const view = (_a = ctx.view) != null ? _a : this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!(view == null ? void 0 : view.editor)) {
      new import_obsidian.Notice("Editor not available");
      return;
    }
    if (!await this.guardMultipleNow(ctx, view)) return;
    const modal = new TimePunchModal(this.app, async (timeStr) => {
      const cursorLine = view.editor.getCursor().line;
      const targetParent = selectTargetParent(ctx.parsed, cursorLine);
      if (!targetParent) {
        new import_obsidian.Notice("\u5BFE\u8C61\u306E\u89AA\u30BF\u30B9\u30AF\u304C\u898B\u3064\u304B\u3089\u306A\u3044\u3088");
        return;
      }
      const unfinished = findLatestUnfinishedHourglassChild(targetParent);
      if (unfinished) {
        if (!unfinished.start) {
          new import_obsidian.Notice("\u231B\u306E\u958B\u59CB\u6642\u523B\u304C\u53D6\u308C\u306A\u304B\u3063\u305F\u3088");
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
          new import_obsidian.Notice("\u5BFE\u8C61\u306E\u89AA\u30BF\u30B9\u30AF\u304C\u898B\u3064\u304B\u3089\u306A\u3044\u3088");
          return;
        }
        const nextLines = insertDoingLine(refreshed.lines, parent, startTime);
        await this.app.vault.modify(refreshed.file, nextLines.join("\n"));
        const insertedLine = parent.children.length ? parent.children[parent.children.length - 1].lineNo + 1 : parent.lineNo + 1;
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
        new import_obsidian.Notice("Open taskchute log");
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
    new import_obsidian.Notice(`Recalculated ${updated} logs`);
  }
  async insertMemoLine() {
    const ctx = this.getActiveLogEditorContext();
    if (!ctx) return;
    const { editor } = ctx;
    const cursorLine = editor.getCursor().line;
    let parentLine = null;
    if (isParentLine(editor.getLine(cursorLine))) {
      parentLine = cursorLine;
    } else {
      parentLine = getParentLineIndex(editor, cursorLine);
    }
    if (parentLine == null) {
      new import_obsidian.Notice("Open taskchute log");
      return;
    }
    const range = getParentBlockRange(editor, parentLine);
    const insertAt = range.end + 1;
    const memoLine = "  - \u{1F4DD} ";
    editor.replaceRange(`${memoLine}
`, { line: insertAt, ch: 0 });
    editor.setCursor({ line: insertAt, ch: memoLine.length });
    new import_obsidian.Notice("Memo inserted");
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
  async getActiveLogContext() {
    const file = this.app.workspace.getActiveFile();
    if (!file || !this.isTaskchuteLogPath(file.path)) {
      new import_obsidian.Notice("Active file is not a TaskChute log");
      return null;
    }
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const parsed = parseLog(lines);
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    return { file, lines, parsed, view };
  }
  getActiveLogEditorContext() {
    const file = this.app.workspace.getActiveFile();
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!file || !(view == null ? void 0 : view.editor) || !this.isTaskchuteLogPath(file.path)) {
      new import_obsidian.Notice("Open taskchute log");
      return null;
    }
    return { file, editor: view.editor, view };
  }
  initializeCollapsedState() {
    var _a;
    const file = this.app.workspace.getActiveFile();
    if (!file) return;
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    const doc = (_a = view == null ? void 0 : view.editor) == null ? void 0 : _a.getValue();
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
      if (view instanceof import_obsidian.MarkdownView) {
        const editorView = getEditorViewFromMarkdownView(view);
        if (editorView) {
          editorView.dispatch({ effects: filterRefreshEffect.of(null) });
        }
      }
    });
  }
  debugFilterLog() {
    var _a;
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    const doc = (_a = view == null ? void 0 : view.editor) == null ? void 0 : _a.getValue();
    if (!doc) {
      console.log("[TaskChute] Debug Filter: no doc");
      return;
    }
    const result = collectParentRanges(doc);
    console.log("[TaskChute] Debug Filter: parents", result.parents.map((p) => ({
      lineNo: p.lineNo,
      text: p.text,
      status: p.status,
      children: p.children.map((c) => c.lineIndex)
    })));
    console.log("[TaskChute] Debug Filter: doneSections", result.doneSections);
  }
  async getActiveOrTodayLogContext() {
    const file = this.app.workspace.getActiveFile();
    if (file && this.isTaskchuteLogPath(file.path)) {
      const content2 = await this.app.vault.read(file);
      const lines2 = content2.split("\n");
      const parsed2 = parseLog(lines2);
      const view2 = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      return { file, lines: lines2, parsed: parsed2, view: view2 };
    }
    const todayFile = await this.ensureLogFileForDate(/* @__PURE__ */ new Date(), true);
    if (!todayFile) return null;
    const content = await this.app.vault.read(todayFile);
    const lines = content.split("\n");
    const parsed = parseLog(lines);
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    return { file: todayFile, lines, parsed, view };
  }
  async getTodayLogFile() {
    return this.ensureLogFileForDate(/* @__PURE__ */ new Date(), false);
  }
  async readLogText(file) {
    return this.app.vault.read(file);
  }
  async writeLogText(file, text) {
    await this.app.vault.modify(file, text);
  }
  async applyPatch(file, patchFn) {
    const text = await this.readLogText(file);
    const next = patchFn(text);
    if (next !== text) {
      await this.writeLogText(file, next);
    }
  }
  async refreshContext(file) {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const parsed = parseLog(lines);
    return { file, lines, parsed };
  }
  async repairMultipleNowCommand() {
    var _a;
    const ctx = await this.getActiveOrTodayLogContext();
    if (!ctx) return;
    const view = (_a = ctx.view) != null ? _a : this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    await this.repairMultipleNowFlow(ctx.file, view);
  }
  async guardMultipleNow(ctx, view) {
    var _a;
    const unfinished = findAllUnfinishedHourglass(ctx.lines);
    if (unfinished.length >= 2) {
      await this.repairMultipleNowFlow(ctx.file, (_a = view != null ? view : ctx.view) != null ? _a : null);
      return false;
    }
    return true;
  }
  async repairMultipleNowFlow(file, view) {
    var _a;
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
      let endTime = null;
      let durationMin = null;
      if (endMode === "estimate") {
        const estimate = parseEstimateMinutes(target.parentText);
        if (!estimate) {
          new import_obsidian.Notice("\u898B\u7A4D\u304C\u7121\u3044\u3088\u3002HHmm\u5165\u529B\u3067\u7D42\u4E86\u3057\u3066\u306D");
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
      if (!((_a = freshAgain.lines[target.hourglassLineNo]) == null ? void 0 : _a.includes("\u231B"))) {
        new import_obsidian.Notice("\u5BFE\u8C61\u304C\u898B\u3064\u304B\u3089\u306A\u3044\u3088\u3002\u3082\u3046\u4E00\u5EA6\u3084\u3063\u3066\u306D");
        return;
      }
      const doneLine = buildDoneLine(target.startTime, endTime, durationMin != null ? durationMin : 0);
      const nextLines = freshAgain.lines.slice();
      nextLines[target.hourglassLineNo] = doneLine;
      await this.app.vault.modify(freshAgain.file, nextLines.join("\n"));
      if (view == null ? void 0 : view.editor) {
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
  showRepairConfirm() {
    return new Promise((resolve) => {
      const modal = new RepairConfirmModal(this.app, resolve);
      modal.open();
    });
  }
  showRepairContinue() {
    return new Promise((resolve) => {
      const modal = new RepairContinueModal(this.app, resolve);
      modal.open();
    });
  }
  showRepairPick(entries) {
    return new Promise((resolve) => {
      const modal = new RepairPickNowModal(this.app, entries, resolve);
      modal.open();
    });
  }
  showRepairEndMode() {
    return new Promise((resolve) => {
      const modal = new RepairEndModeModal(this.app, resolve);
      modal.open();
    });
  }
  showHHmmInput() {
    return new Promise((resolve) => {
      const modal = new HHmmInputModal(this.app, resolve);
      modal.open();
    });
  }
  async startAtContext(ctx, timeStr, noParentMessage = "No target parent task") {
    var _a, _b, _c, _d;
    const view = (_a = ctx.view) != null ? _a : this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    const cursorLine = (_d = (_c = (_b = view == null ? void 0 : view.editor) == null ? void 0 : _b.getCursor) == null ? void 0 : _c.call(_b).line) != null ? _d : null;
    const targetParent = selectTargetParent(ctx.parsed, cursorLine);
    if (!targetParent) {
      new import_obsidian.Notice(noParentMessage);
      return;
    }
    const nextLines = insertDoingLine(ctx.lines, targetParent, timeStr);
    await this.app.vault.modify(ctx.file, nextLines.join("\n"));
    if ((view == null ? void 0 : view.editor) && targetParent.lineNo >= 0) {
      view.editor.setCursor({ line: targetParent.lineNo, ch: 0 });
    }
  }
  isTaskchuteLogPath(path) {
    const normalized = normalizePath(path);
    const folder = normalizePath(this.settings.logFolderPath);
    if (!normalized.startsWith(folder + "/")) return false;
    return /\d{4}-\d{2}-\d{2}\.md$/.test(normalized);
  }
  getActiveLogDate() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return null;
    const match = file.path.match(/(\d{4}-\d{2}-\d{2})\.md$/);
    if (!match) return null;
    const parsed = parseDate(match[1]);
    return parsed != null ? parsed : null;
  }
  async openLogForDate(date) {
    const file = await this.ensureLogFileForDate(date, true);
    if (!file) return;
    await this.app.workspace.getLeaf(true).openFile(file, { active: true });
  }
  async ensureLogFileForDate(date, openLeaf) {
    const path = this.getLogPathForDate(date);
    await this.ensureLogFolder();
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      const title = formatDate(date);
      const content = `# ${title}

`;
      file = await this.app.vault.create(path, content);
    }
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice("Failed to open log file");
      return null;
    }
    if (openLeaf) {
      await this.app.workspace.getLeaf(true).openFile(file, { active: true });
    }
    return file;
  }
  async ensureLogFolder() {
    const folderPath = normalizePath(this.settings.logFolderPath);
    if (!folderPath) return;
    const existing = this.app.vault.getAbstractFileByPath(folderPath);
    if (!existing) {
      await this.app.vault.createFolder(folderPath);
      return;
    }
    if (!(existing instanceof import_obsidian.TFolder)) {
      new import_obsidian.Notice("Log folder path points to a file");
    }
  }
  getLogPathForDate(date) {
    const folder = normalizePath(this.settings.logFolderPath);
    const name = `${formatDate(date)}.md`;
    if (!folder) return name;
    return `${folder}/${name}`;
  }
};
var TaskChuteSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h3", { text: "General" });
    new import_obsidian.Setting(containerEl).setName("Log folder path").setDesc("Folder for daily logs").addText((text) => {
      text.setPlaceholder(DEFAULT_SETTINGS.logFolderPath).setValue(this.plugin.settings.logFolderPath).onChange(async (value) => {
        const next = value.trim() || DEFAULT_SETTINGS.logFolderPath;
        this.plugin.settings.logFolderPath = next;
        await this.plugin.saveSettings();
      });
    });
    containerEl.createEl("h3", { text: "Templates" });
    new import_obsidian.Setting(containerEl).setName("Template folder path").setDesc("Folder for templates").addText((text) => {
      text.setPlaceholder(DEFAULT_SETTINGS.templateFolderPath).setValue(this.plugin.settings.templateFolderPath).onChange(async (value) => {
        this.plugin.settings.templateFolderPath = value.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Enable templates").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.enableTemplates).onChange(async (value) => {
        this.plugin.settings.enableTemplates = value;
        await this.plugin.saveSettings();
      });
    });
    containerEl.createEl("h3", { text: "Display" });
    new import_obsidian.Setting(containerEl).setName("Enable focus mode").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.enableFocusMode).onChange(async (value) => {
        this.plugin.settings.enableFocusMode = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Enable filter mode").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.enableFilterMode).onChange(async (value) => {
        this.plugin.settings.enableFilterMode = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Enable dim mode").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.enableDim).onChange(async (value) => {
        this.plugin.settings.enableDim = value;
        await this.plugin.saveSettings();
      });
    });
    containerEl.createEl("h3", { text: "Advanced (Debug)" });
    containerEl.createEl("p", { text: "Debug settings will appear here." });
  }
};
var TimePunchModal = class extends import_obsidian.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Time Punch" });
    contentEl.createEl("p", { text: "HHmm (\u4F8B: 0930)" });
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
        new import_obsidian.Notice("HHmm\u3060\u3051\u53D7\u3051\u4ED8\u3051\u308B\u3088\uFF08\u4F8B: 0930\uFF09");
        return;
      }
      this.close();
      this.onSubmit(parsed);
    });
    cancelButton.addEventListener("click", () => this.close());
    setTimeout(() => inputEl.focus(), 0);
  }
};
var TimePunchChoiceModal = class extends import_obsidian.Modal {
  constructor(app, baseTime, onSelect) {
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
      { label: "Start 15m before", offset: -15 }
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
};
var RepairConfirmModal = class extends import_obsidian.Modal {
  constructor(app, onSelect) {
    super(app);
    this.onSelect = onSelect;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Repair" });
    contentEl.createEl("p", { text: "\u518D\u751F\u4E2D\u30BF\u30B9\u30AF\u304C2\u3064\u4EE5\u4E0A\u3042\u308A\u307E\u3059\u3002\u4FEE\u5FA9\u3057\u307E\u3059\u304B\uFF1F" });
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
};
var RepairContinueModal = class extends import_obsidian.Modal {
  constructor(app, onSelect) {
    super(app);
    this.onSelect = onSelect;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Repair" });
    contentEl.createEl("p", { text: "\u307E\u30602\u3064\u4EE5\u4E0A\u3042\u308A\u307E\u3059\u3002\u7D9A\u3051\u307E\u3059\u304B\uFF1F" });
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
};
var RepairPickNowModal = class extends import_obsidian.Modal {
  constructor(app, entries, onSelect) {
    super(app);
    this.entries = entries;
    this.onSelect = onSelect;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Repair Target" });
    contentEl.createEl("p", { text: "\u3069\u308C\u3092\u7D42\u4E86\u3055\u305B\u308B\u304B\u9078\u3093\u3067\u304F\u3060\u3055\u3044" });
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
};
var RepairEndModeModal = class extends import_obsidian.Modal {
  constructor(app, onSelect) {
    super(app);
    this.onSelect = onSelect;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Repair End Mode" });
    contentEl.createEl("p", { text: "\u7D42\u4E86\u65B9\u6CD5\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044" });
    const list = contentEl.createDiv({ cls: "tc-repair-list" });
    const inputButton = list.createEl("button", { text: "\u7D42\u4E86\u6642\u523B\u3092\u5165\u529B\uFF08HHmm\uFF09" });
    const estimateButton = list.createEl("button", { text: "\u898B\u7A4D\u3082\u308A\u901A\u308A\u3067\u7D42\u4E86" });
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
};
var HHmmInputModal = class extends import_obsidian.Modal {
  constructor(app, onSelect) {
    super(app);
    this.onSelect = onSelect;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "HHmm Input" });
    contentEl.createEl("p", { text: "HHmm (\u4F8B: 0930)" });
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
        new import_obsidian.Notice("HHmm\u3060\u3051\u53D7\u3051\u4ED8\u3051\u308B\u3088\uFF08\u4F8B: 0930\uFF09");
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
};
var TaskChuteChuteView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.refreshTimer = null;
    this.currentFile = null;
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
  scheduleRefresh() {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      void this.loadAndRender();
    }, 200);
  }
  async loadAndRender() {
    const file = await this.plugin.getTodayLogFile();
    if (!file) return;
    this.currentFile = file;
    const text = await this.plugin.readLogText(file);
    this.render(text);
  }
  render(text) {
    var _a;
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
        type: "doing",
        start: entry.startTime,
        end: void 0
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
      var _a2;
      const row = scheduleList.createDiv({
        cls: `tc-chute-ribbon-row${item.status === "done" ? " is-done" : ""}${item.isNext ? " is-next" : ""}`
      });
      row.createDiv({ cls: "tc-chute-ribbon-time", text: (_a2 = item.time) != null ? _a2 : "--:--" });
      row.createDiv({ cls: "tc-chute-ribbon-label", text: item.title });
    });
    const nowBox = container.createDiv({ cls: "tc-chute-now" });
    const nowLabel = nowBox.createDiv({ cls: "tc-chute-now-label", text: "NOW" });
    if (hasMultipleNow) {
      nowLabel.setText("NOW (Multiple)");
    }
    const nowText = nowBox.createDiv({
      cls: "tc-chute-now-text",
      text: running.length ? (_a = nowParent == null ? void 0 : nowParent.title) != null ? _a : "Running" : "READY"
    });
    const memoArea = nowBox.createEl("textarea", {
      cls: "tc-chute-memo",
      attr: { placeholder: "\u3072\u3068\u3053\u3068\u30E1\u30E2" }
    });
    const memoBtn = nowBox.createEl("button", { text: "Add Memo" });
    const taskList = container.createDiv({ cls: "tc-chute-tasklist" });
    const taskHeader = taskList.createDiv({ cls: "tc-chute-tasklist-head", text: "TASK LIST" });
    const taskBody = taskList.createDiv({ cls: "tc-chute-tasklist-body" });
    parsed.parents.filter((parent) => parent.status === "idle").forEach((parent) => {
      const item = taskBody.createDiv({ cls: "tc-chute-task" });
      item.createEl("div", { cls: "tc-chute-task-title", text: parent.title });
      const meta = buildTaskMeta(parent.title);
      if (meta) {
        item.createEl("div", { cls: "tc-chute-task-meta", text: meta });
      }
      item.addEventListener("click", () => {
        if (hasMultipleNow) {
          void this.plugin["repairMultipleNowFlow"](this.currentFile, null);
          return;
        }
        if (running.length) {
          new import_obsidian.Notice("\u4ECA\u306E\u30BF\u30B9\u30AF\u3092\u7D42\u4E86\u3057\u3066\u304B\u3089");
          return;
        }
        void this.startFromView(parent.lineNo);
      });
    });
    startBtn.addEventListener("click", async () => {
      if (hasMultipleNow) {
        await this.plugin["repairMultipleNowFlow"](this.currentFile, null);
        return;
      }
      if (running.length) {
        new import_obsidian.Notice("\u4ECA\u306E\u30BF\u30B9\u30AF\u3092\u7D42\u4E86\u3057\u3066\u304B\u3089");
        return;
      }
      const confirm = await this.confirmModal("\u4E0A\u304B\u3089\u5B9F\u884C\u3057\u307E\u3059\u304B\uFF1F");
      if (!confirm) return;
      await this.startFirstUnfinished();
    });
    endBtn.addEventListener("click", async () => {
      if (hasMultipleNow) {
        await this.plugin["repairMultipleNowFlow"](this.currentFile, null);
        return;
      }
      await this.endRunning();
    });
    easBtn.addEventListener("click", async () => {
      if (hasMultipleNow) {
        await this.plugin["repairMultipleNowFlow"](this.currentFile, null);
        return;
      }
      await this.endAndStartFromView();
    });
    timeBtn.addEventListener("click", async () => {
      if (hasMultipleNow) {
        await this.plugin["repairMultipleNowFlow"](this.currentFile, null);
        return;
      }
      await this.timePunchFromView();
    });
    repairBtn.addEventListener("click", async () => {
      await this.plugin["repairMultipleNowFlow"](this.currentFile, null);
    });
    memoBtn.addEventListener("click", async () => {
      const value = memoArea.value.trim();
      if (!value) return;
      await this.addMemo(value);
      memoArea.value = "";
    });
  }
  async confirmModal(message) {
    return new Promise((resolve) => {
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
  async startFromView(parentLine) {
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
  async startFirstUnfinished() {
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
  async endRunning() {
    if (!this.currentFile) return;
    await this.plugin.applyPatch(this.currentFile, (text) => {
      const lines = text.split("\n");
      const parsed = parseLog(lines);
      let running = findRunningChildren(parsed);
      if (!running.length) {
        const fallback = findAllUnfinishedHourglass(lines).map((entry) => ({
          lineNo: entry.hourglassLineNo,
          raw: entry.hourglassLineText,
          type: "doing",
          start: entry.startTime,
          end: void 0
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
  async endAndStartFromView() {
    if (!this.currentFile) return;
    await this.plugin.applyPatch(this.currentFile, (text) => {
      const lines = text.split("\n");
      const parsed = parseLog(lines);
      let running = findRunningChildren(parsed);
      if (!running.length) {
        const fallback = findAllUnfinishedHourglass(lines).map((entry) => ({
          lineNo: entry.hourglassLineNo,
          raw: entry.hourglassLineText,
          type: "doing",
          start: entry.startTime,
          end: void 0
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
  async timePunchFromView() {
    if (!this.currentFile) return;
    const modal = new TimePunchModal(this.app, async (timeStr) => {
      await this.plugin.applyPatch(this.currentFile, (text) => {
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
          void this.plugin.applyPatch(this.currentFile, (innerText) => {
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
  async addMemo(value) {
    if (!this.currentFile) return;
    await this.plugin.applyPatch(this.currentFile, (text) => {
      const lines = text.split("\n");
      const parsed = parseLog(lines);
      let running = findRunningChildren(parsed);
      if (!running.length) {
        const fallback = findAllUnfinishedHourglass(lines).map((entry) => ({
          lineNo: entry.hourglassLineNo,
          raw: entry.hourglassLineText,
          type: "doing",
          start: entry.startTime,
          end: void 0
        }));
        running = fallback;
      }
      if (!running.length) return text;
      const parent = findParentByChild(parsed, running[0].lineNo);
      if (!parent) return text;
      const insertAt = parent.children.length ? parent.children[parent.children.length - 1].lineNo + 1 : parent.lineNo + 1;
      const nextLines = lines.slice();
      nextLines.splice(insertAt, 0, `  - \u{1F4DD} ${value}`);
      return nextLines.join("\n");
    });
    this.scheduleRefresh();
  }
};
var filterRefreshEffect = import_state.StateEffect.define();
function buildFilterModeExtension(plugin) {
  return import_view.ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.decorations = buildFilterDecorations(plugin, view);
      }
      update(update) {
        if (update.docChanged || update.viewportChanged || update.selectionSet || update.transactions.some((tr) => tr.effects.length)) {
          this.decorations = buildFilterDecorations(plugin, update.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations
    }
  );
}
function buildFilterDecorations(plugin, view) {
  var _a, _b;
  if (!plugin.settings.enableFilterMode) {
    return import_view.Decoration.none;
  }
  const doc = view.state.doc;
  const filePath = (_b = (_a = plugin.app.workspace.getActiveFile()) == null ? void 0 : _a.path) != null ? _b : "";
  const { parents, doneSections } = collectParentRanges(doc.toString());
  const builder = new import_state.RangeSetBuilder();
  const entries = [];
  doneSections.forEach((section) => {
    const sectionDeco = import_view.Decoration.line({ attributes: { class: "tc-section tc-done" } });
    entries.push({ pos: section.from, deco: sectionDeco });
  });
  parents.forEach((parent) => {
    var _a2;
    const key = buildParentKey(filePath, parent.lineNo, parent.tcId);
    const isCollapsed = parent.status === "done" ? (_a2 = plugin.collapsedByKey.get(key)) != null ? _a2 : true : false;
    if (parent.status === "done") {
      const cls = `tc-parent tc-done ${isCollapsed ? "tc-collapsed" : "tc-expanded"}`;
      const lineDeco = import_view.Decoration.line({ attributes: { class: cls } });
      entries.push({ pos: parent.from, deco: lineDeco });
      const widget = import_view.Decoration.widget({
        widget: new CollapseToggleWidget(plugin, key, isCollapsed),
        side: -1
      });
      entries.push({ pos: parent.to, deco: widget });
    } else if (parent.status === "running" || parent.status === "todo") {
      const lineDeco = import_view.Decoration.line({ attributes: { class: "tc-parent" } });
      entries.push({ pos: parent.from, deco: lineDeco });
    }
    if (parent.status === "done" && isCollapsed) {
      parent.children.forEach((child) => {
        const childDeco = import_view.Decoration.line({ attributes: { class: "tc-child tc-hidden" } });
        entries.push({ pos: child.from, deco: childDeco });
      });
    } else {
      parent.children.forEach((child) => {
        const childDeco = import_view.Decoration.line({ attributes: { class: "tc-child" } });
        entries.push({ pos: child.from, deco: childDeco });
      });
    }
  });
  entries.sort((a, b) => a.pos - b.pos);
  entries.forEach((entry) => builder.add(entry.pos, entry.pos, entry.deco));
  return builder.finish();
}
var CollapseToggleWidget = class extends import_view.WidgetType {
  constructor(plugin, key, collapsed) {
    super();
    this.plugin = plugin;
    this.key = key;
    this.collapsed = collapsed;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "tc-collapse-toggle";
    span.textContent = this.collapsed ? "\u25B8" : "\u25BE";
    span.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = !this.collapsed;
      span.textContent = next ? "\u25B8" : "\u25BE";
      this.plugin.collapsedByKey.set(this.key, next);
      this.plugin.refreshFilterDecorations();
    });
    return span;
  }
};
function collectParentRanges(docText) {
  const lines = docText.split("\n");
  const parents = [];
  const doneSections = [];
  const sectionHeaders = [];
  let offset = 0;
  let current = null;
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
        children: []
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
    const childLines = parent.children.map((child) => {
      var _a;
      return (_a = lines[child.lineIndex]) != null ? _a : "";
    });
    parent.status = getParentStatus(childLines);
  });
  sectionHeaders.forEach((section, idx) => {
    var _a, _b;
    const nextLine = (_b = (_a = sectionHeaders[idx + 1]) == null ? void 0 : _a.lineNo) != null ? _b : lines.length;
    const sectionParents = parents.filter((p) => p.lineNo > section.lineNo && p.lineNo < nextLine);
    if (sectionParents.length && sectionParents.every((p) => p.status === "done")) {
      doneSections.push(section);
    }
  });
  return { parents, doneSections };
}
function getParentStatus(childLines) {
  if (childLines.length === 0) return "todo";
  const normalized = childLines.map((line) => line.replace(/\uFE0F/g, ""));
  const logLines = normalized.filter(
    (line) => line.includes("\u231B") || line.includes("\u23F3") || line.includes("\u2714") || line.includes("\u2705") || line.includes("\u2713")
  );
  if (logLines.length === 0) return "todo";
  const latest = logLines[logLines.length - 1];
  if (latest.includes("\u231B") || latest.includes("\u23F3")) return "running";
  if (latest.includes("\u2714") || latest.includes("\u2705") || latest.includes("\u2713")) return "done";
  return "todo";
}
function buildParentKey(path, lineNo, tcId) {
  if (tcId) return `tcid:${tcId}`;
  return `${path}#L${lineNo}`;
}
function getEditorViewFromMarkdownView(view) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const editorAny = view.editor;
  return (_i = (_h = (_e = (_c = (_a = editorAny == null ? void 0 : editorAny.cm) != null ? _a : editorAny == null ? void 0 : editorAny.cmEditor) != null ? _c : (_b = editorAny == null ? void 0 : editorAny.cm) == null ? void 0 : _b.view) != null ? _e : (_d = editorAny == null ? void 0 : editorAny.cm) == null ? void 0 : _d.cm) != null ? _h : (_g = (_f = editorAny == null ? void 0 : editorAny.cm) == null ? void 0 : _f.cm) == null ? void 0 : _g.view) != null ? _i : null;
}
function parseLog(lines) {
  const parents = [];
  let currentParent = null;
  lines.forEach((raw, lineNo) => {
    if (isParentLine(raw)) {
      currentParent = {
        lineNo,
        raw,
        title: raw.replace(/^\s*-\s*/, "").trim(),
        children: [],
        status: "idle"
      };
      parents.push(currentParent);
      return;
    }
    if (currentParent && (isChildLine(raw) || raw.includes("\u231B") || raw.includes("\u2714\uFE0F") || raw.includes("\u{1F4DD}"))) {
      const child = parseChildLine(raw, lineNo);
      currentParent.children.push(child);
    }
  });
  for (const parent of parents) {
    const runningChild = parent.children.find((child) => child.type === "doing" && !child.end);
    const runningByRaw = parent.children.find((child) => {
      const normalized = child.raw.replace(/\uFE0F/g, "");
      if (!(normalized.includes("\u231B") || normalized.includes("\u23F3"))) return false;
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
      return normalized.includes("\u2714") || normalized.includes("\u2705") || normalized.includes("\u2713");
    });
    if (doneChild || doneByRaw) {
      parent.status = "done";
    }
  }
  return { parents };
}
function findParentByLine(parsed, lineNo) {
  var _a;
  return (_a = parsed.parents.find((parent) => parent.lineNo === lineNo)) != null ? _a : null;
}
function selectTargetParent(parsed, cursorLine) {
  var _a;
  let targetParent = cursorLine != null ? findParentByLine(parsed, cursorLine) : null;
  if (!targetParent) {
    targetParent = (_a = parsed.parents.find((parent) => parent.status !== "done")) != null ? _a : null;
  }
  return targetParent;
}
function findParentByChild(parsed, childLineNo) {
  var _a;
  return (_a = parsed.parents.find((parent) => parent.children.some((child) => child.lineNo === childLineNo))) != null ? _a : null;
}
function findRunningChildren(parsed) {
  const running = [];
  parsed.parents.forEach((parent) => {
    parent.children.forEach((child) => {
      if (child.type === "doing" && !child.end) {
        running.push(child);
      }
    });
  });
  return running;
}
function findLatestUnfinishedHourglassChild(parent) {
  for (let i = parent.children.length - 1; i >= 0; i -= 1) {
    const child = parent.children[i];
    if (child.type === "doing" && !child.end) return child;
  }
  return null;
}
function findAllUnfinishedHourglass(lines) {
  const results = [];
  let currentParent = null;
  lines.forEach((line, lineNo) => {
    if (isParentLine(line)) {
      currentParent = { lineNo, text: line.replace(/^\s*-\s*/, "").trim() };
      return;
    }
    if (!currentParent) return;
    const trimmed = line.trim();
    const content = trimmed.replace(/^-\\s*/, "");
    const normalized = content.replace(/\uFE0F/g, "");
    if (!(normalized.includes("\u231B") || normalized.includes("\u23F3"))) return;
    const { start, end } = parseTimeRange(content);
    if (!start || end) return;
    results.push({
      hourglassLineNo: lineNo,
      hourglassLineText: line,
      parentLineNo: currentParent.lineNo,
      parentText: currentParent.text,
      startTime: start
    });
  });
  return results;
}
function buildScheduleItems(parsed) {
  var _a;
  const items = parsed.parents.map((parent) => {
    const time = extractTimeFromText(parent.title);
    const isMust = /must|必須|★|⭐/i.test(parent.title);
    return { title: parent.title, time, status: parent.status, isMust };
  }).filter((item) => item.time || item.isMust).sort((a, b) => {
    var _a2, _b;
    const aMin = a.time ? (_a2 = toMinutes(a.time)) != null ? _a2 : 9999 : 9999;
    const bMin = b.time ? (_b = toMinutes(b.time)) != null ? _b : 9999 : 9999;
    return aMin - bMin;
  });
  const nowMin = (_a = toMinutes(nowTimeString())) != null ? _a : 0;
  const nextItem = items.find((item) => {
    var _a2;
    return item.status !== "done" && ((_a2 = toMinutes(item.time)) != null ? _a2 : 9999) >= nowMin;
  });
  return items.map((item) => ({ ...item, isNext: item === nextItem }));
}
function insertDoingLine(lines, parent, startTime) {
  const nextLines = lines.slice();
  const insertAt = parent.children.length ? parent.children[parent.children.length - 1].lineNo + 1 : parent.lineNo + 1;
  const line = `  - \u231B ${startTime}\u2013`;
  nextLines.splice(insertAt, 0, line);
  return nextLines;
}
function buildDoneLine(start, end, durationMin) {
  const minutes = Math.max(1, durationMin);
  return `  - \u2714\uFE0F ${start}\u2013${end} +${minutes}m`;
}
function parseChildLine(raw, lineNo) {
  const trimmed = raw.trim();
  const content = trimmed.replace(/^-\\s*/, "");
  const normalized = content.replace(/\uFE0F/g, "");
  if (normalized.startsWith("\u231B") || normalized.startsWith("\u23F3")) {
    const { start, end } = parseTimeRange(content);
    return { lineNo, raw, type: "doing", start, end };
  }
  if (normalized.startsWith("\u2714") || normalized.startsWith("\u2705") || normalized.startsWith("\u2713")) {
    const { start, end, durationMin } = parseDoneLine(content);
    return { lineNo, raw, type: "done", start, end, durationMin };
  }
  if (normalized.startsWith("\u{1F4DD}")) {
    return { lineNo, raw, type: "memo" };
  }
  return { lineNo, raw, type: "other" };
}
function parseTimeRange(text) {
  var _a;
  const times = (_a = text.match(/\b\d{1,2}:\d{2}\b/g)) != null ? _a : [];
  if (times.length === 0) return { start: void 0, end: void 0 };
  return { start: times[0], end: times[1] };
}
function parseDoneLine(text) {
  const time = parseTimeRange(text);
  const durationMatch = text.match(/\+(\d+)m/);
  const durationMin = durationMatch ? Number(durationMatch[1]) : void 0;
  return { ...time, durationMin };
}
function parseEstimateMinutes(text) {
  const match = text.match(/\((\d+)\s*m?\)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}
function extractTimeFromText(text) {
  const match = text.match(/\b(\d{1,2}:\d{2})\b/);
  return match ? match[1] : null;
}
function selectNextParentForEndStart(parsed, runningChildLine) {
  var _a, _b, _c;
  const scheduled = buildScheduleItems(parsed).filter((item) => item.time).map((item) => {
    var _a2;
    return {
      ...item,
      minutes: (_a2 = toMinutes(item.time)) != null ? _a2 : 9999
    };
  });
  const nowMin = (_a = toMinutes(nowTimeString())) != null ? _a : 0;
  const scheduledNext = scheduled.filter((item) => item.minutes >= nowMin).sort((a, b) => a.minutes - b.minutes)[0];
  if (scheduledNext) {
    return (_b = parsed.parents.find((p) => p.title === scheduledNext.title)) != null ? _b : null;
  }
  const must = parsed.parents.filter((p) => /must|必須|★|⭐/i.test(p.title) && p.status !== "done");
  if (must.length) return must[0];
  const currentParentIndex = parsed.parents.findIndex(
    (parent) => parent.children.some((child) => child.lineNo === runningChildLine)
  );
  if (currentParentIndex >= 0) {
    const nextParent = parsed.parents.slice(currentParentIndex + 1).find((parent) => parent.status !== "done");
    if (nextParent) return nextParent;
  }
  return (_c = parsed.parents.find((parent) => parent.status !== "done")) != null ? _c : null;
}
function buildTaskMeta(title) {
  const time = extractTimeFromText(title);
  const estimate = parseEstimateMinutes(title);
  const parts = [];
  if (time) parts.push(time);
  if (estimate) parts.push(`${estimate}m`);
  return parts.length ? parts.join(" \xB7 ") : null;
}
function isParentLine(line) {
  return /^-\s+/.test(line);
}
function isChildLine(line) {
  if (/^\s+[-*]\s+/.test(line)) return true;
  const trimmed = line.trim();
  return trimmed.startsWith("\u231B") || trimmed.startsWith("\u2714\uFE0F") || trimmed.startsWith("\u{1F4DD}") || trimmed.startsWith("\u2714") || trimmed.startsWith("\u2705") || trimmed.startsWith("\u2713");
}
function isDoneLine(line) {
  const trimmed = line.trim().replace(/\uFE0F/g, "");
  return trimmed.startsWith("\u2714") || trimmed.startsWith("\u2705") || trimmed.startsWith("\u2713");
}
function getParentLineIndex(editor, fromLine) {
  for (let line = fromLine; line >= 0; line -= 1) {
    const text = editor.getLine(line);
    if (isParentLine(text)) return line;
  }
  return null;
}
function getParentBlockRange(editor, parentLine) {
  let end = parentLine;
  const last = editor.lastLine();
  for (let line = parentLine + 1; line <= last; line += 1) {
    const text = editor.getLine(line);
    if (isParentLine(text)) break;
    end = line;
  }
  return { start: parentLine, end };
}
function recalcDoneLine(line) {
  const normalized = line.replace(/\uFE0F/g, "");
  if (!isDoneLine(normalized)) return null;
  const { start, end } = parseTimeRange(normalized);
  if (!start || !end) return null;
  const duration = diffMinutesWithWrap(start, end);
  const cleaned = line.replace(/\s\+\d+m/g, "");
  return cleaned.replace(/(✔\s*|\u2714\s*|\u2705\s*)(\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2})/, `$1$2 +${duration}m`);
}
function diffMinutes(start, end) {
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (startMin == null || endMin == null) return 0;
  const diff = endMin - startMin;
  return diff >= 0 ? Math.round(diff) : 0;
}
function diffMinutesWithWrap(start, end) {
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (startMin == null || endMin == null) return 0;
  const diff = endMin - startMin;
  if (diff >= 0) return Math.round(diff);
  return Math.round(diff + 24 * 60);
}
function toMinutes(time) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}
function parseHHmmToTime(value) {
  if (!/^\d{4}$/.test(value)) return null;
  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(2, 4));
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
function isValidTime(time) {
  return toMinutes(time) != null;
}
function shiftTime(time, offsetMinutes) {
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
function findLatestDoneTime(lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const raw = lines[i].trim();
    if (!isChildLine(lines[i])) continue;
    const content = raw.replace(/^-\\s*/, "");
    const normalized = content.replace(/\uFE0F/g, "");
    if (!(normalized.startsWith("\u2714") || normalized.startsWith("\u2705") || normalized.startsWith("\u2713"))) continue;
    const { start, end } = parseDoneLine(content);
    const time = end || start;
    if (time) return time;
  }
  return null;
}
function nowTimeString(date = /* @__PURE__ */ new Date()) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function parseDate(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}
function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
function normalizePath(path) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}
//# sourceMappingURL=main.js.map
