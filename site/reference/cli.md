# CLI Reference (`toac`)

The `toac` CLI ships with the [`toad-compiler`](https://www.npmjs.com/package/toad-compiler) package.

```bash
npm i -g toad-compiler
```

## Usage

```bash
toac <build|check> <paths...> [--outDir <dir>]
toac fmt [--check] <paths...>
toac cost [--json] <paths...>
toac init <name>
toac lsp
```

Paths may be `.agent` files or directories — directories are scanned recursively for `.agent` files. Globbing is the shell's job.

## Commands

### `toac init`

Scaffold a new agent: `<name>.agent` (a minimal tool-using agent) plus the co-located `<name>.tools.ts` it imports from. Refuses to overwrite existing files.

```bash
toac init researcher
# created researcher.agent
# created researcher.tools.ts
# next: toac build researcher.agent

toac init agents/scout   # creates intermediate directories
```

### `toac build`

Compile `.agent` files to typed TypeScript. Each `your.agent` becomes a sibling `your.ts` (or lands in `--outDir` when given).

```bash
toac build researcher.agent
# compiled researcher.agent -> researcher.ts

toac build agents/ --outDir src/generated
```

### `toac check`

Validate without emitting — same diagnostics, no files written. Useful in CI:

```bash
toac check agents/
```

### `toac fmt`

The canonical formatter — TOAD's `gofmt`/`rustfmt`. It reorders top-level keys to the spec's schema order and normalizes indentation, key spacing, and blank lines, while preserving `prompt`/`system` block content exactly. It is idempotent and re-parses its own output, refusing to write if the result would mean anything different — so `toac fmt` can never change what an agent does. Invalid files are reported (like `check`) and never rewritten.

```bash
toac fmt researcher.agent
# formatted researcher.agent

toac fmt --check agents/   # write nothing; list files that need formatting, exit 1 if any
```

`--check` makes it a CI gate (no writes, non-zero exit when something isn't formatted).

### `toac cost`

Estimate an agent's **per-turn token footprint** before you run it — the fixed prefix (system prompt + tool schemas + the structured-output schema) sent on every model call, which is exactly the part prompt caching serves cheaply. This is the floor you pay each turn, so it's the number to watch and shrink.

```bash
toac cost researcher.agent
# researcher.agent — estimated per-turn tokens (heuristic)
#
#   system prompt         ~13
#   output schema         ~84
#   ──────────────────────────────────
#   fixed prefix / turn   ~97
#
#   prompt template       ~36  (excludes interpolated values)
#   bare tools            2 — schema in .tools.ts, not visible to toac
```

`--json` emits `{ file, ...report }` per agent, for tracking the number in CI over time. Estimates are heuristic and offline (no provider tokenizer); treat them as relative — compare agents, or before/after a change. Tool-result and conversation-history tokens are runtime-dependent; the runtime reports those.

### `toac lsp`

Start a [Language Server](https://microsoft.github.io/language-server-protocol/) over stdio. It gives any LSP-capable editor the same diagnostics as `toac check`, plus hovers, completions, and `toac fmt` formatting — by running the real compiler, so there's no second implementation to drift.

```bash
toac lsp   # speaks LSP on stdin/stdout; your editor launches it for you
```

You don't run this by hand — point your editor at it. Per-editor setup (Neovim, Helix, Zed, Emacs, JetBrains) is in the [ecosystem guide](/ecosystem#editor-support). The [VS Code extension](/ecosystem#vs-code) bundles the compiler directly and needs no separate server.

## Flags

| Flag             | Meaning                                            |
| ---------------- | -------------------------------------------------- |
| `--outDir <dir>` | Write compiled `.ts` files into `<dir>` instead of next to the source (`build`) |
| `--check`        | `fmt` only: write nothing, list files needing formatting, exit non-zero if any |
| `--json`         | `cost` only: emit a machine-readable report per agent |
| `--version`, `-v` | Print the compiler version                         |

## Diagnostics & exit codes

Errors are located, structured diagnostics, rendered as code frames with a caret under the offending span and a `did you mean?` hint where one applies:

```
error[TOA202]: unknown key "promt"
  --> researcher.agent:4:1
   |
 4 | promt: |
   | ^^^^^ did you mean `prompt`?
   |
```

`toac` exits `0` when everything compiled, `1` if any file had errors (or no `.agent` files were found). Files with errors don't emit output; the rest still do.

## Programmatic API

The same pipeline is exported from `toad-compiler` — it's what powers the in-browser [playground](/playground):

```ts
import { compile, renderDiagnostic, formatAgent } from "toad-compiler";

const { code, diagnostics } = compile(source, "researcher.agent");
if (code === undefined) {
  // renderDiagnostic draws the code frame; pass the source to get the caret.
  for (const d of diagnostics) console.error(renderDiagnostic(d, source));
}

// Canonical formatting (what `toac fmt` runs):
const { code: formatted, changed } = formatAgent(source, "researcher.agent");
```
