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
against the agent's typed inputs, with located `file:line:col` diagnostics.

## The runtime (`toad-runtime`)

The generated agent runs a tool-use loop over the Anthropic API with:

- **Structured output** — declared `outputs` become a typed, validated result.
- **Composition** — use one agent as another's tool (`uses:` or `agent.asTool()`).
- **Lifecycle** — `retries`, `maxTurns`, and `onToolCall` / `onToolResult` /
  `onError` hooks.
- **Sessions** — `agent.session(inputs)` keeps multi-turn conversation history
  (tool calls included), with typed results per send; `session.state` is a
  JSON-serializable snapshot you can persist and resume.
- **Cancellation & timeouts** — `run/send/stream` take an `AbortSignal`
  (forwarded to the API call and to tools); `toolTimeoutMs` /
  `defineTool({ timeoutMs })` time-box tool execution.
- **Streaming** — `agent.stream(inputs)` yields text deltas.
- **MCP export** — `serveMcp([agent])` (from `toad-runtime/mcp`) exposes compiled
  agents as Model Context Protocol tools over stdio, so any MCP client (Claude
  Desktop, Claude Code, …) can call them. Each agent's declared `inputs` becomes
  the tool's input schema; the result is returned as text and `structuredContent`.
- **Token accounting** — the `onUsage` hook reports per-call and cumulative
  usage, including prompt-cache reads/writes; same-turn tool calls run
  concurrently.
- **Token-efficient tool results** — set `toolResultFormat: "auto"` to feed tool
  results back to the model as TOON instead of JSON when it saves tokens
  (~30–50% on tabular results), so multi-turn loops stay cheap. Defaults to
  `"json"`; `"toon"` always encodes. The `onToolResultEncoded` hook reports the
  tokens saved per result, so you can log "saved N tokens this run".
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

Scaffold and compile an agent:

```bash
toac init researcher        # → researcher.agent + researcher.tools.ts
toac build researcher.agent # → researcher.ts (typed TypeScript)
```

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

147 passing tests, green gate (typecheck · test · lint · build). Design docs live
in [`_bmad-output/`](./_bmad-output/).
