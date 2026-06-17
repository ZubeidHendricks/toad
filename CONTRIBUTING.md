# Contributing to TOAD

Thanks for helping build TOAD — Token-Oriented Agentic Development. The compiler,
runtime, language, docs, and editor tooling are all fair game, and the project is
MIT-licensed and early enough that small contributions move it meaningfully.

New here? Jump to [good first issues](https://github.com/ZubeidHendricks/toad/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## Project layout

TOAD is a pnpm + Turbo monorepo.

| Path                | What                                                                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/compiler` | The `toac` compiler — `.agent` → typed TypeScript. Pipeline: `preprocess → toon decode → validate → codegen`. Also the `toac` CLI, the formatter, `toac cost`, and the `toac lsp` language server. |
| `packages/runtime`  | `toad-runtime` — `createAgent`, `defineTool`, the tool-use loop, composition (`asTool`), MCP (`serveMcp`), and the delegation/authorization layer.                                                 |
| `editors/vscode`    | The VS Code extension (bundles the compiler for live diagnostics).                                                                                                                                 |
| `site`              | The VitePress docs site, the in-browser playground, benchmarks, and the examples gallery.                                                                                                          |
| `scripts`           | Generators and checks (`gen-examples.mjs`, `gen-llms.mjs`, `smoke-lsp.mjs`, `bench-tool-loop.mjs`).                                                                                                |
| `docs`              | Authoring guide, launch checklist, and design proposals.                                                                                                                                           |
| `SPEC.md`           | The normative, versioned `.agent` format spec.                                                                                                                                                     |

## Setup

You need **Node ≥ 20** and **pnpm** (via Corepack — the repo pins the version in
`package.json`).

```bash
corepack enable
pnpm install
pnpm build       # build all packages (turbo)
```

## The gate

Before opening a PR, run what CI runs — all green, no exceptions:

```bash
pnpm typecheck   # tsc across every package
pnpm test        # vitest across every package
pnpm lint        # prettier --check .
pnpm build       # compile all packages
```

CI also runs the language-server smoke test and the examples-gallery check (both
need a build first):

```bash
pnpm build
pnpm smoke:lsp                          # spawns the built `toac lsp` over stdio
node scripts/gen-examples.mjs --check   # fails if the gallery is stale
```

Formatting is enforced by Prettier; `pnpm format` rewrites in place.

## Common tasks

**Add an examples-gallery agent.** The gallery (`site/examples.md`) is generated
— don't edit it by hand. Add an entry to the `EXAMPLES` array in
`scripts/gen-examples.mjs` (a `title` and a `.agent` `source`), then:

```bash
pnpm build && pnpm gen:examples
```

The generator compiles your `.agent` with the real compiler (so the shown
TypeScript is exact) and builds the playground link. If it doesn't compile, the
generator fails — fix the source.

**Add or change a diagnostic.** Diagnostics live in
`packages/compiler/src/diagnostics.ts` (codes are `TOA0xx`–`TOA3xx`) and are
raised from `validate.ts` / `analyze.ts` / the prompt parser. Add a test in the
matching `*.test.ts`; assert the `code`, and `line`/`col` where the caret should
land.

**Touch the runtime tool loop.** `packages/runtime/src/agent.ts`. Tests use a
scripted mock `LlmClient` (see `agent.test.ts`) — no API key needed.

**Change the language.** If you change the `.agent` format itself (not just the
compiler's handling of it), update `SPEC.md` in the same PR.

## Pull requests

- Branch off `main`; keep PRs focused.
- Match the surrounding code: the codebase favors small, well-commented modules
  and prefers no new dependencies — call it out if you need to add one.
- Update `CHANGELOG.md` (the `Unreleased` section, or a new one) for any
  user-facing compiler/runtime change.
- Add tests for new behavior; keep the gate green.
- Conventional, descriptive commit subjects are appreciated.

Releases are cut by maintainers; see [`RELEASING.md`](./RELEASING.md). You don't
need to bump versions in a PR.

## Reporting bugs & ideas

Open an [issue](https://github.com/ZubeidHendricks/toad/issues/new). For a
compiler bug, the smallest `.agent` file that reproduces it (and what you
expected `toac` to do) is the most useful thing you can include.
