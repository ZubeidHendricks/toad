# Getting Started

TOAD (**T**oken-**O**riented **A**gentic **D**evelopment) is a compile-first framework for building AI agents. You describe an agent in a small, token-efficient `.agent` file, and the `toac` compiler turns it into readable, fully-typed TypeScript that runs on Claude.

The syntax is derived from [TOON](https://github.com/toon-format/toon) (Token-Oriented Object Notation), so an agent reads like compact data rather than boilerplate — cheap to write and review for humans _and_ for the LLMs that increasingly author agents.

## Install

::: code-group

```bash [npm]
# the compiler + `toac` CLI
npm i -g toad-compiler

# the runtime your compiled agents import
npm i toad-runtime @anthropic-ai/sdk
```

```bash [pnpm]
# the compiler + `toac` CLI
pnpm add -g toad-compiler

# the runtime your compiled agents import
pnpm add toad-runtime @anthropic-ai/sdk
```

:::

## Your first agent

Create `greeter.agent`. An agent needs three things: a name, a model, and a prompt — that's a complete, runnable agent:

```agent
agent: greeter
model: claude-opus-4-7
inputs[1]{name,type}:
  name,string
prompt: |
  Greet {inputs.name} warmly in one sentence.
```

Compile it:

```bash
toac build greeter.agent
# compiled greeter.agent -> greeter.ts
```

The emitted `greeter.ts` exports a typed, runnable agent. Run it from any TypeScript file (with `ANTHROPIC_API_KEY` set in your environment):

```ts
import { greeter } from "./greeter";

const text = await greeter.run({ name: "Ada" });
console.log(text);
```

Pass the wrong input shape and it's a **compile error** — the generated agent takes a typed `{ name: string }`.

## Add tools

Name tools in the `.agent` file; implement them in a co-located `<agent>.tools.ts`. The runtime runs the tool-use loop for you:

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

## What's next

- Build up the whole language a few lines at a time in the [Tutorial](/guide/tutorial)
- Look up every key in [The .agent Format](/guide/agent-format)
- Watch the real compiler run in your browser in the [Playground](/playground)
- See the measured token savings in [Benchmarks](/benchmarks)
