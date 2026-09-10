# TaskLiner migration record

この文書は、TaskLiner を Vault 内の直接開発から独立リポジトリへ移行し、その後 behavior-preserving refactor を進めた記録です。

現在の正本は:

```text
plzsayyes3/taskliner
```

です。

## Goal

旧 `taskchute-mine` / Vault 内 TaskLiner 実装から、次の状態へ移行することを目的としました。

- GitHub リポジトリを開発の正本にする
- plugin ID `taskliner` を維持する
- 実運用版と同じ挙動から移行を始める
- GitHub Actions で build / test / typecheck を再現可能にする
- GitHub Releases + BRAT で配布する
- その後、巨大な `src/main.ts` を挙動を変えずに分割する

## Production baseline

2026-09-09 時点の実運用参照元:

```text
plzsayyes3/mynotebook/.obsidian-job/plugins/taskliner/
```

Historical recovery source:

```text
plzsayyes3/catch-all-notebook
```

移行開始時に確認した baseline:

- plugin ID: `taskliner`
- version: `0.1.1`
- recovered `src/main.ts` blob: `97f9ec3d667f7cf8d12a8a92c4d6c33418e1f502`
- production `main.js` blob: `1845cebc52313c2217d3f703af4029c51959c456`
- production `styles.css` blob: `043dbc70c178ae390c72d5548f2ca316d6250ac6`

復元した source を historical build configuration で bundle し、生成された `main.js` が production artifact と一致することを確認してから refactor を開始しました。

## Migration completed

- [x] plugin ID `taskliner` を維持
- [x] historical source / build configuration を復元
- [x] production `main.js` との build parity を確認
- [x] generated `main.js`、runtime `data.json`、`node_modules` 等を正本から除外
- [x] `plzsayyes3/taskliner` を canonical repository として使用
- [x] migration branch を main へ統合
- [x] Release workflow を整備
- [x] `0.1.1` Release を公開
- [x] Release asset を `main.js` / `manifest.json` / `styles.css` に統一
- [x] BRAT から canonical repository を参照する構成へ切替
- [x] refactor を migration と分離して開始

## Release rule

現在の Release workflow は、push された tag 名と `manifest.json` の version の完全一致を要求します。

例:

```text
manifest.json: 0.1.1
tag:           0.1.1
```

`v0.1.1` のような prefix 付き tag は、manifest が `0.1.1` の場合は一致しません。

Release assets:

```text
main.js
manifest.json
styles.css
```

`data.json` は Vault ごとの runtime settings のため配布しません。

## Refactor principle

移行後の最重要ルールは、**behavior-preserving refactor と機能変更を混ぜない**ことです。

各抽出は可能な限り次の流れで検証します。

```text
Regression tests
→ Typecheck
→ Build
→ PR
→ main merge
→ main CI
```

途中で extraction script / workflow を使う場合も、guard を置き、検証成功後に一時ファイルを自己削除する形を基本としています。

## Refactoring completed

### Core

- `src/core/task-line.ts`
  - TaskLine parse / serialize
  - time normalization
  - elapsed time
  - ±1 minute adjustment
- `src/core/techo.ts`
  - Techo header normalization
  - date section extraction
  - append / replace merge
- `src/core/history.ts`
  - history normalization
  - title normalization
  - index update

### Settings

- `src/settings.ts`
- `src/settings-tab.ts`

### Services

- `src/services/daily-note.ts`
- `src/services/techo.ts`
- `src/services/history.ts`
- `src/services/history-suggest.ts`
- `src/services/history-suggest-controller.ts`
- `src/services/dashboard-ui.ts`
- `src/services/task-execution.ts`
- `src/services/task-planning.ts`
- `src/services/editor-operations.ts`

### UI / lifecycle / editor

- `src/ui/task-history-suggest-modal.ts`
- `src/ui/task-modals.ts`
- `src/ui/dashboard-panel.ts`
- `src/ui/task-chute-calendar-view.ts`
- `src/ui/task-chute-scroll-view.ts`
- `src/lifecycle/register-checkbox-hook.ts`
- `src/lifecycle/register-ui-runtime.ts`
- `src/editor/task-chute-style-extension.ts`
- `src/commands/register-commands.ts`

## Recent stabilization work

PR #15〜#20 では、次を連続して main へ統合しました。

- TypeScript typecheck の全体成功と CI gate 化
- Modal 群の分離
- CodeMirror line decoration の分離
- TaskExecutionService の抽出
- TaskPlanningService の抽出
- EditorOperationsService の抽出

各 PR は regression tests / typecheck / build を通してから merge しています。

## Current state

`src/main.ts` は、以前の巨大な単一実装から、現在は主に以下を担当する状態まで縮小しています。

- plugin lifecycle
- settings / service initialization
- command / lifecycle / UI registration
- service 間 wiring
- 既存呼び出し面を維持する compatibility wrappers

現時点では、互換ラッパーを無理に削除するよりも、実 Vault での安定性を優先しています。

## Next candidates

次の候補は、command / lifecycle / UI 側から Service を直接参照できる境界を作り、`main.ts` の compatibility wrappers を段階的に減らすことです。

ただし、行数削減自体は目的ではありません。

優先順位は常に:

1. 実運用を壊さない
2. test / typecheck / build を通す
3. 1 PR = 1責務
4. そのうえで構造を薄くする

です。

実際の使い方、コマンド、設定、開発・リリース手順は `README.md` を参照してください。
