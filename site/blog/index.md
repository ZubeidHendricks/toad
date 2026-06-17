# Release Notes

What's new in TOAD. Follow along on [GitHub releases](https://github.com/ZubeidHendricks/toad/releases).

## TOAD 0.7.0 — the security release {#v0-7-0}

_June 18, 2026_

Multi-agent systems have a sharp edge: the **confused deputy**. An agent with
legitimate authority gets tricked into using it for a request that shouldn't
have it — a sub-agent reads patient records because a token rode along in the
context, and the audit trail shows nothing but "authorized activity." You can't
fix this by securing the call path, because the whole point of an agent is that
it decides the next call. So TOAD secures the **identity** instead.

- **Delegation chains** — seed a `RunOptions.delegation` (the originating user
  plus the acting agents). It flows into every tool via `ToolRunContext` and
  extends by one hop through each `uses:` / `asTool()` sub-agent, automatically.
- **Deny-capable authorization** — a new `authorizeToolCall` hook sees the
  **full chain** and can block a call before the tool runs (`false` denies one
  call; throwing `AuthorizationError` aborts the run). So a sub-agent can be
  barred from a resource _regardless_ of a token it inherited through the
  context — authorization is against the identity chain, not a path.
- **MCP boundary** — `serveMcp` accepts an inbound chain (a `Toad-Delegation`
  header or structured `_meta`) and honors it, so a gateway out front (e.g.
  [Kagenti](https://github.com/kagenti/kagenti)) can set the chain and TOAD
  enforces it at the tool boundary. TOAD produces the identity; your platform
  enforces it.

Everything is **opt-in and backward compatible** — set no `delegation` and no
`authorizeToolCall`, and nothing changes. Design and roadmap (including optional
signing and a declarative `.agent` `allow:` block) are in
[the proposal](https://github.com/ZubeidHendricks/toad/blob/main/docs/proposals/delegation-and-tool-authz.md).

```bash
npm i toad-runtime@0.7.0
```

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

## TOAD 0.5.0 — results the model reads once {#v0-5-0}

_June 16, 2026_

0.4.0 made tool-loop token cost _visible_; 0.5.0 gives you two precise tools to cut it, per tool:

- **Ephemeral tool results** — `defineTool({ ephemeral: true })`. A result the model needs only once is sent on the next call, then elided on later turns (placeholder kept, `tool_use`/`tool_result` pairing preserved), no matter the budget. For tools whose output stops mattering the moment it's been read.
- **Field projection** — `defineTool({ fields: [...] })`. Project a result down to just the keys the model needs before it's sent — an object, or each element of an array-of-objects. Composes with `toolResultFormat`: project the shape, then TOON-encode it. The full result still reaches your `onToolResult` hook.

```bash
npm i toad-runtime@0.5.0
```

## TOAD 0.4.0 — measure the tool loop, then bound it {#v0-4-0}

_June 15, 2026_

Long agent runs are dominated by tokens you can't see: schemas re-sent every call, and conversation history that grows without limit. 0.4.0 makes both legible and puts a ceiling on the second:

- **`toac cost`** — a static, offline estimate of an agent's per-turn footprint: the fixed prefix (system + tool schemas + output schema) sent on every model call, which is exactly the part prompt caching serves cheaply. `--json` tracks it in CI.
- **`onContext` hook** — per-call attribution of input tokens across system / tools / history, so the growth that dominates long loops is finally visible (the provider's totals don't break this down).
- **`maxContextTokens`** — a per-turn context budget ([SPEC §4.11](/reference/spec)). Over it, the oldest tool results are elided (oldest first, pairing preserved, current turn untouched), bounding the conversation's unbounded growth.
- Diagnostics now place a caret on the exact span for `inputs`/`outputs`, typed-tool rows, and template/block errors inside the prompt.

```bash
npm i -g toad-compiler@0.4.0
toac cost researcher.agent
```

## TOAD 0.3.0 — language-grade craft {#v0-3-0}

_June 14, 2026_

The release that treats `.agent` as a language, not a config format: typed tools, a canonical formatter, rustc-style diagnostics, and a much richer runtime.

**Language & compiler**

- **Typed tool schemas** — the tabular `tools[N]{name,input}:` form lets the `.agent` file own each tool's input schema; `toac` emits the schema + a typed `defineTool`, so `<agent>.tools.ts` supplies only the `run` body ([SPEC §4.5](/reference/spec)).
- **Rich diagnostics** — rustc/Elm-style code frames with a caret under the span, plus `did you mean?` suggestions (Damerau–Levenshtein) for mistyped keys and `{inputs.x}` references.
- **Enum types** (`draft|final`) → a literal union + `z.enum`; **optional inputs** (`detail?,string`); the `temperature` key; enforced tool-name uniqueness.

**Tooling**

- **`toac fmt`** — TOAD's gofmt/rustfmt (with `--check` for CI). Reorders keys to the schema order and normalizes spacing, while preserving prompt/system blocks exactly — it re-parses its own output and refuses to write if the meaning would change.

**Runtime**

- **Multi-turn sessions** (`agent.session`) with a resumable `state` snapshot; **a streaming tool loop** (`agent.runStream` / `agent.stream`); **MCP export** (`serveMcp` from `toad-runtime/mcp`) serving compiled agents as Model Context Protocol tools; **composition** (`asTool` with cancellation + usage roll-up); usage accounting (incl. prompt-cache reads/writes), parallel tool calls, cancellation, tool timeouts, retries, and token-efficient TOON tool results (`toolResultFormat: "auto"`).
- **VS Code extension 0.4.0** — live diagnostics, hover docs, completions, and format-on-save from the bundled compiler.

```bash
npm i -g toad-compiler@0.3.0
npm i toad-runtime@0.3.0
```

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
