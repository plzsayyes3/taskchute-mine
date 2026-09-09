# TaskLiner migration

## Goal

Convert this repository from the old `taskchute-mine` implementation into the canonical TaskLiner development and distribution repository.

Target repository name: `taskliner`

Target plugin ID: `taskliner`

## Production reference

The current production plugin is the copy used by `plzsayyes3/mynotebook`:

`.obsidian-job/plugins/taskliner/`

Verified production artifacts on 2026-09-09:

- `main.js` — blob `1845cebc52313c2217d3f703af4029c51959c456`
- `manifest.json` — plugin `taskliner`, version `0.1.1`
- `styles.css` — blob `043dbc70c178ae390c72d5548f2ca316d6250ac6`
- `data.json` — runtime/user settings only; do not distribute

Historical recovery source:

- repository: `plzsayyes3/catch-all-notebook`
- commit: `bcb6a611c9612eb856ea0c1d92854d5a6b2d11aa`
- source: `taskliner/src/main.ts`
- source blob: `97f9ec3d667f7cf8d12a8a92c4d6c33418e1f502`

The historical source and build configuration have now been restored exactly. GitHub Actions confirms that bundling the recovered `src/main.ts` with the historical esbuild configuration generates the deployed production `main.js` blob exactly.

## Completed

- [x] Preserve plugin ID `taskliner`.
- [x] Restore historical TaskLiner build configuration.
- [x] Restore `src/main.ts` exactly; blob matches `97f9ec3d667f7cf8d12a8a92c4d6c33418e1f502`.
- [x] Restore production `styles.css`; blob matches `043dbc70c178ae390c72d5548f2ca316d6250ac6`.
- [x] Verify behavior-preserving build parity: generated `main.js` matches production blob `1845cebc52313c2217d3f703af4029c51959c456`.
- [x] Separate the release build from legacy TypeScript type checking. `npm run build` uses esbuild; `npm run typecheck` is diagnostic only during typing modernization.
- [x] Add `versions.json` for Obsidian compatibility metadata.
- [x] Add a GitHub Release workflow that publishes `main.js`, `manifest.json`, and `styles.css` from a matching `v*` tag.
- [x] Keep `data.json` outside release artifacts and ignore it.
- [x] Remove tracked `node_modules`, generated source maps, runtime `data.json`, and the stale checked-in `main.js`. Release bundles are now generated from canonical source.
- [x] Synchronize the migration branch with the current `main` history.

## Remaining migration work

1. Merge `taskliner-migration` into `main` after CI is green.
2. Rename GitHub repository `taskchute-mine` to `taskliner`.
3. Publish the first release with a tag matching `manifest.json` (`v0.1.1` for the migration baseline, unless the version is deliberately advanced first).
4. Add `plzsayyes3/taskliner` to BRAT and verify installation/update on the actual vault.
5. Retire the old development copy only after BRAT is confirmed working.
6. Refactor the monolithic source only after the independent repository is proven in real use.

## Refactoring targets after migration

The recovered production source is large and mixes several responsibilities. Split it gradually into modules such as:

- `src/core/task-line.ts` — parsing/serialization and time calculations
- `src/commands/` — editor/task commands
- `src/services/daily-note.ts` — task note file access
- `src/services/techo.ts` — Techo import/integration
- `src/services/history.ts` — task-history index
- `src/ui/modals/` — date/time/template selection modals
- `src/ui/dashboard.ts` — dashboard/status/top bar
- `src/settings.ts` — settings schema and settings tab
- `src/main.ts` — plugin lifecycle and registration only

Do not refactor and migrate behavior at the same time. The migration baseline must remain reproducible while modules are extracted in behavior-preserving steps.
