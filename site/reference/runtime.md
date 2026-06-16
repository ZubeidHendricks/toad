# Runtime Reference (`toad-runtime`)

The runtime that agents compiled by `toac` import. It provides `defineTool`, `createAgent`, the tool-use loop, structured output, composition, and token-efficient serialization.

```bash
npm i toad-runtime @anthropic-ai/sdk
```

## The tool-use loop

The generated agent runs a tool-use loop over the Anthropic API: send the prompt, execute any requested tools, feed results back, repeat until the model finishes (or calls the internal `respond` tool for structured output). When the model requests several tools in one turn, they run **concurrently**; results go back in the model's request order. The system prompt and tool definitions carry `cache_control` breakpoints, so the stable prefix is served from the prompt cache on every turn after the first.

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
| `temperature`      | `number?` (0–1)                   | sampling temperature; omitted = API default                   |
| `retries`          | `number?`                         | retry the model call on error                                 |
| `toolTimeoutMs`    | `number?`                         | default per-tool execution timeout (a tool's `timeoutMs` overrides) |
| `toolResultFormat` | `"json" \| "toon" \| "auto"`      | how non-string tool results are serialized (see below)        |
| `hooks`            | `AgentHooks?`                     | observability / guardrail hooks                               |
| `client`           | `LlmClient?`                      | injectable for testing; defaults to the real Anthropic client |

### `Agent<I, O>`

```ts
interface Agent<I, O> {
  readonly name: string;
  run(inputs: I, options?: RunOptions): Promise<O>;
  /** Start (or, with a saved state, resume) a multi-turn conversation. */
  session(inputs: I, state?: SessionState): AgentSession<O>;
  /** Stream the model's text for the prompt (no tools / structured output). */
  stream(inputs: I, options?: RunOptions): AsyncIterable<string>;
  /** Run the full tool loop, yielding typed events as they happen. */
  runStream(inputs: I, options?: RunOptions): AsyncIterable<AgentEvent<O>>;
  /** Expose this agent as a tool that another agent can call. */
  asTool(options?: {
    description?: string;
    onUsage?: AgentHooks["onUsage"];
  }): ToolDef<I>;
}
```

`RunOptions` is `{ signal?: AbortSignal; hooks?: AgentHooks }` — a per-call `signal` (see [Cancellation](#cancellation)) and per-call `hooks`, merged over the configured ones (both fire).

### Streaming text

```ts
for await (const delta of agent.stream({ text: "..." })) {
  process.stdout.write(delta);
}
```

### Streaming the whole tool loop {#runstream}

`runStream()` is the streaming counterpart of `run()`: it drives the full tool-use loop and yields a typed `AgentEvent` for each thing that happens, ending with `done`.

```ts
for await (const ev of agent.runStream(inputs)) {
  switch (ev.type) {
    case "text":        process.stdout.write(ev.text); break;       // model text delta
    case "tool_use":    console.log(`→ ${ev.name}`, ev.input); break; // a tool was called
    case "tool_result": console.log(`← ${ev.name}`, ev.output); break;
    case "usage":       /* ev.turn, ev.total: TokenUsage */ break;
    case "done":        return ev.output; // the final typed result (O)
  }
}
```

`AgentEvent<O>` is the union of `{ type: "text"; text }`, `{ type: "tool_use"; id; name; input }`, `{ type: "tool_result"; id; name; output }`, `{ type: "usage"; turn; total }`, and `{ type: "done"; output: O }`. With `outputs` declared, `done.output` is the validated object; otherwise it's the joined text.

## Sessions: multi-turn conversations {#sessions}

`run()` is one-shot. `session()` keeps the conversation — including tool calls and results — so follow-ups have full context, and the cached system/tools prefix keeps paying off across sends:

```ts
const session = researcher.session({ topic: "TOON adoption" });

const first = await session.send();                  // runs the rendered prompt
const more = await session.send("Now focus on npm download trends.");

session.messages; // the conversation so far (snapshot)
session.usage;    // cumulative TokenUsage for the session
```

- The **first** `send()` sends the rendered prompt (an optional argument is appended to it); afterwards `send(message)` requires the message.
- Each send runs the full tool-use loop with a fresh `maxTurns` budget and returns the same typed result as `run()` — with `outputs` declared, every send returns a validated object.
- `run(inputs)` is exactly `session(inputs).send()`.

### Persistence

`session.state` is a JSON-serializable snapshot — persist it anywhere and resume after a restart:

```ts
await fs.writeFile("session.json", JSON.stringify(session.state));

// later, in a new process
const state = JSON.parse(await fs.readFile("session.json", "utf8"));
const resumed = researcher.session({ topic: "TOON adoption" }, state);
await resumed.send("Pick up where we left off.");
```

## Cancellation & timeouts {#cancellation}

`run()`, `send()`, and `stream()` accept an `AbortSignal`; aborting cancels the in-flight API call (no retries are burned on it) and the signal is handed to tools through their run context:

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 30_000);

await agent.run(inputs, { signal: controller.signal });

// tools can cooperate:
export const fetch_page = defineTool({
  description: "Fetch a page",
  input: z.object({ url: z.string() }),
  run: ({ url }, ctx) => fetch(url, { signal: ctx?.signal }),
});
```

Tools can also be time-boxed — per tool (`timeoutMs` on `defineTool`) or for the whole agent (`toolTimeoutMs` in the config). A timed-out tool fails the run with a `ToolError`:

```ts
const agent = createAgent({
  // ...
  toolTimeoutMs: 10_000, // every tool, unless it sets its own timeoutMs
});
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

## Token usage accounting {#usage}

The runtime is named for tokens, so it measures them. The `onUsage` hook fires after every model response with that call's usage and the cumulative total for the run — including what prompt caching saved:

```ts
import { createAgent, type TokenUsage } from "toad-runtime";

const agent = createAgent({
  // ...
  hooks: {
    onUsage: (turn: TokenUsage, total: TokenUsage) => {
      console.log(
        `turn: ${turn.inputTokens} in / ${turn.outputTokens} out`,
        `(cache read ${turn.cacheReadTokens})`,
        `run total: ${total.inputTokens + total.outputTokens}`,
      );
    },
  },
});
```

`cacheReadTokens` are input tokens served from the prompt cache at a fraction of the input price — in a multi-turn tool loop that's most of the system prompt and tool definitions from turn two onward.

### Where the input tokens go: `onContext`

The provider reports one input total, not a breakdown. The `onContext` hook fires before each model call with an estimate of how that call's input splits across the system prompt, tool definitions, and conversation history — the attribution you need to find what's actually expensive (usually history, which grows every turn):

```ts
const agent = createAgent({
  // ...
  hooks: {
    onContext: ({ system, tools, messages, estimatedTotal }) => {
      console.log(`ctx ~${estimatedTotal}: history ${messages}, tools ${tools}, system ${system}`);
    },
  },
});
```

Estimates are heuristic (relative, not exact billing). For the static counterpart — the fixed prefix before you ever run — use [`toac cost`](/reference/cli#toac-cost).

### Context budgeting: `maxContextTokens`

Conversation history is re-sent every turn, so it's the cost that grows without bound in a long tool loop. Set `maxContextTokens` (in the config, or as a `.agent` key) to cap it: before each call, if the estimated context exceeds the budget, the runtime elides the **oldest** tool results — replacing their content with a short placeholder, oldest first, preserving the tool_use/result pairing the API requires — until back under budget. The current turn's fresh results are never elided.

```ts
const agent = createAgent({
  // ...
  maxContextTokens: 8000, // cap the per-turn context; omit to disable
});
```

It's a soft ceiling based on the same heuristic estimate as `onContext` — watch `onContext`'s `messages` flatten out across turns once it's set. Omitted = no compaction.

### Ephemeral tool results

Some tools return a large payload the model needs to read **once** — a fetched page, a big query dump. Mark such a tool `ephemeral` and its result is sent in full to the next model call, then elided on every turn after (a short placeholder, pairing preserved). This fires regardless of `maxContextTokens`:

```ts
export const fetch_page = defineTool({
  description: "Fetch a page",
  input: z.object({ url: z.string() }),
  ephemeral: true, // model reads it once; don't re-send it every turn
  run: ({ url }) => fetchText(url),
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
    onToolResultEncoded: ({ tool, format, savedTokens }) => {
      console.log(`${tool}: ${format}, saved ~${savedTokens} tokens`);
    },
  },
});
```

On tabular results this saves **30–40%** of the tokens per result — see the measured numbers in [Benchmarks](/benchmarks#tool-results). The `onToolResultEncoded` hook reports per-result savings so you can log "saved N tokens this run".

### Field projection: `fields`

Format (`toolResultFormat`) cuts how a result is encoded; `fields` cuts how much of it is sent. Many tools over-fetch — a search returns 20 hits × 30 fields when the model needs `title` and `url`. List the keys to keep and the runtime strips the rest before encoding (so projection and TOON compound):

```ts
export const search = defineTool({
  description: "Search",
  input: z.object({ q: z.string() }),
  fields: ["title", "url"], // model sees only these; the rest never ship
  run: ({ q }) => searchApi(q), // may return the full 30-field payload
});
```

It projects an object result, or each element of an array-of-objects result; scalars pass through. The **full** result still reaches `onToolResult` and `tool_result` events — only what the model sees is trimmed.

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

The sub-agent's typed `inputSchema` becomes the tool's input schema automatically. Composition is cost- and cancellation-aware:

- The parent's `AbortSignal` is forwarded to the sub-agent's run, so cancelling the parent cancels its sub-agents.
- `asTool({ onUsage })` surfaces the sub-agent's token usage, so a parent can roll a whole composition tree's cost into one total:

```ts
let subTokens = 0;
const tool = researcher.asTool({
  onUsage: (turn) => {
    subTokens += turn.inputTokens + turn.outputTokens;
  },
});
```

## MCP export {#mcp}

`serveMcp` (from `toad-runtime/mcp`) exposes compiled agents as [Model Context Protocol](https://modelcontextprotocol.io) tools over stdio, so any MCP client (Claude Desktop, Claude Code, …) can call them. Each agent becomes one tool whose input schema is its declared `inputs`; calling it runs the full tool-use loop and returns the result as text (and as `structuredContent` for object results).

```ts
// researcher.mcp.ts
import { serveMcp } from "toad-runtime/mcp";
import { researcher } from "./researcher.js";

serveMcp([researcher]);
```

```json
// an MCP client's config
{
  "mcpServers": {
    "researcher": { "command": "node", "args": ["researcher.mcp.js"] }
  }
}
```

Pass a record (`{ find: researcher }`) to choose the tool name. The server is a small, dependency-free JSON-RPC 2.0 implementation; `createMcpHandler` is the transport-free core if you need to drive a different transport.

## Lifecycle & errors

- **Hooks** — `onToolCall`, `onToolResult`, `onToolResultEncoded`, `onUsage`, `onError`.
- **`retries`** — retry the model call on transient errors.
- **`maxTurns`** — cap the tool-use loop; exceeding it throws `MaxTurnsError`.
- **Typed errors** — `MaxTurnsError`, `OutputParseError` (structured output failed validation), `ToolError` (a tool body threw).

```ts
import { MaxTurnsError, OutputParseError, ToolError } from "toad-runtime";
```
