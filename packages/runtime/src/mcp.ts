/**
 * `toad-runtime/mcp` — expose compiled TOAD agents as tools over the Model
 * Context Protocol. Each agent becomes one MCP tool: its declared `inputs`
 * schema is the tool's input schema, and calling it runs the agent's full
 * tool-use loop and returns the (typed) result.
 *
 * The server is a small, self-contained JSON-RPC 2.0 implementation over the
 * stdio transport (newline-delimited messages) — no MCP SDK dependency, in
 * keeping with the runtime staying dependency-light. `createMcpHandler` is the
 * pure, transport-free core (testable without spawning a process); `serveMcp`
 * wires it to a process's stdin/stdout.
 */

import { z, type ZodType } from "zod";
import { encode as toonEncode } from "@toon-format/toon";
import type { Agent } from "./agent.js";
import { RUNTIME_VERSION } from "./index.js";
import {
  extendChain,
  parseDelegationHeader,
  type DelegationContext,
} from "./delegation.js";

/** MCP `_meta` key under which a delegation chain rides on a `tools/call`. */
const DELEGATION_META_KEY = "toad/delegation";

/** The latest MCP protocol version this server implements. */
const PROTOCOL_VERSION = "2025-06-18";

/** Any agent, regardless of its input/output types, can be served. */
export type AnyAgent = Agent<any, any>;

/** Agents to expose, either as a list (keyed by `agent.name`) or by tool name. */
export type McpAgents = AnyAgent[] | Record<string, AnyAgent>;

export interface McpServerInfo {
  /** Server name reported in `initialize` (default `"toad"`). */
  name?: string;
  /** Server version reported in `initialize` (default the runtime version). */
  version?: string;
}

export interface McpHandlerOptions extends McpServerInfo {
  /**
   * How a non-string agent result is rendered into MCP text content:
   * - `"json"` (default): `JSON.stringify`.
   * - `"toon"`: TOON — fewer tokens for an MCP client that re-sends it to a model.
   * Object results are always also returned as `structuredContent`.
   */
  resultFormat?: "json" | "toon";
}

// --- JSON-RPC 2.0 shapes -----------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

// Standard JSON-RPC error codes.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface Servable {
  description: string;
  input: ZodType<unknown>;
  run: (input: unknown, delegation?: DelegationContext) => Promise<unknown>;
}

function normalize(agents: McpAgents): Map<string, Servable> {
  const entries: [string, AnyAgent][] = Array.isArray(agents)
    ? agents.map((a) => [a.name, a])
    : Object.entries(agents);
  const map = new Map<string, Servable>();
  for (const [name, agent] of entries) {
    if (map.has(name)) {
      throw new Error(`serveMcp: duplicate tool name "${name}"`);
    }
    const tool = agent.asTool();
    map.set(name, {
      description: tool.description,
      input: tool.input as ZodType<unknown>,
      run: (input, delegation) =>
        agent.run(input, delegation ? { delegation } : undefined),
    });
  }
  return map;
}

/**
 * Read an inbound delegation chain from a `tools/call`'s `_meta`, accepting
 * either the structured object or the `Toad-Delegation` header string, then
 * extend it by the served agent (this hop). A gateway in front sets it; the
 * served agent honors it, so the agent's own tool calls authorize against the
 * full chain. Absent ⇒ `undefined` (the run proceeds without a chain).
 */
function inboundDelegation(
  meta: unknown,
  toolName: string,
): DelegationContext | undefined {
  if (meta === null || typeof meta !== "object") return undefined;
  const raw = (meta as Record<string, unknown>)[DELEGATION_META_KEY];
  let ctx: DelegationContext | undefined;
  if (typeof raw === "string") {
    ctx = parseDelegationHeader(raw);
  } else if (
    raw !== null &&
    typeof raw === "object" &&
    Array.isArray((raw as DelegationContext).chain)
  ) {
    ctx = raw as DelegationContext;
  }
  if (ctx === undefined) return undefined;
  return extendChain(ctx, { id: `agent:${toolName}` });
}

function jsonSchema(schema: ZodType<unknown>): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  // MCP tool input schemas are JSON Schema objects; guarantee an object root
  // even for agents that declare no inputs.
  if (json.type === undefined) {
    json.type = "object";
  }
  return json;
}

function renderResult(value: unknown, format: "json" | "toon"): string {
  if (typeof value === "string") return value;
  if (format === "toon") {
    try {
      return toonEncode(value as never);
    } catch {
      // TOON only encodes the JSON data model; fall back.
    }
  }
  return JSON.stringify(value) ?? String(value);
}

function ok(id: JsonRpcRequest["id"], result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function fail(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
): JsonRpcError {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/** The pure, transport-free MCP server: turn one JSON-RPC message into a reply. */
export interface McpHandler {
  /** The tools this server exposes, in `tools/list` shape. */
  readonly tools: readonly McpTool[];
  /**
   * Handle one JSON-RPC message. Returns the response for a request, or `null`
   * for a notification (a message with no `id`, e.g. `notifications/initialized`).
   */
  handle(message: unknown): Promise<JsonRpcResponse | null>;
}

/**
 * Build the pure MCP request handler for a set of agents. Use this directly to
 * test or to drive a non-stdio transport; use `serveMcp` for the common case.
 */
export function createMcpHandler(
  agents: McpAgents,
  options: McpHandlerOptions = {},
): McpHandler {
  const servables = normalize(agents);
  const resultFormat = options.resultFormat ?? "json";
  const serverInfo = {
    name: options.name ?? "toad",
    version: options.version ?? RUNTIME_VERSION,
  };

  const tools: McpTool[] = [...servables.entries()].map(([name, s]) => ({
    name,
    description: s.description,
    inputSchema: jsonSchema(s.input),
  }));

  const callTool = async (id: JsonRpcRequest["id"], params: unknown) => {
    const p = (params ?? {}) as {
      name?: unknown;
      arguments?: unknown;
      _meta?: unknown;
    };
    if (typeof p.name !== "string") {
      return fail(id, INVALID_PARAMS, "tools/call requires a string `name`");
    }
    const servable = servables.get(p.name);
    if (servable === undefined) {
      // Per MCP, an unknown tool is reported as a tool error result, not a
      // protocol error, so the model can recover.
      return ok(id, errorContent(`unknown tool "${p.name}"`));
    }
    const parsed = servable.input.safeParse(p.arguments ?? {});
    if (!parsed.success) {
      return ok(id, errorContent(`invalid input: ${parsed.error.message}`));
    }
    try {
      const delegation = inboundDelegation(p._meta, p.name);
      const output = await servable.run(parsed.data, delegation);
      const text = renderResult(output, resultFormat);
      const result: Record<string, unknown> = {
        content: [{ type: "text", text }],
        isError: false,
      };
      if (output !== null && typeof output === "object") {
        result.structuredContent = output;
      }
      return ok(id, result);
    } catch (error) {
      return ok(id, errorContent(errorMessage(error)));
    }
  };

  const handle = async (message: unknown): Promise<JsonRpcResponse | null> => {
    if (
      message === null ||
      typeof message !== "object" ||
      (message as JsonRpcRequest).jsonrpc !== "2.0" ||
      typeof (message as JsonRpcRequest).method !== "string"
    ) {
      return fail(null, INVALID_REQUEST, "not a JSON-RPC 2.0 request");
    }
    const { id, method, params } = message as JsonRpcRequest;
    const isNotification = id === undefined;

    switch (method) {
      case "initialize": {
        const requested = (params as { protocolVersion?: unknown } | undefined)
          ?.protocolVersion;
        return ok(id, {
          protocolVersion:
            typeof requested === "string" ? requested : PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo,
        });
      }
      case "tools/list":
        return ok(id, { tools });
      case "tools/call":
        return callTool(id, params);
      case "ping":
        return ok(id, {});
      default:
        // Notifications (no id) never get a reply, even for unknown methods.
        return isNotification
          ? null
          : fail(id, METHOD_NOT_FOUND, `unknown method "${method}"`);
    }
  };

  return {
    get tools() {
      return tools;
    },
    handle,
  };
}

function errorContent(text: string): Record<string, unknown> {
  return { content: [{ type: "text", text }], isError: true };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface ServeMcpOptions extends McpHandlerOptions {
  /** Stream of newline-delimited JSON-RPC input (default `process.stdin`). */
  input?: NodeJS.ReadableStream;
  /** Stream to write newline-delimited JSON-RPC responses (default `process.stdout`). */
  output?: NodeJS.WritableStream;
  /** Called on a transport/parse error (default: log to stderr). */
  onError?: (error: unknown) => void;
}

/** A running MCP stdio server. */
export interface McpServer {
  /** Stop reading input and detach listeners. */
  close(): void;
}

/**
 * Serve `agents` as MCP tools over the stdio transport: read newline-delimited
 * JSON-RPC requests from stdin and write responses to stdout (logs MUST go to
 * stderr, never stdout — stdout is the protocol channel). Drop this in a tiny
 * entrypoint and point any MCP client (Claude Desktop, Claude Code, …) at it:
 *
 * ```ts
 * import { serveMcp } from "toad-runtime/mcp";
 * import { researcher } from "./researcher.js";
 * serveMcp([researcher]);
 * ```
 */
export function serveMcp(
  agents: McpAgents,
  options: ServeMcpOptions = {},
): McpServer {
  const handler = createMcpHandler(agents, options);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const onError = options.onError ?? ((e: unknown) => console.error(e));

  let buffer = "";
  let closed = false;

  // Responses are written in request order even though handlers resolve
  // concurrently: each line reserves a slot, and filled slots flush from the
  // front. (MCP clients match by `id`, so order is a courtesy, not required.)
  const queue: { filled: boolean; response: JsonRpcResponse | null }[] = [];
  const flush = (): void => {
    while (queue.length > 0 && queue[0]!.filled) {
      const { response } = queue.shift()!;
      if (response !== null && !closed) {
        output.write(JSON.stringify(response) + "\n");
      }
    }
  };

  const processLine = (line: string): void => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    const slot: { filled: boolean; response: JsonRpcResponse | null } = {
      filled: false,
      response: null,
    };
    queue.push(slot);
    const settle = (response: JsonRpcResponse | null): void => {
      slot.filled = true;
      slot.response = response;
      flush();
    };
    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch {
      settle(fail(null, PARSE_ERROR, "invalid JSON"));
      return;
    }
    handler.handle(message).then(settle, (error) => {
      onError(error);
      settle(null);
    });
  };

  const onData = (chunk: Buffer | string): void => {
    buffer += chunk.toString();
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      processLine(line);
    }
  };

  input.on("data", onData);
  input.on("error", onError);

  return {
    close() {
      closed = true;
      input.off("data", onData);
      input.off("error", onError);
    },
  };
}
