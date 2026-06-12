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
