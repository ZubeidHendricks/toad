# Toa

A Svelte-style compiler framework for AI agents. You author declarative `.agent`
files in a TOON-derived syntax; the `toac` compiler emits typed TypeScript that
runs on `@toa/runtime` over the Anthropic SDK.

Toa is a **strict superset of TOON** — structural parsing is delegated to the real
[`@toon-format/toon`](https://github.com/toon-format/toon) decoder; Toa adds
`prompt: |` block scalars and `{ }` interpolation on top.

## Packages

- **`@toa/compiler`** — the `toac` compiler (`.agent` → `.ts`).
- **`@toa/runtime`** — agent runtime: `defineTool`, `createAgent`, the tool loop.

## Develop

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm lint
```

## Design docs

Planning and architecture live in [`_bmad-output/`](./_bmad-output/):
`product-brief.md`, `prd.md`, `architecture.md`, `epics.md`.

Status: MVP — story **E0 (scaffold)**. Roadmap: `_bmad-output/epics.md`.
