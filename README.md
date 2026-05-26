# TOAD

**TOAD — Token-Oriented Agentic Development.** A compile-first framework for
building AI agents.

You describe an agent in a small, token-efficient `.agent` file, and the `toac`
compiler turns it into readable, fully-typed TypeScript that runs on Claude. The
syntax is derived from [TOON](https://github.com/toon-format/toon)
(Token-Oriented Object Notation), so an agent reads like compact data rather than
boilerplate — cheap to write and review for humans _and_ for the LLMs that
increasingly author agents.

The name spells out the idea:

- **T**oken-**O**riented — agents are written in TOON-derived syntax that uses
  far fewer tokens than JSON and hands a model an explicit schema to follow.
- **A**gentic **D**evelopment — defining, compiling, type-checking, and running
  agents is the whole workflow.

TOAD is a **strict superset of TOON**: structural parsing is delegated to TOON's
spec-conformant decoder, and TOAD adds `prompt: |` block scalars and
`{inputs.x}` interpolation on top.

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

## Authoring agents

New to TOAD? [`docs/authoring.md`](./docs/authoring.md) explains the `.agent`
format and includes a copy-paste prompt that turns any LLM into a TOAD author.

## Status

MVP complete — the full pipeline (`.agent` → `toac` → typed, runnable `.ts`) works,
with 45 passing tests. Design docs live in [`_bmad-output/`](./_bmad-output/)
(`product-brief.md`, `prd.md`, `architecture.md`, `epics.md`).
