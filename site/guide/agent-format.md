# The .agent Format

A `.agent` file is a small, indentation-based document (2 spaces, never tabs) — a strict superset of [TOON](https://github.com/toon-format/toon). You describe _what_ the agent is; `toac` emits the _how_.

## How it works

<Mermaid name="pipeline" />

Real logic (what a tool actually does) lives in plain TypeScript, in a co-located `<agent>.tools.ts`.

## Keys

| Key                     | Req | Form                            | Meaning                                              |
| ----------------------- | --- | ------------------------------- | ---------------------------------------------------- |
| `agent`                 | yes | identifier                      | the agent's name (also the export + filename)        |
| `model`                 | yes | string                          | a Claude model id, e.g. `claude-opus-4-7`            |
| `description`           | no  | string                          | one line on what it does                             |
| `inputs`                | no  | `inputs[N]{name,type}:` + N rows | typed call parameters                                |
| `tools`                 | no  | `tools[N]: a,b`                 | tool names, implemented in `<agent>.tools.ts`        |
| `prompt`                | yes | `prompt: \|` + block            | the instruction prompt                               |
| `outputs`               | no  | `outputs[N]{name,type}:` + N rows | typed structured result                              |
| `system`                | no  | `system: \|` + block            | system prompt (defaults to the description)          |
| `uses`                  | no  | `uses[N]: a,b`                  | sub-agents wired in as tools via `asTool()`          |
| `maxTurns` / `retries`  | no  | number                          | tool-use turn cap / model-call retries               |

::: warning Counts are checked
A header's count must match its rows: `inputs[2]{...}` has exactly two rows; `tools[2]: a,b` lists exactly two names. The explicit `[N]` lengths are what make the format reliable for LLMs to author.
:::

## Types

`string`, `number`, `boolean`, or a quoted object type like `"{title:string;score:number}"`. Append `[]` for an array (`string[]`, or `"{...}[]"`). Read object fields with `{inputs.x.field}` or, in a loop, `{item.field}`.

```agent
inputs[3]{name,type}:
  sources,"{title:string;url:string}[]"
  detailed,boolean
  audience,string
```

## A complete example

A kitchen-sink agent using loops, conditionals, object fields, and destructuring — all type-checked:

```agent
agent: brief
model: claude-opus-4-7
description: Summarize sources for an audience, optionally in detail.
inputs[3]{name,type}:
  sources,"{title:string;url:string}[]"
  detailed,boolean
  audience,string
prompt: |
  Write a brief for {inputs.audience}.
  {#each inputs.sources as {title, url}, i}
  {i}. {title} — {url}
  {:else}
  No sources provided.
  {/each}
  {#if inputs.detailed}
  Include a thorough analysis section.
  {:else}
  Keep it to a single paragraph.
  {/if}
outputs[1]{name,type}:
  brief,string
```

Try it live in the [playground](/playground), or see the template constructs in detail in [Prompt Templates](/guide/templates).
