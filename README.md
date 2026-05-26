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

| Construct      | Example                                                      |
| -------------- | ------------------------------------------------------------ |
| Interpolation  | `{inputs.topic}`                                             |
| Environment    | `{env.API_BASE}`                                             |
| Object fields  | `{inputs.user.name}`                                         |
| Loops          | `{#each inputs.items as x, i}{i}. {x}{/each}`                |
| Empty fallback | `{#each xs as x}…{:else}none{/each}`                         |
| Destructuring  | `{#each rows as {title, score}}…{/each}`                     |
| Conditionals   | `{#if inputs.verbose}…{:else if inputs.brief}…{:else}…{/if}` |
| Literal braces | `{{` and `}}`                                                |

Types are `string` / `number` / `boolean`, a quoted object like
`"{a:string;b:number}"`, and any of those with `[]`. Every reference is validated
against the agent's typed inputs, with located `file:line:col` diagnostics.

## The runtime (`@toa/runtime`)

The generated agent runs a tool-use loop over the Anthropic API with:

- **Structured output** — declared `outputs` become a typed, validated result.
- **Composition** — use one agent as another's tool (`uses:` or `agent.asTool()`).
- **Lifecycle** — `retries`, `maxTurns`, and `onToolCall` / `onToolResult` /
  `onError` hooks.
- **Streaming** — `agent.stream(inputs)` yields text deltas.

## Packages

- **`@toa/compiler`** — the `toac` compiler (`.agent` → `.ts`).
- **`@toa/runtime`** — `defineTool`, `createAgent`, the tool loop, and the above.

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

79 passing tests, green gate (typecheck · test · lint · build). Design docs live
in [`_bmad-output/`](./_bmad-output/).
