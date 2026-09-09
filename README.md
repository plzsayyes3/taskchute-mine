# TaskLiner

TaskLiner is a personal Obsidian task-management plugin derived from the earlier `taskchute-mine` implementation.

## Canonical source

This repository is the new development and distribution source of truth for TaskLiner.

The production implementation was recovered from the historical TaskLiner tree in `plzsayyes3/catch-all-notebook` and verified byte-for-byte against the currently deployed plugin in `plzsayyes3/mynotebook`.

Verified migration baseline:

- `src/main.ts` blob: `97f9ec3d667f7cf8d12a8a92c4d6c33418e1f502`
- generated `main.js` blob: `1845cebc52313c2217d3f703af4029c51959c456`
- `styles.css` blob: `043dbc70c178ae390c72d5548f2ca316d6250ac6`
- plugin ID: `taskliner`
- baseline version: `0.1.1`

The migration verification workflow rebuilds the historical source and confirms that the generated `main.js` matches the deployed production artifact exactly.

## Development

Install dependencies:

```sh
npm install
```

Watch/build during development:

```sh
npm run dev
```

Production bundle:

```sh
npm run build
```

`main.js` is generated and is not tracked in Git. `npm run build` intentionally uses esbuild directly. The recovered source predates current Obsidian TypeScript definitions and uses APIs that are not fully represented by the latest public typings. Type checking is therefore kept separate from the release build:

```sh
npm run typecheck
```

Type errors should be modernized gradually after production parity is preserved; they are not currently a release gate.

## Distribution / BRAT

GitHub Releases are the distribution source. A tag such as `v0.1.1` triggers the release workflow, which:

1. installs dependencies,
2. builds `main.js` from `src/main.ts`,
3. verifies that the tag version matches `manifest.json`,
4. publishes these release assets:
   - `main.js`
   - `manifest.json`
   - `styles.css`

Runtime settings (`data.json`) are vault-specific and are not distributed or tracked.

After the repository is renamed, the BRAT repository target is:

`plzsayyes3/taskliner`

## Migration status

The behavior-preserving source recovery, production build parity, repository cleanup, and release automation are complete. Repository rename, migration-branch merge, first release, and BRAT switchover remain before the old development location can be retired.

See `MIGRATION.md` for the detailed migration record and later refactoring targets.
