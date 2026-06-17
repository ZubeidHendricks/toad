import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAgent } from "./agent.js";
import type { LlmClient, LlmResponse } from "./client.js";
import { createMcpHandler, serveMcp, type JsonRpcSuccess } from "./mcp.js";
import { defineTool } from "./tool.js";
import type { DelegationContext } from "./delegation.js";

/** A client that replays a fixed script of responses, ignoring the request. */
function scriptedClient(responses: LlmResponse[]): LlmClient {
  let i = 0;
  return { create: async () => responses[i++]! };
}

/** A text-only agent: one model call, no tools, returns joined text. */
function echoAgent(name: string, text = "ok") {
  return createAgent({
    name,
    model: "m",
    description: `the ${name} agent`,
    inputSchema: z.object({ topic: z.string() }),
    prompt: (i: { topic: string }) => `about ${i.topic}`,
    client: scriptedClient([
      { stop_reason: "end_turn", content: [{ type: "text", text }] },
    ]),
  });
}

const req = (method: string, params?: unknown, id: number | string = 1) => ({
  jsonrpc: "2.0" as const,
  id,
  method,
  ...(params !== undefined ? { params } : {}),
});

function result(
  res: Awaited<ReturnType<ReturnType<typeof createMcpHandler>["handle"]>>,
) {
  expect(res).not.toBeNull();
  expect(res).toHaveProperty("result");
  return (res as JsonRpcSuccess).result as Record<string, unknown>;
}

describe("createMcpHandler", () => {
  it("lists each agent as a tool with its input schema", async () => {
    const handler = createMcpHandler([echoAgent("researcher")]);
    expect(handler.tools).toHaveLength(1);
    const res = result(await handler.handle(req("tools/list")));
    const tools = res.tools as Array<Record<string, unknown>>;
    expect(tools[0]!.name).toBe("researcher");
    expect(tools[0]!.description).toBe("the researcher agent");
    const schema = tools[0]!.inputSchema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect((schema.properties as Record<string, unknown>).topic).toBeDefined();
    // The JSON Schema is emitted clean (no $schema meta key).
    expect(schema.$schema).toBeUndefined();
  });

  it("uses record keys as tool names", async () => {
    const handler = createMcpHandler({ find: echoAgent("researcher") });
    expect(handler.tools.map((t) => t.name)).toEqual(["find"]);
  });

  it("rejects duplicate tool names", () => {
    expect(() =>
      createMcpHandler([echoAgent("dup"), echoAgent("dup")]),
    ).toThrow(/duplicate tool name/);
  });

  it("negotiates the protocol version back to the client", async () => {
    const handler = createMcpHandler([echoAgent("a")]);
    const res = result(
      await handler.handle(
        req("initialize", { protocolVersion: "2025-03-26" }),
      ),
    );
    expect(res.protocolVersion).toBe("2025-03-26");
    expect(res.capabilities).toEqual({ tools: {} });
    expect((res.serverInfo as Record<string, unknown>).name).toBe("toad");
  });

  it("runs the agent on tools/call and returns its text", async () => {
    const handler = createMcpHandler([echoAgent("researcher", "the answer")]);
    const res = result(
      await handler.handle(
        req("tools/call", {
          name: "researcher",
          arguments: { topic: "frogs" },
        }),
      ),
    );
    expect(res.isError).toBe(false);
    expect(res.content).toEqual([{ type: "text", text: "the answer" }]);
  });

  it("returns structuredContent for object results", async () => {
    const agent = createAgent({
      name: "summarize",
      model: "m",
      outputSchema: z.object({ summary: z.string() }),
      prompt: (i: { topic: string }) => `about ${i.topic}`,
      inputSchema: z.object({ topic: z.string() }),
      client: scriptedClient([
        {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "respond",
              input: { summary: "hi" },
            },
          ],
        },
      ]),
    });
    const handler = createMcpHandler([agent]);
    const res = result(
      await handler.handle(
        req("tools/call", { name: "summarize", arguments: { topic: "x" } }),
      ),
    );
    expect(res.structuredContent).toEqual({ summary: "hi" });
    expect(res.content).toEqual([{ type: "text", text: '{"summary":"hi"}' }]);
  });

  it("reports an unknown tool as a tool error, not a protocol error", async () => {
    const handler = createMcpHandler([echoAgent("a")]);
    const res = result(
      await handler.handle(req("tools/call", { name: "nope", arguments: {} })),
    );
    expect(res.isError).toBe(true);
    const content = res.content as Array<{ text: string }>;
    expect(content[0]!.text).toBe('unknown tool "nope"');
  });

  it("reports invalid tool input as a tool error", async () => {
    const handler = createMcpHandler([echoAgent("a")]);
    const res = result(
      await handler.handle(
        req("tools/call", { name: "a", arguments: { topic: 5 } }),
      ),
    );
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("invalid input");
  });

  it("answers ping", async () => {
    const handler = createMcpHandler([echoAgent("a")]);
    expect(result(await handler.handle(req("ping")))).toEqual({});
  });

  it("returns method-not-found for unknown request methods", async () => {
    const handler = createMcpHandler([echoAgent("a")]);
    const res = await handler.handle(req("frobnicate"));
    expect(res).toHaveProperty("error");
    expect((res as { error: { code: number } }).error.code).toBe(-32601);
  });

  it("ignores notifications (no id) and never replies", async () => {
    const handler = createMcpHandler([echoAgent("a")]);
    expect(
      await handler.handle({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    ).toBeNull();
    // Even an unknown notification gets no reply.
    expect(
      await handler.handle({ jsonrpc: "2.0", method: "whatever" }),
    ).toBeNull();
  });

  it("rejects a non-JSON-RPC message", async () => {
    const handler = createMcpHandler([echoAgent("a")]);
    const res = await handler.handle({ hello: "world" });
    expect((res as { error: { code: number } }).error.code).toBe(-32600);
  });
});

describe("delegation across the MCP boundary", () => {
  /** An agent that calls one tool and records the delegation chain it sees. */
  function guardedAgent(name: string, seen: { value?: DelegationContext }) {
    const peek = defineTool({
      description: "peek",
      input: z.object({}),
      run: (_input, ctx) => {
        seen.value = ctx?.delegation;
        return "ok";
      },
    });
    return createAgent({
      name,
      model: "m",
      inputSchema: z.object({}),
      tools: { peek },
      prompt: () => "go",
      client: scriptedClient([
        {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", id: "t1", name: "peek", input: {} }],
        },
        { stop_reason: "end_turn", content: [{ type: "text", text: "done" }] },
      ]),
    });
  }

  it("accepts a structured _meta chain and extends it by the served agent", async () => {
    const seen: { value?: DelegationContext } = {};
    const handler = createMcpHandler([guardedAgent("guarded", seen)]);
    await handler.handle(
      req("tools/call", {
        name: "guarded",
        arguments: {},
        _meta: {
          "toad/delegation": {
            subject: { id: "user:1" },
            chain: [{ id: "gateway" }, { id: "agent:client" }],
          },
        },
      }),
    );
    expect(seen.value?.chain.map((p) => p.id)).toEqual([
      "gateway",
      "agent:client",
      "agent:guarded",
    ]);
    expect(seen.value?.subject?.id).toBe("user:1");
  });

  it("accepts the Toad-Delegation header string form in _meta", async () => {
    const seen: { value?: DelegationContext } = {};
    const handler = createMcpHandler([guardedAgent("guarded", seen)]);
    await handler.handle(
      req("tools/call", {
        name: "guarded",
        arguments: {},
        _meta: { "toad/delegation": "subject=user%3A1; chain=gateway" },
      }),
    );
    expect(seen.value?.chain.map((p) => p.id)).toEqual([
      "gateway",
      "agent:guarded",
    ]);
  });

  it("runs without a chain when no _meta is present (backward compatible)", async () => {
    const seen: { value?: DelegationContext } = { value: { chain: [] } };
    const handler = createMcpHandler([guardedAgent("guarded", seen)]);
    await handler.handle(req("tools/call", { name: "guarded", arguments: {} }));
    expect(seen.value).toBeUndefined();
  });
});

describe("serveMcp (stdio transport)", () => {
  it("reads newline-delimited requests and writes framed responses", async () => {
    const { PassThrough } = await import("node:stream");
    const input = new PassThrough();
    const written: string[] = [];
    const output = {
      write: (chunk: string) => {
        written.push(chunk);
        return true;
      },
    } as unknown as NodeJS.WritableStream;

    const server = serveMcp([echoAgent("researcher", "hi")], { input, output });

    input.write(JSON.stringify(req("tools/list")) + "\n");
    input.write("{ not json }\n");
    input.write(
      JSON.stringify(
        req("tools/call", { name: "researcher", arguments: { topic: "z" } }, 2),
      ) + "\n",
    );
    // Let the queued async handlers settle.
    await new Promise((r) => setTimeout(r, 10));
    server.close();

    expect(written).toHaveLength(3);
    for (const line of written) expect(line.endsWith("\n")).toBe(true);
    const parsed = written.map((l) => JSON.parse(l));
    expect(parsed[0].result.tools[0].name).toBe("researcher");
    expect(parsed[1].error.code).toBe(-32700); // parse error
    expect(parsed[2].result.content[0].text).toBe("hi");
  });
});
