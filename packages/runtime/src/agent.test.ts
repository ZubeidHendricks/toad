import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAgent } from "./agent.js";
import type { LlmClient, LlmRequest, LlmResponse } from "./client.js";
import { MaxTurnsError, OutputParseError } from "./errors.js";
import { defineTool } from "./tool.js";

/** A client that replays a fixed script of responses, ignoring the request. */
function scriptedClient(responses: LlmResponse[]): LlmClient {
  let i = 0;
  return { create: async () => responses[i++]! };
}

describe("createAgent", () => {
  it("runs a tool, then returns structured output via respond", async () => {
    const calls: string[] = [];
    const search = defineTool({
      description: "search the web",
      input: z.object({ query: z.string() }),
      run: ({ query }) => {
        calls.push(query);
        return `results for ${query}`;
      },
    });

    const client = scriptedClient([
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "search",
            input: { query: "cats" },
          },
        ],
      },
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t2",
            name: "respond",
            input: { answer: "done" },
          },
        ],
      },
    ]);

    const agent = createAgent({
      name: "demo",
      model: "claude-opus-4-7",
      tools: { search },
      outputSchema: z.object({ answer: z.string() }),
      prompt: (inputs: { q: string }) => `Q: ${inputs.q}`,
      client,
    });

    expect(await agent.run({ q: "hi" })).toEqual({ answer: "done" });
    expect(calls).toEqual(["cats"]);
  });

  it("returns joined text when there is no outputSchema", async () => {
    const client = scriptedClient([
      {
        stop_reason: "end_turn",
        content: [
          { type: "text", text: "hello " },
          { type: "text", text: "world" },
        ],
      },
    ]);
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: () => "hi",
      client,
    });
    expect(await agent.run({})).toBe("hello world");
  });

  it("throws MaxTurnsError when the model keeps calling tools", async () => {
    const loop = defineTool({
      description: "loops",
      input: z.object({}),
      run: () => "again",
    });
    const responses: LlmResponse[] = Array.from({ length: 10 }, () => ({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t", name: "loop", input: {} }],
    }));
    const agent = createAgent({
      name: "t",
      model: "m",
      tools: { loop },
      prompt: () => "go",
      maxTurns: 3,
      client: scriptedClient(responses),
    });
    await expect(agent.run({})).rejects.toBeInstanceOf(MaxTurnsError);
  });

  it("throws OutputParseError when respond input fails the schema", async () => {
    const client = scriptedClient([
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "t",
            name: "respond",
            input: { answer: 123 },
          },
        ],
      },
    ]);
    const agent = createAgent({
      name: "t",
      model: "m",
      outputSchema: z.object({ answer: z.string() }),
      prompt: () => "go",
      client,
    });
    await expect(agent.run({})).rejects.toBeInstanceOf(OutputParseError);
  });

  it("agent.asTool() exposes the agent as a typed tool (composition)", async () => {
    const inner = createAgent({
      name: "inner",
      model: "m",
      description: "the inner agent",
      inputSchema: z.object({ q: z.string() }),
      outputSchema: z.object({ a: z.string() }),
      prompt: (i: { q: string }) => `Q: ${i.q}`,
      client: scriptedClient([
        {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "r",
              name: "respond",
              input: { a: "from-inner" },
            },
          ],
        },
      ]),
    });

    const tool = inner.asTool();
    expect(tool.description).toBe("the inner agent");
    expect(await tool.run({ q: "hi" })).toEqual({ a: "from-inner" });
  });

  it("retries the model call on error", async () => {
    let calls = 0;
    const client: LlmClient = {
      create: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("transient");
        }
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "ok" }],
        };
      },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: () => "go",
      retries: 1,
      client,
    });
    expect(await agent.run({})).toBe("ok");
    expect(calls).toBe(2);
  });

  it("calls lifecycle hooks around tool use", async () => {
    const events: string[] = [];
    const search = defineTool({
      description: "search",
      input: z.object({ q: z.string() }),
      run: () => "R",
    });
    const client = scriptedClient([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "t", name: "search", input: { q: "x" } },
        ],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "done" }] },
    ]);
    const agent = createAgent({
      name: "t",
      model: "m",
      tools: { search },
      prompt: () => "go",
      client,
      hooks: {
        onToolCall: (name) => events.push(`call:${name}`),
        onToolResult: (name) => events.push(`result:${name}`),
      },
    });
    expect(await agent.run({})).toBe("done");
    expect(events).toEqual(["call:search", "result:search"]);
  });

  it("encodes tool results as TOON when toolResultFormat is 'auto'", async () => {
    const requests: LlmRequest[] = [];
    const rows = defineTool({
      description: "return tabular rows",
      input: z.object({}),
      run: () => ({
        results: [
          { rank: 1, title: "alpha", score: 0.9 },
          { rank: 2, title: "beta", score: 0.8 },
        ],
      }),
    });
    const client: LlmClient = {
      create: async (req) => {
        requests.push(req);
        return requests.length === 1
          ? {
              stop_reason: "tool_use",
              content: [{ type: "tool_use", id: "t", name: "rows", input: {} }],
            }
          : {
              stop_reason: "end_turn",
              content: [{ type: "text", text: "ok" }],
            };
      },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      tools: { rows },
      prompt: () => "go",
      toolResultFormat: "auto",
      client,
    });
    await agent.run({});
    // The second request carries the tool result; it should be TOON (tabular
    // header), not JSON (no leading brace / quoted keys).
    const content = JSON.stringify(requests[1]?.messages);
    expect(content).toContain("results[2]{rank,title,score}:");
    expect(content).not.toContain('{\\"results\\"');
  });

  it("keeps tool results as JSON by default", async () => {
    const requests: LlmRequest[] = [];
    const rows = defineTool({
      description: "return rows",
      input: z.object({}),
      run: () => ({ results: [{ rank: 1, title: "alpha" }] }),
    });
    const client: LlmClient = {
      create: async (req) => {
        requests.push(req);
        return requests.length === 1
          ? {
              stop_reason: "tool_use",
              content: [{ type: "tool_use", id: "t", name: "rows", input: {} }],
            }
          : {
              stop_reason: "end_turn",
              content: [{ type: "text", text: "ok" }],
            };
      },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      tools: { rows },
      prompt: () => "go",
      client,
    });
    await agent.run({});
    const content = JSON.stringify(requests[1]?.messages);
    expect(content).toContain("results");
    expect(content).toContain("rank");
    // JSON encoding keeps quoted keys; TOON's tabular header must be absent.
    expect(content).not.toContain("results[1]{");
  });

  it("reports token savings via onToolResultEncoded", async () => {
    const events: import("./agent.js").ToolResultEncoding[] = [];
    const rows = defineTool({
      description: "rows",
      input: z.object({}),
      run: () => ({
        results: [
          { rank: 1, title: "alpha", score: 0.9 },
          { rank: 2, title: "beta", score: 0.8 },
          { rank: 3, title: "gamma", score: 0.7 },
        ],
      }),
    });
    let n = 0;
    const client: LlmClient = {
      create: async () =>
        n++ === 0
          ? {
              stop_reason: "tool_use",
              content: [{ type: "tool_use", id: "t", name: "rows", input: {} }],
            }
          : {
              stop_reason: "end_turn",
              content: [{ type: "text", text: "ok" }],
            },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      tools: { rows },
      prompt: () => "go",
      toolResultFormat: "auto",
      client,
      hooks: { onToolResultEncoded: (info) => events.push(info) },
    });
    await agent.run({});
    expect(events).toHaveLength(1);
    expect(events[0]!.format).toBe("toon");
    expect(events[0]!.savedTokens).toBeGreaterThan(0);
    expect(events[0]!.sentTokens).toBeLessThan(events[0]!.jsonTokens);
  });

  it("streams text deltas via agent.stream()", async () => {
    const client: LlmClient = {
      create: async () => ({ stop_reason: "end_turn", content: [] }),
      async *stream() {
        yield { text: "Hello, " };
        yield { text: "world" };
      },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: () => "hi",
      client,
    });
    let out = "";
    for await (const chunk of agent.stream({})) {
      out += chunk;
    }
    expect(out).toBe("Hello, world");
  });

  it("uses the configured system prompt in the request", async () => {
    let captured: LlmRequest | undefined;
    const client: LlmClient = {
      create: async (req) => {
        captured = req;
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "ok" }],
        };
      },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      system: () => "SYSTEM-PROMPT",
      prompt: () => "hi",
      client,
    });
    await agent.run({});
    expect(JSON.stringify(captured?.system)).toContain("SYSTEM-PROMPT");
  });
});

describe("token usage accounting", () => {
  it("reports per-turn and cumulative usage via onUsage", async () => {
    const events: { turn: unknown; total: unknown }[] = [];
    const search = defineTool({
      description: "search",
      input: z.object({}),
      run: () => "R",
    });
    const client = scriptedClient([
      {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t", name: "search", input: {} }],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_creation_input_tokens: 50,
        },
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "done" }],
        usage: {
          input_tokens: 30,
          output_tokens: 10,
          cache_read_input_tokens: 50,
        },
      },
    ]);
    const agent = createAgent({
      name: "t",
      model: "m",
      tools: { search },
      prompt: () => "go",
      client,
      hooks: { onUsage: (turn, total) => events.push({ turn, total }) },
    });
    await agent.run({});
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      turn: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 50,
      },
      total: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 50,
      },
    });
    expect(events[1]!.total).toEqual({
      inputTokens: 130,
      outputTokens: 30,
      cacheReadTokens: 50,
      cacheWriteTokens: 50,
    });
  });

  it("is silent when the client reports no usage", async () => {
    let called = false;
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: () => "go",
      client: scriptedClient([
        { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] },
      ]),
      hooks: { onUsage: () => (called = true) },
    });
    await agent.run({});
    expect(called).toBe(false);
  });
});

describe("parallel tool execution", () => {
  it("runs same-turn tool calls concurrently, results in request order", async () => {
    let releaseA: () => void;
    const gate = new Promise<void>((r) => (releaseA = r));
    const a = defineTool({
      description: "a",
      input: z.object({}),
      // Resolves only after `b` has started — deadlocks if execution is serial.
      run: async () => {
        await gate;
        return "A";
      },
    });
    const b = defineTool({
      description: "b",
      input: z.object({}),
      run: () => {
        releaseA!();
        return "B";
      },
    });
    const requests: LlmRequest[] = [];
    const client: LlmClient = {
      create: async (req) => {
        requests.push(req);
        return requests.length === 1
          ? {
              stop_reason: "tool_use",
              content: [
                { type: "tool_use", id: "ta", name: "a", input: {} },
                { type: "tool_use", id: "tb", name: "b", input: {} },
              ],
            }
          : {
              stop_reason: "end_turn",
              content: [{ type: "text", text: "ok" }],
            };
      },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      tools: { a, b },
      prompt: () => "go",
      client,
    });
    expect(await agent.run({})).toBe("ok");
    const results = requests[1]!.messages[2]!.content as {
      tool_use_id: string;
      content: string;
    }[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["ta", "tb"]);
    expect(results.map((r) => r.content)).toEqual(["A", "B"]);
  });

  it("returns structured output without running sibling tools", async () => {
    let ran = false;
    const side = defineTool({
      description: "side effect",
      input: z.object({}),
      run: () => {
        ran = true;
        return "side";
      },
    });
    const agent = createAgent({
      name: "t",
      model: "m",
      tools: { side },
      outputSchema: z.object({ answer: z.string() }),
      prompt: () => "go",
      client: scriptedClient([
        {
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", id: "s", name: "side", input: {} },
            {
              type: "tool_use",
              id: "r",
              name: "respond",
              input: { answer: "done" },
            },
          ],
        },
      ]),
    });
    expect(await agent.run({})).toEqual({ answer: "done" });
    expect(ran).toBe(false);
  });
});

describe("temperature", () => {
  it("passes a configured temperature through to the request", async () => {
    let captured: LlmRequest | undefined;
    const client: LlmClient = {
      create: async (req) => {
        captured = req;
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "ok" }],
        };
      },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      temperature: 0.2,
      prompt: () => "go",
      client,
    });
    await agent.run({});
    expect(captured?.temperature).toBe(0.2);
  });

  it("omits temperature when not configured", async () => {
    let captured: LlmRequest | undefined;
    const client: LlmClient = {
      create: async (req) => {
        captured = req;
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "ok" }],
        };
      },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: () => "go",
      client,
    });
    await agent.run({});
    expect(captured !== undefined && "temperature" in captured).toBe(false);
  });
});

describe("agent.session() — multi-turn conversations", () => {
  it("keeps history across sends", async () => {
    const requests: LlmRequest[] = [];
    const client: LlmClient = {
      create: async (req) => {
        // Snapshot — the runtime keeps appending to the live messages array.
        requests.push({ ...req, messages: [...req.messages] });
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: `reply ${requests.length}` }],
        };
      },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: (i: { topic: string }) => `Research ${i.topic}`,
      client,
    });
    const session = agent.session({ topic: "frogs" });
    expect(await session.send()).toBe("reply 1");
    expect(await session.send("now summarize")).toBe("reply 2");

    // The second request carries the whole conversation.
    const m = requests[1]!.messages;
    expect(m).toHaveLength(3);
    expect(m[0]!.role).toBe("user");
    expect(JSON.stringify(m[0]!.content)).toContain("Research frogs");
    expect(m[1]!.role).toBe("assistant");
    expect(m[2]).toEqual({ role: "user", content: "now summarize" });
    expect(session.messages).toHaveLength(4);
  });

  it("appends a first-call message to the rendered prompt", async () => {
    let captured: LlmRequest | undefined;
    const client: LlmClient = {
      create: async (req) => {
        captured = req;
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "ok" }],
        };
      },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: () => "BASE",
      client,
    });
    await agent.session({}).send("EXTRA");
    expect(captured!.messages[0]!.content).toBe("BASE\n\nEXTRA");
  });

  it("requires a message after the first send", async () => {
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: () => "go",
      client: scriptedClient([
        { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] },
      ]),
    });
    const session = agent.session({});
    await session.send();
    await expect(session.send()).rejects.toThrow(/needs a message/);
  });

  it("runs tools mid-session and pairs respond with a tool_result", async () => {
    const search = defineTool({
      description: "search",
      input: z.object({ q: z.string() }),
      run: ({ q }) => `results for ${q}`,
    });
    const client = scriptedClient([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "t1", name: "search", input: { q: "x" } },
        ],
      },
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "r1", name: "respond", input: { a: "one" } },
        ],
      },
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "r2", name: "respond", input: { a: "two" } },
        ],
      },
    ]);
    const agent = createAgent({
      name: "t",
      model: "m",
      tools: { search },
      outputSchema: z.object({ a: z.string() }),
      prompt: () => "go",
      client,
    });
    const session = agent.session({});
    expect(await session.send()).toEqual({ a: "one" });
    // History ends with the respond acknowledged, so the next send is valid.
    const tail = session.messages[session.messages.length - 1]!;
    expect(tail.role).toBe("user");
    expect(JSON.stringify(tail.content)).toContain("r1");
    expect(await session.send("again")).toEqual({ a: "two" });
  });

  it("accumulates usage across sends on session.usage", async () => {
    const client = scriptedClient([
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "a" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "b" }],
        usage: {
          input_tokens: 20,
          output_tokens: 7,
          cache_read_input_tokens: 9,
        },
      },
    ]);
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: () => "go",
      client,
    });
    const session = agent.session({});
    await session.send();
    await session.send("more");
    expect(session.usage).toEqual({
      inputTokens: 30,
      outputTokens: 12,
      cacheReadTokens: 9,
      cacheWriteTokens: 0,
    });
  });
});

describe("stream usage", () => {
  it("reports merged usage via onUsage when the stream ends", async () => {
    const events: unknown[] = [];
    const client: LlmClient = {
      create: async () => ({ stop_reason: "end_turn", content: [] }),
      async *stream() {
        yield {
          usage: {
            input_tokens: 40,
            output_tokens: 1,
            cache_read_input_tokens: 30,
          },
        };
        yield { text: "Hello" };
        yield { usage: { input_tokens: 0, output_tokens: 12 } };
      },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: () => "hi",
      client,
      hooks: { onUsage: (turn, total) => events.push({ turn, total }) },
    });
    let out = "";
    for await (const chunk of agent.stream({})) out += chunk;
    expect(out).toBe("Hello");
    expect(events).toEqual([
      {
        turn: {
          inputTokens: 40,
          outputTokens: 12,
          cacheReadTokens: 30,
          cacheWriteTokens: 0,
        },
        total: {
          inputTokens: 40,
          outputTokens: 12,
          cacheReadTokens: 30,
          cacheWriteTokens: 0,
        },
      },
    ]);
  });
});

describe("session persistence", () => {
  it("round-trips a session through state", async () => {
    const client: LlmClient = {
      create: async (req) => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text: `n=${req.messages.length}` }],
        usage: { input_tokens: 10, output_tokens: 2 },
      }),
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: () => "go",
      client,
    });
    const a = agent.session({});
    await a.send();
    const saved = JSON.parse(JSON.stringify(a.state));

    // Restore into a brand-new session and keep talking.
    const b = agent.session({}, saved);
    expect(b.messages).toHaveLength(2);
    expect(await b.send("more")).toBe("n=3");
    expect(b.usage.inputTokens).toBe(20);
  });

  it("state is a snapshot — later sends don't mutate it", async () => {
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: () => "go",
      client: scriptedClient([
        { stop_reason: "end_turn", content: [{ type: "text", text: "a" }] },
        { stop_reason: "end_turn", content: [{ type: "text", text: "b" }] },
      ]),
    });
    const session = agent.session({});
    await session.send();
    const snap = session.state;
    await session.send("more");
    expect(snap.messages).toHaveLength(2);
    expect(session.messages).toHaveLength(4);
  });
});

describe("cancellation (AbortSignal)", () => {
  it("rejects before calling the model when already aborted", async () => {
    let called = false;
    const client: LlmClient = {
      create: async () => {
        called = true;
        return { stop_reason: "end_turn", content: [] };
      },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: () => "go",
      client,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      agent.run({}, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(called).toBe(false);
  });

  it("passes the signal to the client and does not retry an abort", async () => {
    let calls = 0;
    let seenSignal: AbortSignal | undefined;
    const controller = new AbortController();
    const client: LlmClient = {
      create: async (_req, options) => {
        calls += 1;
        seenSignal = options?.signal;
        controller.abort();
        throw new Error("aborted mid-flight");
      },
    };
    const agent = createAgent({
      name: "t",
      model: "m",
      prompt: () => "go",
      retries: 3,
      client,
    });
    await expect(agent.run({}, { signal: controller.signal })).rejects.toThrow(
      "aborted mid-flight",
    );
    expect(calls).toBe(1);
    expect(seenSignal).toBe(controller.signal);
  });

  it("exposes the signal to tools via the run context", async () => {
    let toolSignal: AbortSignal | undefined;
    const probe = defineTool({
      description: "probe",
      input: z.object({}),
      run: (_input, ctx) => {
        toolSignal = ctx?.signal;
        return "ok";
      },
    });
    const controller = new AbortController();
    const agent = createAgent({
      name: "t",
      model: "m",
      tools: { probe },
      prompt: () => "go",
      client: scriptedClient([
        {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", id: "t", name: "probe", input: {} }],
        },
        { stop_reason: "end_turn", content: [{ type: "text", text: "done" }] },
      ]),
    });
    await agent.run({}, { signal: controller.signal });
    expect(toolSignal).toBe(controller.signal);
  });
});

describe("tool timeouts", () => {
  it("fails the run with ToolError when a tool exceeds its timeoutMs", async () => {
    const slow = defineTool({
      description: "never finishes",
      input: z.object({}),
      timeoutMs: 10,
      run: () => new Promise(() => {}),
    });
    const agent = createAgent({
      name: "t",
      model: "m",
      tools: { slow },
      prompt: () => "go",
      client: scriptedClient([
        {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", id: "t", name: "slow", input: {} }],
        },
      ]),
    });
    await expect(agent.run({})).rejects.toThrow(/timed out after 10ms/);
  });

  it("uses the agent-level toolTimeoutMs as the default", async () => {
    const slow = defineTool({
      description: "never finishes",
      input: z.object({}),
      run: () => new Promise(() => {}),
    });
    const agent = createAgent({
      name: "t",
      model: "m",
      tools: { slow },
      toolTimeoutMs: 10,
      prompt: () => "go",
      client: scriptedClient([
        {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", id: "t", name: "slow", input: {} }],
        },
      ]),
    });
    await expect(agent.run({})).rejects.toThrow(/timed out after 10ms/);
  });

  it("a fast tool is unaffected by the timeout", async () => {
    const fast = defineTool({
      description: "fast",
      input: z.object({}),
      timeoutMs: 1000,
      run: () => "quick",
    });
    const agent = createAgent({
      name: "t",
      model: "m",
      tools: { fast },
      prompt: () => "go",
      client: scriptedClient([
        {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", id: "t", name: "fast", input: {} }],
        },
        { stop_reason: "end_turn", content: [{ type: "text", text: "done" }] },
      ]),
    });
    expect(await agent.run({})).toBe("done");
  });
});
