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

The same production `main.js` blob exists in the historical TaskLiner development tree in `plzsayyes3/catch-all-notebook` at commit `bcb6a611c9612eb856ea0c1d92854d5a6b2d11aa`, together with `taskliner/src/main.ts` and the old build configuration. This is the recovery source for the TypeScript implementation corresponding to the current production bundle.

The old `taskchute-mine` repository already contains a much newer `src/main.ts` than its checked-in `main.js`. Build parity is therefore verified before replacing source blindly. CI compares the built `main.js` Git blob hash with the production blob above.

## Migration order

1. Rename GitHub repository `taskchute-mine` to `taskliner`.
2. Preserve the current production plugin ID `taskliner` so existing vault installations use the same folder/ID.
3. Restore the production build configuration and verify whether the existing `src/main.ts` reproduces the production bundle.
4. If parity fails, replace only the differing source with the historical TaskLiner source.
5. Copy/restore the production `styles.css` and verify its blob hash.
6. Refactor the monolithic source only after parity is established.
7. Remove tracked `node_modules` and generated source maps from version control.
8. Keep `data.json` out of release artifacts.
9. Add a GitHub Release workflow that builds from source and attaches `main.js`, `manifest.json`, and `styles.css`.
10. Publish a release whose tag matches `manifest.json` version, then install/update through BRAT.

## Refactoring targets after parity

The production source is currently large and mixes several responsibilities. Split it gradually into modules such as:

- `src/core/task-line.ts` — parsing/serialization and time calculations
- `src/commands/` — editor/task commands
- `src/services/daily-note.ts` — task note file access
- `src/services/techo.ts` — Techo import/integration
- `src/services/history.ts` — task-history index
- `src/ui/modals/` — date/time/template selection modals
- `src/ui/dashboard.ts` — dashboard/status/top bar
- `src/settings.ts` — settings schema and settings tab
- `src/main.ts` — plugin lifecycle and registration only

Do not refactor and migrate behavior at the same time. First reproduce the production build, then extract modules with behavior-preserving changes.
