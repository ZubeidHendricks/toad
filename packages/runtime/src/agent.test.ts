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
