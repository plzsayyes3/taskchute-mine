# TaskLiner

TaskLiner is a personal Obsidian task-management plugin derived from the earlier `taskchute-mine` implementation.

## Canonical source

This repository is being migrated to become the single source of truth for TaskLiner.

The current production build is the TaskLiner plugin used in `plzsayyes3/mynotebook` at:

`.obsidian-job/plugins/taskliner/`

The plugin ID is `taskliner`.

## Development

```sh
npm install
npm run dev
```

Production build:

```sh
npm run build
```

## Distribution

The repository root should contain the BRAT/release artifacts:

- `main.js`
- `manifest.json`
- `styles.css`

Runtime settings (`data.json`) are vault-specific and must not be distributed as part of the plugin release.

## BRAT target

After the repository rename, use:

`plzsayyes3/taskliner`

BRAT currently installs beta plugins from GitHub releases. Each release must contain `manifest.json` and `main.js`; `styles.css` is included when the plugin uses it.

## Migration status

See `MIGRATION.md`.
