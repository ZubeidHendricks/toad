# Changelog

All notable changes to `toad-compiler` and `toad-runtime`. The `.agent` format
is versioned separately in [`SPEC.md`](./SPEC.md).

## 0.7.0

The security release: a framework-level defense against the multi-agent
confused deputy.

- **Delegation chains & tool authorization** (`toad-runtime`) — a
  framework-level defense against the multi-agent _confused deputy_. Seed a
  `RunOptions.delegation` (the originating user + the acting agents); it
  propagates into every tool via `ToolRunContext.delegation` and extends by one
  hop through each `asTool` sub-agent. A new deny-capable `authorizeToolCall`
  hook sees the full chain and can block a call before it runs (`false` denies
  one call; throwing `AuthorizationError` aborts the run), so a sub-agent can be
  barred from a resource _regardless_ of a token it inherited through the
  context. Fully opt-in and backward compatible. New exports:
  `DelegationContext`, `Principal`, `ToolCallRequest`, `extendChain`,
  `AuthorizationError`. Design & roadmap:
  [`docs/proposals/delegation-and-tool-authz.md`](./docs/proposals/delegation-and-tool-authz.md).
- **MCP delegation boundary** (`toad-runtime/mcp`) — a `tools/call` may carry a
  delegation chain in its `_meta` under `toad/delegation` (the structured
  `DelegationContext`, or the `Toad-Delegation` header string). `serveMcp`
  reads it, extends it by the served agent, and runs the agent with that chain —
  so a gateway in front (e.g. Kagenti's MCP gateway) can set it and the agent's
  own tool calls authorize against the full chain. New exports:
  `encodeDelegationHeader`, `parseDelegationHeader`, `DELEGATION_HEADER`.

## 0.6.0

The editor-everywhere release: the diagnostics `toac check` produces now reach
any editor, not just VS Code.

- **`toac lsp`** — a standalone [Language Server](https://microsoft.github.io/language-server-protocol/)
  over stdio. Diagnostics, hovers, completions, and formatting for `.agent`
  files in Neovim, Helix, Zed, Emacs, JetBrains — anything that speaks LSP. It
  runs the real compiler front-end (`analyze`/`compile`/`formatAgent`), so there
  is no second implementation to drift. Dependency-free wire protocol; the
  message handler (`createServer`) is exported and synchronous, so it is fully
  testable without a process. See [`ecosystem.md`](./site/ecosystem.md#editor-support)
  for per-editor setup.
- **Editor services API** — `hoverAt`, `completionsAt`, `inputNames`, and the
  `KEY_DOCS`/`TEMPLATE_DOCS` tables are now exported from `toad-compiler` as
  editor-agnostic, 0-based-position functions. Both the VS Code extension and
  `toac lsp` consume them, so hover/completion stay identical across editors.
- The VS Code extension now sources hover and completion from those shared
  services instead of its own copies.

## 0.5.0

More token-optimization for the tool loop, on top of 0.4.0's measurement:

- **Ephemeral tool results** — `defineTool({ ephemeral: true })`: a result the
  model needs only once is sent to the next call, then elided on later turns
  (placeholder, tool_use/result pairing preserved), regardless of any budget.
- **Field projection** — `defineTool({ fields: [...] })`: project a result to
  just the keys the model needs before sending (an object, or each element of an
  array-of-objects). Composes with `toolResultFormat` — project the shape, then
  TOON-encode it — and the full result still reaches `onToolResult`.

## 0.4.0

The token-optimization release: measure where tokens go, then bound the cost.

- **`toac cost`** — a static, offline estimate of an agent's per-turn token
  footprint (the fixed prefix sent every call: system + tool schemas + output
  schema), with `--json` for tracking in CI.
- **`onContext` hook** — per-call attribution of input tokens across system /
  tools / conversation history, so the history growth that dominates long loops
  is finally visible (the provider's totals don't break this down).
- **`maxContextTokens`** — a per-turn context budget (config or `.agent` key,
  SPEC §4.11): when exceeded, the oldest tool results are elided (oldest first,
  tool_use/result pairing preserved, current turn untouched), bounding the
  conversation's unbounded growth.
- Diagnostics now place a caret on the exact source span for `inputs`/`outputs`
  and typed-tool rows, and for template/block errors inside the prompt.

## 0.3.0

The language-and-tooling release: typed tools, a canonical formatter, and
rustc-style diagnostics, plus a much richer runtime.

### Language & compiler

- **Typed tool schemas** — the tabular `tools[N]{name,input}:` form lets the
  `.agent` file own each tool's input schema; `toac` emits the schema and a typed
  `defineTool`, so `<agent>.tools.ts` supplies only the `run` body (SPEC §4.5).
- **Rich diagnostics** — errors render as rustc/Elm-style code frames with a
  caret under the span, plus `did you mean?` suggestions (Damerau–Levenshtein) for
  mistyped keys and `{inputs.x}` references.
- **Enum types** (`draft|final`) compile to a literal union + `z.enum`.
- **Optional inputs** (`detail?,string`) and the `temperature` key.
- Tool-name uniqueness is enforced.

### Tooling

- **`toac fmt`** — a canonical formatter (with `--check` for CI): reorders keys to
  the schema order and normalizes indentation, spacing, and blank lines, while
  preserving prompt/system block content exactly. It re-parses its own output and
  refuses to write if the meaning would change, so it can never alter an agent.

### Runtime

- **Multi-turn sessions** (`agent.session`) with a JSON-serializable, resumable
  `state` snapshot.
- **Streaming tool loop** — `agent.runStream` yields typed events (text deltas,
  tool calls/results, usage, final output); `agent.stream` yields text.
- **MCP export** — `serveMcp` (from `toad-runtime/mcp`) serves compiled agents as
  Model Context Protocol tools over stdio.
- **Composition** — `asTool` forwards the caller's cancellation to sub-agents and
  takes `onUsage` to roll a sub-agent's tokens up into a parent; any call accepts
  per-call `hooks` via `run(inputs, { hooks })`.
- **Usage accounting** (`onUsage`, including prompt-cache reads/writes),
  **parallel tool calls** within a turn, **cancellation** (`AbortSignal`) and
  **tool timeouts**, **retries**, and **token-efficient tool results**
  (`toolResultFormat: "auto"` re-encodes as TOON when it saves tokens).

### Editor (`toad-agent` VS Code extension, 0.4.0)

- Live diagnostics from the bundled compiler, hover docs, completions, and
  **Format Document / format-on-save** via `toac fmt`.

## 0.2.0

- Initial public release: the `toac` compiler (`.agent` → typed TypeScript), the
  `toad-runtime` tool-use loop with structured output and typed errors, the
  `.agent` spec, a `toac init` scaffold, and the in-browser playground.
