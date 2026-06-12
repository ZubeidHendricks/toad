# Tutorial: Build Your First Agent

We'll start with a three-line agent and grow it into a tool-using, composable one — a few lines at a time. Every snippet is a real `.agent` file; paste any of them into the [playground](/playground) to watch it compile.

## 1 · Your first agent

An agent needs three things: a name, a `model`, and a `prompt`. That's a complete, runnable agent.

```agent
agent: greeter
model: claude-opus-4-7
prompt: |
  Greet the user warmly in one sentence.
```

`toac build greeter.agent` emits a typed `greeter.ts` exporting a runnable `greeter`.

## 2 · Typed inputs

Declare parameters under `inputs`, then reference them in the prompt with `{inputs.<name>}`. The count in `inputs[1]` must match the rows.

```agent
agent: greeter
model: claude-opus-4-7
inputs[1]{name,type}:
  name,string
prompt: |
  Greet {inputs.name} warmly in one sentence.
```

The generated agent takes a typed `{ name: string }` — pass the wrong shape and it's a compile error.

## 3 · Structured output

Add `outputs` and the agent returns a typed, validated object instead of free text. Arrays use `[]`.

```agent
agent: extractor
model: claude-opus-4-7
inputs[1]{name,type}:
  text,string
prompt: |
  Extract the key facts from: {inputs.text}
outputs[2]{name,type}:
  title,string
  facts,string[]
```

`toac` emits a zod schema and a "respond" tool, so the result is parsed and typed as `{ title: string; facts: string[] }`.

## 4 · Tools

Name tools under `tools`; implement them in a co-located `<agent>.tools.ts`. The runtime runs the tool-use loop for you.

```agent
agent: researcher
model: claude-opus-4-7
inputs[1]{name,type}:
  topic,string
tools[2]: web_search,fetch_page
prompt: |
  Research {inputs.topic}. Use web_search, then fetch_page to read sources.
outputs[1]{name,type}:
  summary,string
```

```ts
// researcher.tools.ts
import { defineTool } from "toad-runtime";
import { z } from "zod";

export const web_search = defineTool({
  description: "Search the web for a query",
  input: z.object({ query: z.string() }),
  run: async ({ query }) => `results for ${query}`,
});
```

## 5 · Loops & conditionals

The prompt is a small, type-checked template: `{#each}` over array inputs and `{#if}` on booleans.

```agent
agent: report
model: claude-opus-4-7
inputs[2]{name,type}:
  findings,string[]
  detailed,boolean
prompt: |
  Write a report from these findings:
  {#each inputs.findings as f, i}
  {i}. {f}
  {/each}
  {#if inputs.detailed}
  Add a thorough analysis section.
  {:else}
  Keep it to one paragraph.
  {/if}
```

Loops compile to `.map().join("")`; conditionals to nested ternaries — all validated against the typed inputs.

## 6 · Composition

Declare another agent under `uses` and `toac` wires it in as a tool — one agent calls another.

```agent
agent: planner
model: claude-opus-4-7
uses[1]: researcher
prompt: |
  Plan an article. Use the researcher tool to gather sources first.
```

The sub-agent's typed inputs become the tool's input schema automatically. That's the whole framework: small files that compose.

## Where next

You've covered the whole language. Try the [playground](/playground), browse the [examples](/examples), or read the full [format reference](/guide/agent-format).
