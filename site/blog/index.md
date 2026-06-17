# Release Notes

What's new in TOAD. Follow along on [GitHub releases](https://github.com/ZubeidHendricks/toad/releases).

## TOAD 0.6.0 — diagnostics in every editor {#v0-6-0}

_June 17, 2026_

TOAD's compiler already gave you located, rustc-style diagnostics from `toac check` and live red squiggles in VS Code. This release takes them everywhere else:

- **`toac lsp`** — a standalone [Language Server](https://microsoft.github.io/language-server-protocol/) over stdio. The same diagnostics, hovers, completions, and `toac fmt` formatting in **Neovim, Helix, Zed, Emacs, JetBrains** — anything that speaks LSP. It runs the **real compiler** front-end, so there is no second implementation to drift from `toac`. Per-editor setup is in the [ecosystem guide](/ecosystem#editor-support).
- **One source of truth** — hover and completion now live in the compiler as editor-agnostic services that both the LSP and the VS Code extension consume, so every editor shows the same thing.
- **No new dependencies** — the LSP wire protocol is hand-rolled, keeping `toad-compiler` lean and the browser playground bundle untouched.

```bash
npm i -g toad-compiler@0.6.0
# then point your editor at: toac lsp
```

A standard needs tooling everywhere code is written. This is that pillar.

## TOAD 0.2.0 — the standard takes shape {#v0-2-0}

_June 12, 2026_

This release is about making `.agent` a format you can target, not just a tool you can run:

- **[The `.agent` specification](/reference/spec)** — versioned and normative ([`SPEC.md`](https://github.com/ZubeidHendricks/toad/blob/main/SPEC.md)). If you're building tooling on the format, this is your contract.
- **`toac init <name>`** — scaffold a starter `<name>.agent` + `<name>.tools.ts` pair in one command.
- **A real `.agent` grammar** — a TextMate grammar drives both this site's syntax highlighting and a new **[VS Code extension](https://github.com/ZubeidHendricks/toad/tree/main/editors/vscode)**.
- **A new site** — full-text search, a [playground](/playground) running the real compiler in your browser, and **[measured benchmarks](/benchmarks)**: `.agent` is 30–38% fewer tokens than equivalent JSON; TOON tool results save 33–39% on tabular data.
- **[llms.txt](https://zubeidhendricks.github.io/toad/llms.txt)** — the docs, agent-readable. A token-oriented framework should practice what it preaches.

```bash
npm i -g toad-compiler@0.2.0
toac init scout && toac build scout.agent
```

## TOAD 0.1.0 — the first release {#v0-1-0}

_May 27, 2026_

TOAD is now on npm. Write an AI agent as a tiny declarative `.agent` file; the `toac` compiler turns it into readable, fully-typed TypeScript that runs on Claude.

```bash
npm i -g toad-compiler
npm i toad-runtime @anthropic-ai/sdk
```

**What's in it:**

- **The compiler** — `.agent` (a strict [TOON](https://github.com/toon-format/toon) superset) lowered, decoded, validated, and emitted as typed TypeScript, with located `file:line:col` diagnostics.
- **The language** — typed `inputs` / `outputs` / `tools`, object types, interpolation, `{#each}` loops (with index, `{:else}`, and destructuring), and `{#if}/{:else if}/{:else}` conditionals.
- **The runtime** — the tool-use loop, structured output, composition (`uses:` / `asTool()`), lifecycle (`retries`, `maxTurns`, hooks), and streaming.
- **The site** — docs, a step-by-step tutorial, live examples, and an in-browser playground running the real compiler.

Two packages: [`toad-compiler`](https://www.npmjs.com/package/toad-compiler) (the `toac` CLI) and [`toad-runtime`](https://www.npmjs.com/package/toad-runtime). MIT-licensed. Issues and PRs welcome — it's early and there's plenty to build.
