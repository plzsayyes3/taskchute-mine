# TaskLiner

TaskLiner は、Obsidian 上で1行タスクを開始・終了しながら記録するための個人用 TaskChute 系プラグインです。

このリポジトリ `plzsayyes3/taskliner` を、**開発・検証・配布の唯一の正本**として扱います。Vault 内のプラグインフォルダを直接開発場所にはしません。

現在のプラグイン ID は `taskliner`、リリース版は `0.1.1` です。デスクトップ専用ではなく、モバイルでも利用できます。

---

## 基本コンセプト

TaskLiner は Markdown のタスク行をそのまま記録媒体として使います。

未開始:

```md
- [ ] タスク名
```

開始後:

```md
- [/] タスク名 【09:00-】
```

終了後:

```md
- [x] タスク名 【09:00-09:25 / 25m】
```

開始・終了時刻は `HH:mm` へ正規化され、終了時には経過時間も自動計算されます。日をまたぐタスクも翌日分として計算します。

TaskLiner の基本は、**Markdown がデータ本体であり、プラグインはその行を操作する**という構成です。

---

## インストール

### BRAT を使う場合

1. Obsidian に BRAT をインストールする
2. BRAT の `Add Beta plugin` から次のリポジトリを追加する

```text
plzsayyes3/taskliner
```

3. TaskLiner を有効化する

GitHub Releases が配布元です。現在の `0.1.1` Release には以下が含まれます。

- `main.js`
- `manifest.json`
- `styles.css`

`data.json` は各 Vault 固有の設定なので、配布・Git 管理の対象外です。

### 手動で入れる場合

Release の3ファイルを、Vault の以下のフォルダへ配置します。

```text
.obsidian/plugins/taskliner/
```

その後 Obsidian で TaskLiner を有効化します。

---

## 最初に設定する項目

Obsidian の `設定 → コミュニティプラグイン → TaskLiner` から設定します。

主な初期値は次の通りです。

| 設定 | 初期値 | 用途 |
| --- | --- | --- |
| Log folder path | `taskchute-line` | TaskLiner の日別ログ |
| Template folder path | `templates` | タスクテンプレート |
| Techo folder path | `techo` | 月別 Techo ファイル |
| Techo import header | `## techoからインポート` | Techo 取り込み先見出し |
| Techo import mode | `append` | `append` / `replace` |
| Daily note folder | `01_Daily` | 通常のデイリーノート |
| Self Twitter header | `#### Self Twitter` | デイリー内の Self Twitter 見出し |
| Roll file path | `11_notes/MT ROLL.md` | ROLL LIST の保存ファイル |

そのほか、Dashboard、Status Bar、Top Bar、モバイル用ボタン、スクロールビュー自動起動、チェックボックスタップ操作などを設定できます。

---

## 基本的な使い方

### 1. タスクを開始する

カーソルを対象タスクに置いて、コマンドパレットから `タスクの開始` を実行します。

```md
- [ ] 資料を作る
```

が、たとえば次のようになります。

```md
- [/] 資料を作る 【09:10-】
```

別のタスクがすでに実行中の場合は、そのタスクを終了してから新しいタスクを開始します。

### 2. タスクを終了する

実行中の行で `タスクの終了` を実行します。

```md
- [x] 資料を作る 【09:10-09:42 / 32m】
```

### 3. 終了と次タスク開始を連続で行う

`タスクの終了・開始` を使うと、現在のタスクを終了し、その次にある開始可能なタスクへ同じ時刻でつなげられます。

### 4. 前タスクの終了時刻から開始する

`[x] 前回の終了時刻から開始` は、直前に記録された終了時刻を開始時刻として使います。

記録漏れを後から補うときに使います。

### 5. チェックボックスを直接タップする

設定で `チェックボックスタップでのタスク操作を有効化` を ON にしている場合、Markdown のチェックボックスから直接操作できます。

- 未開始を短くタップ → 開始
- 実行中を短くタップ → 終了
- 未開始を長押し → 前回終了時刻から開始
- 実行中 / 完了済みを長押し → 未開始へ戻す

長押し判定は現在、タッチ操作で約450ms、デスクトップで約900msです。

---

## 日付・持ち越し操作

### 日付指定で先送り

`タスクを先送り（日付指定）` で日付を選ぶと、現在行を先送り扱いにし、指定日の TaskLiner ノートへタスクを追加します。

### 翌日へ移動

`現在タスクを翌日のノートに移動` は、現在行の実行状態をリセットして翌日のノートへ移動し、現在のノートからは削除します。

### 昨日の未完了を持ち越す

`昨日の未完了タスクの持ち越し` は、前日の TaskLiner ログから未完了の親タスクと、それに属する子行・メモを現在位置へ取り込みます。

---

## Techo 連携

月別ファイルを次の形で配置します。

```text
techo/2026-09.md
```

日付見出しは次の形式を認識します。

```md
## 9月10日(木)
- 項目A
- 項目B
```

`## 09月10日(木)` のようなゼロ埋め形式にも対応しています。

`手帳からインポート` を実行すると、現在開いている `YYYY-MM-DD.md` のファイル名を対象日として使います。該当日名のファイルでない場合は今日の日付を使います。

既定では次の見出しへ追記します。

```md
## techoからインポート
```

`append` モードでは既存項目との重複を避けて追記し、`replace` モードではこのセクションを置換します。

---

## テンプレート

`Template folder path` で指定したフォルダ内の Markdown をテンプレートとして読み込みます。

テンプレート内の `##`〜`######` の各見出しを1つの候補として扱い、`テンプレート挿入` から複数選択して現在のノート末尾へ挿入できます。

---

## ROLL LIST

`Roll file path` で指定した Markdown 内から、次のセクションを探します。

```md
### ROLL LIST
- 項目A
- 項目B
- 項目C
```

`ロールリピート` を実行すると候補を複数選択でき、今日の TaskLiner ノートへ挿入します。

---

## 過去タスクのサジェスト

TaskLiner は過去の実行記録からタスク名のインデックスを作り、再利用できます。

- `サジェスト用インデックスを再構築`
- `過去タスクをサジェストして挿入`

インデックスは設定データ内に保持します。

サジェスト挙動を調査するときだけ `Suggest debug logs` を ON にすると、Developer Console に詳細ログを出せます。

---

## Dashboard / Status Bar / Top Bar

### Dashboard

ログファイルを開いているとき、エディタ上部へ現在時刻・実行中タスク・完了数・残り見積り・推定終了時刻などを表示します。

前日・今日・翌日へのナビゲーションもあります。

### Status Bar

画面下部のステータスバーへ、現在のタスクと進捗サマリーを表示します。

### Top Bar

Obsidian 画面上部へ常時表示するバーです。

設定により、

- `◀ 今日 ▶` ナビゲーション
- モバイル表示位置の調整
- Lucide アイコンを使ったカスタムボタン2個
- 任意の Obsidian コマンド ID の割り当て

ができます。

---

## Calendar View / Scroll View

TaskLiner には独自ビューがあります。

- `カレンダービューを開く (Open Calendar View)`
- `スクロールエディタを開く (Open Scroll Editor)`

モバイルでは、設定により Obsidian 起動時に Scroll View を自動で開くこともできます。

---

## 主なコマンド

### タスク実行

| コマンド | 用途 |
| --- | --- |
| `[x] 前回の終了時刻から開始` | 前回の終了時刻を開始時刻にする |
| `タスクの開始` | 現在行を開始 |
| `タスクの終了` | 現在行を終了 |
| `タスクの終了・開始` | 現在行を終了し次行を開始 |
| `タスクをスキップ` | 現在行を保留扱いにする |
| `タスクを先送り（日付指定）` | 指定日に追加する |
| `タスクの再開` | 終了時刻を外して再開する |
| `時刻の強制打刻` | `HHmm` 形式で開始/終了時刻を指定する |
| `タスクステータスのトグル` | タスク状態を順番に切り替える |
| `現在のタスクを終了し、一番上の未実行行を開始` | 実行中を終了し最上位の未開始タスクを開始 |

### 日別ログ・取り込み

| コマンド | 用途 |
| --- | --- |
| `今日のノートを開く` | 今日の TaskLiner ノートを開く |
| `前日のノートを開く` | 前日へ移動 |
| `翌日のノートを開く` | 翌日へ移動 |
| `手帳からインポート` | Techo 月別ファイルから取り込む |
| `昨日の未完了タスクの持ち越し` | 前日の未完了を取り込む |
| `現在タスクを翌日のノートに移動` | タスクを翌日へ移す |
| `テンプレート挿入` | テンプレートの複数セクションを挿入 |
| `ロールリピート` | ROLL LIST から今日の項目を選ぶ |

### 編集・補助

| コマンド | 用途 |
| --- | --- |
| `タスクの所要時間の再計算` | 現在行の時間を再計算 |
| `全タスクの所要時間の再計算` | ノート全体を再計算 |
| `メモ行の追加` | 子インデントのメモ行を追加 |
| `現在タスクを実行中タスクの直下に複製` | 現在行を複製して実行中タスク直下へ |
| `現在タスクを実行中タスクの直下に移動` | 現在行を実行中タスク直下へ移動 |
| `現在の行を削除` | カーソル行を削除 |
| `時刻を -1分調整` | 現在行の対象時刻を1分戻す |
| `時刻を +1分調整` | 現在行の対象時刻を1分進める |
| `過去タスクをサジェストして挿入` | 履歴からタスクを検索して挿入 |
| `サジェスト用インデックスを再構築` | 過去タスク索引を再構築 |

---

## 現在のソース構成

TaskLiner は、元の巨大な `src/main.ts` から責務ごとに段階的に分離しています。

```text
src/
├─ core/
│  ├─ task-line.ts
│  ├─ techo.ts
│  └─ history.ts
├─ services/
│  ├─ daily-note.ts
│  ├─ techo.ts
│  ├─ history.ts
│  ├─ history-suggest.ts
│  ├─ history-suggest-controller.ts
│  ├─ dashboard-ui.ts
│  ├─ task-execution.ts
│  ├─ task-planning.ts
│  └─ editor-operations.ts
├─ ui/
│  ├─ task-history-suggest-modal.ts
│  ├─ task-modals.ts
│  ├─ dashboard-panel.ts
│  ├─ task-chute-calendar-view.ts
│  └─ task-chute-scroll-view.ts
├─ commands/
│  └─ register-commands.ts
├─ lifecycle/
│  ├─ register-checkbox-hook.ts
│  └─ register-ui-runtime.ts
├─ editor/
│  └─ task-chute-style-extension.ts
├─ settings.ts
├─ settings-tab.ts
└─ main.ts
```

`main.ts` は現在、プラグインの初期化・各 Service の接続・既存呼び出しとの互換ラッパーが中心です。

---

## ここまでの移行・リファクタ記録

### 1. 正本リポジトリへの移行

旧実装を、実際に使われていた Vault 内プラグインと履歴リポジトリから復元しました。

- historical source: `plzsayyes3/catch-all-notebook`
- production reference: `plzsayyes3/mynotebook/.obsidian-job/plugins/taskliner`
- canonical repository: `plzsayyes3/taskliner`
- plugin ID: `taskliner`
- baseline release: `0.1.1`

復元直後は生成 `main.js` が実運用版と一致することを確認してから、リファクタを開始しています。

### 2. 配布経路の整理

GitHub Releases を配布元とし、BRAT から `plzsayyes3/taskliner` を参照する構成へ移行しました。

`0.1.1` は GitHub Actions から公開済みです。

Release tag は `manifest.json` の version と**完全一致**させます。現在なら:

```text
0.1.1
```

です。`v0.1.1` ではありません。

### 3. behavior-preserving refactor

機能変更を混ぜず、既存動作を保ったまま以下を順次分離しました。

- TaskLine / 時刻処理を `core/task-line.ts` へ分離
- 設定データと設定画面を分離
- Daily Note 処理を Service 化
- Techo の解析ロジックと Service を分離
- 履歴インデックスを core / Service 化
- 過去タスクサジェスト Modal / Service / Controller を分離
- コマンド登録を `commands/register-commands.ts` へ分離
- チェックボックス操作と UI runtime 登録を lifecycle へ分離
- Calendar View / Scroll View を独立モジュール化
- Dashboard Panel と Dashboard / Status / Top Bar 処理を分離
- Modal 群を `ui/task-modals.ts` へ分離
- CodeMirror の行装飾を `editor/task-chute-style-extension.ts` へ分離
- タスク開始・終了・スキップ等を `TaskExecutionService` へ分離
- 持ち越し・テンプレート・ROLL・翌日移動を `TaskPlanningService` へ分離
- 再計算・メモ・行移動等を `EditorOperationsService` へ分離

直近の整理は PR #15〜#20 で、TypeScript typecheck の常設から各 Service 抽出まで行っています。

### 4. 現在の安全基準

通常 CI は次の順で実行します。

```text
Regression tests
→ Typecheck
→ Build
```

リファクタ時は、**機能変更とファイル分割を同じ変更に混ぜない**ことを原則とします。

---

## 開発

依存関係をインストール:

```sh
npm install
```

開発ビルド:

```sh
npm run dev
```

回帰テスト:

```sh
npm test
```

TypeScript 全体チェック:

```sh
npm run typecheck
```

Production build:

```sh
npm run build
```

現在は `npm run typecheck` も通常 CI の gate です。

`main.js` は生成物であり、Git では管理しません。

---

## リリース

Release workflow は任意の tag push で起動しますが、tag 名と `manifest.json` の version が一致しない場合は失敗します。

例:

```sh
# manifest.json が 0.1.2 の場合
git tag 0.1.2
git push origin 0.1.2
```

成功すると、GitHub Release に次の3ファイルを公開します。

```text
main.js
manifest.json
styles.css
```

バージョンを上げるときは、少なくとも `manifest.json` と配布方針を確認してから tag を作成します。

---

## 今後の方針

現在は大規模な単一ファイル状態から、安全な責務分離まで完了しています。

次の整理候補は、`main.ts` に残した互換ラッパーを、コマンド・lifecycle・UI 側から各 Service を直接呼ぶ構造へ段階的に置き換えることです。

ただし、行数を減らすこと自体を目的にはしません。**実際の Vault での動作を壊さないことを優先**します。

詳細な初期移行記録は `MIGRATION.md` と Git 履歴を参照してください。
