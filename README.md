# TOAD

<p align="center">
  <img src="toad_robo.png" alt="TOAD" width="160" />
</p>

**TOAD — Token-Oriented Agentic Development.** A compile-first framework for
building AI agents.

You describe an agent in a small, token-efficient `.agent` file, and the `toac`
compiler turns it into readable, fully-typed TypeScript that runs on Claude. The
syntax is derived from [TOON](https://github.com/toon-format/toon) (Token-Oriented
Object Notation), so an agent reads like compact data rather than boilerplate —
cheap to write and review for humans _and_ for the LLMs that increasingly author
agents.

**🐸 Live site + in-browser playground: https://zubeidhendricks.github.io/toad/**

The name spells out the idea:

- **T**oken-**O**riented — agents are written in TOON-derived syntax that uses far
  fewer tokens than JSON and hands a model an explicit schema to follow.
- **A**gentic **D**evelopment — defining, compiling, type-checking, and running
  agents is the whole workflow.

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

`toac build researcher.agent` emits a typed `researcher.ts` exporting a runnable
agent. Tool bodies live in a co-located `researcher.tools.ts`.

## The language

A `.agent` file is a strict superset of TOON. Inside `prompt:` you get a small,
type-checked template language:

| Construct       | Example                                                      |
| --------------- | ------------------------------------------------------------ |
| Interpolation   | `{inputs.topic}`                                             |
| Environment     | `{env.API_BASE}`                                             |
| Object fields   | `{inputs.user.name}`                                         |
| Loops           | `{#each inputs.items as x, i}{i}. {x}{/each}`                |
| Empty fallback  | `{#each xs as x}…{:else}none{/each}`                         |
| Destructuring   | `{#each rows as {title, score}}…{/each}`                     |
| Conditionals    | `{#if inputs.verbose}…{:else if inputs.brief}…{:else}…{/if}` |
| Literal braces  | `{{` and `}}`                                                |
| Optional inputs | `detail?,string` (omitted → empty / empty list / false)      |
| Enum types      | `verdict,approve\|reject` → literal union + `z.enum`         |

Types are `string` / `number` / `boolean`, a quoted object like
`"{a:string;b:number}"`, and any of those with `[]`. Every reference is validated
against the agent's typed inputs, with rustc/Elm-style diagnostics — a code frame
under the offending span plus `did you mean?` suggestions:

```text
error[TOA202]: unknown key "promt"
  --> researcher.agent:4:1
   |
 4 | promt: |
   | ^^^^^ did you mean `prompt`?
   |
```

Tools can be **bare names** (`tools[2]: web_search,fetch_page`) — the body in
`<agent>.tools.ts` owns its schema — or **typed**, where the `.agent` file owns
the input schema and the body supplies only `run`:

```
tools[2]{name,input}:
  web_search,"{query:string}"
  fetch_page,"{url:string}"
```

`toac` then generates the Zod schema and a typed `defineTool`, so
`<agent>.tools.ts` is just `export const web_search = (i: WebSearchInput) => …`,
type-checked against the declared input.

## The runtime (`toad-runtime`)

The generated agent runs a tool-use loop over the Anthropic API with:

- **Structured output** — declared `outputs` become a typed, validated result.
- **Composition** — use one agent as another's tool (`uses:` or `agent.asTool()`);
  the parent's cancellation reaches the sub-agent, and `asTool({ onUsage })` rolls
  a sub-agent's token usage up into the parent. Any call also takes per-call
  `hooks` (merged over the configured ones) via `run(inputs, { hooks })`.
- **Lifecycle** — `retries`, `maxTurns`, and `onToolCall` / `onToolResult` /
  `onError` hooks.
- **Sessions** — `agent.session(inputs)` keeps multi-turn conversation history
  (tool calls included), with typed results per send; `session.state` is a
  JSON-serializable snapshot you can persist and resume.
- **Cancellation & timeouts** — `run/send/stream` take an `AbortSignal`
  (forwarded to the API call and to tools); `toolTimeoutMs` /
  `defineTool({ timeoutMs })` time-box tool execution.
- **Streaming** — `agent.stream(inputs)` yields text deltas; `agent.runStream(inputs)`
  streams the **whole tool loop** as typed events (`text` deltas, `tool_use` /
  `tool_result`, `usage`, and a final `done` carrying the typed output).
- **MCP export** — `serveMcp([agent])` (from `toad-runtime/mcp`) exposes compiled
  agents as Model Context Protocol tools over stdio, so any MCP client (Claude
  Desktop, Claude Code, …) can call them. Each agent's declared `inputs` becomes
  the tool's input schema; the result is returned as text and `structuredContent`.
- **Token accounting** — the `onUsage` hook reports per-call and cumulative
  usage, including prompt-cache reads/writes; same-turn tool calls run
  concurrently. The `onContext` hook attributes each call's input tokens across
  system / tools / history — so you can see history dominate a long loop, which
  the provider's totals don't break down. (`toac cost` estimates the same fixed
  prefix statically, before you run.)
- **Context budgeting** — set `maxContextTokens` (config or `.agent` key) to cap
  the conversation: when a turn's estimated context exceeds it, the oldest tool
  results are elided (oldest first, pairing preserved, the current turn kept), so
  long loops don't grow unbounded — the single biggest recurring cost. Mark a
  tool `ephemeral` to drop its (one-shot) result on later turns regardless.
- **Token-efficient tool results** — set `toolResultFormat: "auto"` to feed tool
  results back to the model as TOON instead of JSON when it saves tokens
  (~30–50% on tabular results), so multi-turn loops stay cheap. Defaults to
  `"json"`; `"toon"` always encodes. The `onToolResultEncoded` hook reports the
  tokens saved per result, so you can log "saved N tokens this run". Add
  `fields: [...]` to a tool to **project** its result to just the keys the model
  needs (volume) before encoding (format) — the two compound.
- **TOON inputs** — object/array values interpolated into a prompt render as
  TOON automatically, not `[object Object]`.

## Packages

- **`toad-compiler`** — the `toac` compiler (`.agent` → `.ts`).
- **`toad-runtime`** — `defineTool`, `createAgent`, the tool loop, and the above.

## The spec

The `.agent` format is specified in [`SPEC.md`](./SPEC.md) — versioned and
normative, so other tools can target it. Proposals welcome as issues/PRs.

## Editor support

A VS Code extension with full `.agent` syntax highlighting lives in
[`editors/vscode`](./editors/vscode) (the same TextMate grammar powers the
site's code blocks).

## Install

```bash
# the compiler + `toac` CLI
npm i -g toad-compiler

# the runtime your compiled agents import
npm i toad-runtime @anthropic-ai/sdk
```

Scaffold, format, and compile an agent:

```bash
toac init researcher        # → researcher.agent + researcher.tools.ts
toac fmt researcher.agent   # canonical formatting (use --check in CI)
toac cost researcher.agent  # estimate the per-turn token footprint
toac build researcher.agent # → researcher.ts (typed TypeScript)
```

`toac fmt` is the canonical formatter — like gofmt/rustfmt. It reorders keys to
the spec's schema order and normalizes indentation, spacing, and blank lines,
while preserving prompt/system block content exactly (it re-parses its own output
and refuses to write if the meaning would change).

[![toad-compiler version](https://img.shields.io/npm/v/toad-compiler?label=toad-compiler)](https://www.npmjs.com/package/toad-compiler)
[![toad-compiler downloads](https://img.shields.io/npm/dt/toad-compiler?label=downloads)](https://www.npmjs.com/package/toad-compiler)
[![toad-runtime version](https://img.shields.io/npm/v/toad-runtime?label=toad-runtime)](https://www.npmjs.com/package/toad-runtime)
[![toad-runtime downloads](https://img.shields.io/npm/dt/toad-runtime?label=downloads)](https://www.npmjs.com/package/toad-runtime)

## Develop

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm lint && pnpm build
```

Compile an agent:

```bash
node packages/compiler/dist/bin.js build examples/researcher/researcher.agent
```

See [`examples/researcher`](./examples/researcher) for a complete, type-checked
example, and [`docs/authoring.md`](./docs/authoring.md) for the full format plus a
copy-paste prompt that turns any LLM into a TOAD author.

## Status

214 passing tests, green gate (typecheck · test · lint · build). Design docs live
in [`_bmad-output/`](./_bmad-output/).
