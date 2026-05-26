# Authoring TOAD agents

New to TOAD? This is everything you need to write a `.agent` file by hand — or to
get an LLM to write one for you (see the [prompt](#prompt-turn-any-llm-into-a-toad-author)
at the bottom).

## How TOAD works

```
your.agent ──┐
             │  1. lower   `prompt: |` blocks become valid TOON      (toac)
             │  2. decode  parsed by the real @toon-format/toon decoder
             │  3. validate keys, types, tools, {inputs.x} → a typed agent model
             ▼  4. emit
your.ts  ──▶ readable, typed TypeScript that runs on @toa/runtime over Claude
```

You describe **what** the agent is (its model, inputs, tools, prompt, outputs).
The compiler produces the **how** — a typed module with the tool-use loop,
structured output, and prompt wiring already written. Real logic (what a tool
actually does) lives in plain TypeScript, next to the agent.

## The `.agent` format

A `.agent` file is a small, indentation-based document (2 spaces, never tabs). It
is a strict superset of [TOON](https://github.com/toon-format/toon).

| Key | Required | Form | Meaning |
|-----|----------|------|---------|
| `agent` | yes | identifier | the agent's name (also the export + filename) |
| `model` | yes | string | a Claude model id, e.g. `claude-opus-4-7` |
| `description` | no | string | one line on what it does |
| `inputs` | no | `inputs[N]{name,type}:` + N rows | typed call parameters |
| `tools` | no | `tools[N]: a,b` | tool names, implemented in `<agent>.tools.ts` |
| `prompt` | yes | `prompt: \|` + indented block | the instruction prompt |
| `outputs` | no | `outputs[N]{name,type}:` + N rows | typed structured result |

**Types:** `string`, `number`, `boolean`. Append `[]` for an array (`string[]`).

**Interpolation:** inside `prompt`, `{inputs.<name>}` inserts a declared input.
`{{` and `}}` are literal braces. No other expressions.

**Counts must match:** `inputs[2]{...}` has exactly two indented rows;
`tools[2]: a,b` lists exactly two names.

**Loops:** iterate an array input inside the prompt with
`{#each inputs.<name> as <item>}` … `{/each}`. The body repeats once per element;
reference the element with `{<item>}`:

```
prompt: |
  Summarize these notes:
  {#each inputs.notes as note}
  - {note}
  {/each}
```

**Conditionals:** include a section only when a boolean input is set, with
`{#if inputs.<flag>}` … `{:else}` … `{/if}` (a leading `!` negates):

```
prompt: |
  {#if inputs.detailed}
  Write a thorough analysis.
  {:else}
  Keep it brief.
  {/if}
```

### A complete example

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

Compile it with `toac build researcher.agent`. Tools named in `tools:` are
implemented in a co-located `researcher.tools.ts`:

```ts
import { defineTool } from "@toa/runtime";
import { z } from "zod";

export const web_search = defineTool({
  description: "Search the web for a query",
  input: z.object({ query: z.string() }),
  run: async ({ query }) => `results for ${query}`,
});

export const fetch_page = defineTool({
  description: "Fetch and read a URL",
  input: z.object({ url: z.string() }),
  run: async ({ url }) => (await fetch(url)).text(),
});
```

## Prompt: turn any LLM into a TOAD author

Copy the block below, paste it into Claude (as a system prompt or a normal
message), replace the last line with your task, and you'll get a `.agent` file
you can drop straight into the [playground](https://zubeidhendricks.github.io/toa/#playground).

````text
You write TOAD agent files. TOAD is a compile-first framework: an agent is a
declarative `.agent` file that a compiler turns into typed TypeScript. Given a
task, output ONE valid `.agent` file and nothing else — no prose, no code fences.

THE .agent FORMAT (indentation is 2 spaces, never tabs):

  agent: <identifier>      required. name; letters/digits/_, starts with a letter or _
  model: <string>          required. a Claude model id, e.g. claude-opus-4-7
  description: <string>    optional. one line on what it does
  inputs[N]{name,type}:    optional. N typed inputs, one per indented row:
    <name>,<type>            e.g.  topic,string
  tools[N]: <a>,<b>        optional. N tool names (identifiers), comma-separated
  prompt: |                required. the instruction prompt as an indented block:
    line one of the prompt...
  outputs[N]{name,type}:   optional. N typed result fields, one per indented row

TYPES: string | number | boolean. Append [] for an array, e.g. string[].

INTERPOLATION: in the prompt, {inputs.<name>} inserts a declared input's value.
The name must be one you declared in inputs. Use {{ and }} for literal braces.

LOOPS: iterate an array input with {#each inputs.<name> as <item>} ... {/each}.
The body repeats once per element; reference the element with {<item>}.

CONDITIONALS: include a section only when a boolean input is set, with
{#if inputs.<flag>} ... {:else} ... {/if}. A leading ! negates the condition.

RULES:
- Output only the .agent file.
- A header's count must match its rows: inputs[2]{...} has exactly 2 rows;
  tools[2]: a,b lists exactly 2 names.
- Every {inputs.x} must reference a declared input.
- Keep logic out of the prompt; name tools here and implement them in TypeScript.

EXAMPLE 1 — a tool-using agent:

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

EXAMPLE 2 — no tools, structured output:

agent: summarizer
model: claude-opus-4-7
description: Summarize text into key bullet points.
inputs[1]{name,type}:
  text,string
prompt: |
  Summarize the following into 3-5 concise bullet points:
  {inputs.text}
outputs[1]{name,type}:
  bullets,string[]

EXAMPLE 3 — a loop over an array input:

agent: digest
model: claude-opus-4-7
description: Turn a list of notes into a short summary.
inputs[1]{name,type}:
  notes,string[]
prompt: |
  Summarize these notes into a short paragraph:
  {#each inputs.notes as note}
  - {note}
  {/each}
outputs[1]{name,type}:
  summary,string

Now write a .agent file for this task:
<describe your agent here>
````

## Tips

- Start from one of the examples above and change the pieces you need.
- If `toac` reports an error, it's located (`file:line:col CODE: message`) — the
  common ones are a missing required key, a count that doesn't match its rows, or
  a `{inputs.x}` that isn't declared.
- Paste any `.agent` into the [playground](https://zubeidhendricks.github.io/toa/#playground)
  to see the generated TypeScript live.
