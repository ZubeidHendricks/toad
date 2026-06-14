# Changelog

All notable changes to `toad-compiler` and `toad-runtime`. The `.agent` format
is versioned separately in [`SPEC.md`](./SPEC.md).

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
