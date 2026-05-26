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

**Types:** `string`, `number`, `boolean`, or a quoted object type like
`"{title:string;score:number}"`. Append `[]` for an array (`string[]`, or
`"{...}[]"`). Read object fields with `{inputs.x.field}` or, in a loop,
`{item.field}`.

**Interpolation:** inside `prompt`, `{inputs.<name>}` inserts a declared input and
`{env.<NAME>}` inserts an environment variable (`process.env.<NAME>`, empty string
if unset). `{{` and `}}` are literal braces.

**Counts must match:** `inputs[2]{...}` has exactly two indented rows;
`tools[2]: a,b` lists exactly two names.

**Loops:** iterate an array input with `{#each inputs.<name> as <item>}` …
`{/each}`; reference the element with `{<item>}`. Add a 0-based index with
`{#each … as <item>, <i>}`, and an empty-list fallback with `{:else}`:

```
prompt: |
  Summarize these notes:
  {#each inputs.notes as note}
  - {note}
  {/each}
```

**Conditionals:** include a section based on a boolean input, with
`{#if inputs.<flag>}` … `{:else if inputs.<other>}` … `{:else}` … `{/if}`
(a leading `!` negates):

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

## Composition

An agent can be used as a tool by another agent — call `asTool()` on it and list
it in the parent's `tools`. The sub-agent's typed inputs become the tool's input
schema automatically (`toac` emits an `inputSchema` for every agent with inputs):

```ts
// planner.tools.ts
import { researcher } from "./researcher.js";

export const research = researcher.asTool({
  description: "Research a topic and return a sourced summary",
});
```

```
# planner.agent
agent: planner
model: claude-opus-4-7
tools[1]: research
prompt: |
  Plan an article. Use the research tool to gather sources first.
```

Or skip the `.tools.ts` wiring — declare sub-agents with `uses`, and `toac`
imports them and calls `asTool()` for you (the tool's name is the agent's name):

```
# planner.agent
agent: planner
model: claude-opus-4-7
uses[1]: researcher
prompt: |
  Plan an article. Use the researcher tool to gather sources first.
```

## Prompt: turn any LLM into a TOAD author

Copy the block below, paste it into Claude (as a system prompt or a normal
message), replace the last line with your task, and you'll get a `.agent` file
you can drop straight into the [playground](https://zubeidhendricks.github.io/toad/#playground).

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

TYPES: string | number | boolean, or a quoted object type "{a:string;b:number}".
Append [] for an array (string[], "{...}[]"). Read object fields with x.field.

INTERPOLATION: in the prompt, {inputs.<name>} inserts a declared input's value.
The name must be one you declared in inputs. Use {{ and }} for literal braces.
{env.<NAME>} inserts an environment variable (process.env.<NAME>).

LOOPS: iterate an array input with {#each inputs.<name> as <item>} ... {/each};
reference the element with {<item>}. Optional 0-based index: {#each ... as <item>, <i>}.
Empty-list fallback: {#each ...} ... {:else} ... {/each}.

CONDITIONALS: {#if inputs.<flag>} ... {:else if inputs.<other>} ... {:else} ... {/if}
on boolean inputs; a leading ! negates.

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
- Paste any `.agent` into the [playground](https://zubeidhendricks.github.io/toad/#playground)
  to see the generated TypeScript live.
