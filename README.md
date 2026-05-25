# TOAD

**TOAgentic Development** — a compile-first framework for building AI agents.

You describe an agent as a small, declarative `.agent` file in a token-efficient,
TOON-derived syntax. The `toac` compiler turns it into readable, fully-typed
TypeScript that runs on `@toa/runtime` over the Anthropic API. The surface is
deliberately minimal, so an agent is cheap to write and review — for humans _and_
for the LLMs that increasingly author and edit agents.

TOAD is a **strict superset of [TOON](https://github.com/toon-format/toon)**
(Token-Oriented Object Notation). Structural parsing is delegated to TOON's own
spec-conformant decoder; TOAD layers on `prompt: |` block scalars and `{ }`
interpolation — so an agent reads like data, not boilerplate.

## What an agent looks like

`researcher.agent`:

```
agent: researcher
model: claude-opus-4-7
description: Research a topic and return a sourced summary.
inputs[1]{name,type}:
  topic,string
tools[2]: web_search,fetch_page
prompt: |
  You are a research analyst. Research: {inputs.topic}
  Use web_search to find sources, then fetch_page to read them.
  Return a cited summary.
outputs[2]{name,type}:
  summary,string
  sources,string[]
```

`toac build researcher.agent` emits a typed `researcher.ts` that exports a runnable
agent: typed `inputs`/`outputs`, tools wired from a co-located `researcher.tools.ts`,
and a tool-use loop with structured output. Tool logic stays in plain TypeScript —
the escape hatch for anything the declarative layer shouldn't do.

## Why TOON syntax

- **Token-efficient** — an agent definition is ~28% of the tokens of the equivalent
  JSON-schema + SDK boilerplate it replaces (measured on the bundled example).
- **Schema-explicit** — `[N]` lengths and `{field}` headers hand a model the
  structure up front, which measurably improves how reliably it can generate one.
- **Lossless JSON** — interops with existing tool schemas, configs, and datasets.

## Packages

- **`@toa/compiler`** — the `toac` compiler (`.agent` → `.ts`).
- **`@toa/runtime`** — the agent runtime: `defineTool`, `createAgent`, the tool
  loop, structured output, and typed errors.

## Quick start

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm lint && pnpm build
```

Compile an agent:

```bash
node packages/compiler/dist/bin.js build examples/researcher/researcher.agent
```

See [`examples/researcher`](./examples/researcher) for a complete, type-checked
example.

## Status

MVP complete — the full pipeline (`.agent` → `toac` → typed, runnable `.ts`) works,
with 45 passing tests. Design docs live in [`_bmad-output/`](./_bmad-output/)
(`product-brief.md`, `prd.md`, `architecture.md`, `epics.md`).
