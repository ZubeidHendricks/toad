# Runtime Reference (`toad-runtime`)

The runtime that agents compiled by `toac` import. It provides `defineTool`, `createAgent`, the tool-use loop, structured output, composition, and token-efficient serialization.

```bash
npm i toad-runtime @anthropic-ai/sdk
```

## The tool-use loop

The generated agent runs a tool-use loop over the Anthropic API: send the prompt, execute any requested tools, feed results back, repeat until the model finishes (or calls the internal `respond` tool for structured output).

<Mermaid name="tool-loop" />

## `createAgent(config)`

Builds a runnable agent. Generated code calls this for you; you can also use it directly.

```ts
import { createAgent } from "toad-runtime";
import { z } from "zod";

const agent = createAgent({
  name: "summarizer",
  model: "claude-opus-4-7",
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ bullets: z.array(z.string()) }),
  prompt: (inputs) => `Summarize into bullets:\n${inputs.text}`,
});
```

### `AgentConfig`

| Option             | Type                              | Meaning                                                       |
| ------------------ | --------------------------------- | ------------------------------------------------------------- |
| `name`             | `string`                          | the agent's name                                              |
| `model`            | `string`                          | a Claude model id                                             |
| `description`      | `string?`                         | used as the default system prompt                             |
| `tools`            | `Record<string, ToolDef>?`        | tools the model may call                                      |
| `inputSchema`      | `ZodType<I>?`                     | typed inputs; also enables `asTool()`                         |
| `outputSchema`     | `ZodType<O>?`                     | when set, the agent must return a value matching this schema  |
| `prompt`           | `(inputs: I) => string`           | the instruction prompt                                        |
| `system`           | `((inputs: I) => string)?`        | system prompt; defaults to the description                    |
| `maxTurns`         | `number?` (default 8)             | tool-use turn cap                                             |
| `maxTokens`        | `number?` (default 4096)          | per-call token cap                                            |
| `retries`          | `number?`                         | retry the model call on error                                 |
| `toolResultFormat` | `"json" \| "toon" \| "auto"`      | how non-string tool results are serialized (see below)        |
| `hooks`            | `AgentHooks?`                     | observability / guardrail hooks                               |
| `client`           | `LlmClient?`                      | injectable for testing; defaults to the real Anthropic client |

### `Agent<I, O>`

```ts
interface Agent<I, O> {
  readonly name: string;
  run(inputs: I): Promise<O>;
  /** Stream the model's text for the prompt (no tools / structured output). */
  stream(inputs: I): AsyncIterable<string>;
  /** Expose this agent as a tool that another agent can call. */
  asTool(options?: { description?: string }): ToolDef<I>;
}
```

```ts
// streaming
for await (const delta of agent.stream({ text: "..." })) {
  process.stdout.write(delta);
}
```

## `defineTool()`

Tool bodies live in plain TypeScript, in a co-located `<agent>.tools.ts`:

```ts
import { defineTool } from "toad-runtime";
import { z } from "zod";

export const web_search = defineTool({
  description: "Search the web for a query",
  input: z.object({ query: z.string() }),
  run: async ({ query }) => `results for ${query}`,
});
```

## Token-efficient tool results {#toon-serialization}

Tool results that are objects or arrays go back into the conversation as text — and JSON is a verbose way to do that. `toolResultFormat` controls the encoding:

- **`"json"`** (default) — `JSON.stringify`; maximally compatible.
- **`"toon"`** — always encode objects/arrays as [TOON](https://github.com/toon-format/toon); fewest tokens for uniform/tabular data, but the model must read TOON.
- **`"auto"`** (recommended) — use TOON only when it is meaningfully smaller than JSON, else JSON. **Never increases tokens.**

```ts
const agent = createAgent({
  // ...
  toolResultFormat: "auto",
  hooks: {
    onToolResultEncoded: ({ tool, format, tokensSaved }) => {
      console.log(`${tool}: ${format}, saved ~${tokensSaved} tokens`);
    },
  },
});
```

On tabular results this saves **30–40%** of the tokens per result — see the measured numbers in [Benchmarks](/benchmarks#tool-results). The `onToolResultEncoded` hook reports per-result savings so you can log "saved N tokens this run".

### `toonValue()`

Renders any value as TOON for prompt interpolation — the compiler emits this automatically for non-scalar `{inputs.x}` interpolations, so objects never become `[object Object]`:

```ts
import { toonValue } from "toad-runtime";

prompt: (inputs) => `Process these rows:\n${toonValue(inputs.rows)}`;
```

## Composition

An agent can be used as a tool by another — call `asTool()` and list it in the parent's `tools`, or skip the wiring and declare it with `uses`; `toac` imports it and calls `asTool()` for you.

```agent
# planner.agent
agent: planner
model: claude-opus-4-7
uses[1]: researcher
prompt: |
  Plan an article. Use the researcher tool to gather sources first.
```

<Mermaid name="composition" />

The sub-agent's typed `inputSchema` becomes the tool's input schema automatically.

## Lifecycle & errors

- **Hooks** — `onToolCall`, `onToolResult`, `onToolResultEncoded`, `onError`.
- **`retries`** — retry the model call on transient errors.
- **`maxTurns`** — cap the tool-use loop; exceeding it throws `MaxTurnsError`.
- **Typed errors** — `MaxTurnsError`, `OutputParseError` (structured output failed validation), `ToolError` (a tool body threw).

```ts
import { MaxTurnsError, OutputParseError, ToolError } from "toad-runtime";
```
