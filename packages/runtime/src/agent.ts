import { z, type ZodType } from "zod";
import { encode as toonEncode } from "@toon-format/toon";
import {
  anthropicClient,
  type LlmClient,
  type LlmMessage,
  type LlmRequest,
  type LlmResponse,
  type LlmText,
  type LlmTool,
  type LlmToolUse,
} from "./client.js";
import { MaxTurnsError, OutputParseError, ToolError } from "./errors.js";
import type { AnyToolDef, ToolDef } from "./tool.js";

const RESPOND_TOOL = "respond";

/** Token cost of a tool result, reported to `onToolResultEncoded`. */
export interface ToolResultEncoding {
  tool: string;
  format: "json" | "toon";
  /** Estimated tokens the JSON encoding would have cost. */
  jsonTokens: number;
  /** Estimated tokens actually sent to the model. */
  sentTokens: number;
  /** `jsonTokens - sentTokens` (0 when JSON was sent). */
  savedTokens: number;
}

export interface AgentHooks {
  onToolCall?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, output: unknown) => void;
  onError?: (error: unknown) => void;
  /**
   * Called after each tool result is serialized, with the token cost of the
   * chosen encoding vs JSON. Sum `savedTokens` to log "saved N tokens this run"
   * when using `toolResultFormat: "auto"` or `"toon"`.
   */
  onToolResultEncoded?: (info: ToolResultEncoding) => void;
}

export interface AgentConfig<I, O> {
  name: string;
  model: string;
  description?: string;
  tools?: Record<string, AnyToolDef>;
  /** Schema for the agent's inputs; lets it be used as a tool via `asTool()`. */
  inputSchema?: ZodType<I>;
  /** When set, the agent must return a value matching this schema. */
  outputSchema?: ZodType<O>;
  prompt: (inputs: I) => string;
  /** Optional system prompt; defaults to the description. */
  system?: (inputs: I) => string;
  maxTurns?: number;
  maxTokens?: number;
  /** Retry the model call up to this many times on error. */
  retries?: number;
  /**
   * How non-string tool results are serialized back into the conversation:
   * - `"json"` (default): `JSON.stringify` — maximally compatible.
   * - `"toon"`: always encode objects/arrays as TOON — fewest tokens for
   *   uniform/tabular data, but the model must read TOON.
   * - `"auto"`: use TOON only when it is meaningfully smaller than JSON, else
   *   JSON. Never increases tokens; the recommended setting for token savings.
   */
  toolResultFormat?: "json" | "toon" | "auto";
  /** Observability / guardrail hooks. */
  hooks?: AgentHooks;
  /** Injectable for testing; defaults to the real Anthropic client. */
  client?: LlmClient;
}

export interface Agent<I, O> {
  readonly name: string;
  run(inputs: I): Promise<O>;
  /** Stream the model's text for the prompt (no tools / structured output). */
  stream(inputs: I): AsyncIterable<string>;
  /** Expose this agent as a tool that another agent can call. */
  asTool(options?: { description?: string }): ToolDef<I>;
}

/**
 * Build a runnable agent from a config. Runs a tool-use loop over the LLM:
 * send the prompt, execute any requested tools, feed results back, repeat until
 * the model finishes (or calls `respond` for structured output). See §6.
 */
export function createAgent<I, O = string>(
  config: AgentConfig<I, O>,
): Agent<I, O> {
  const maxTurns = config.maxTurns ?? 8;
  const maxTokens = config.maxTokens ?? 4096;
  const toolDefs = config.tools ?? {};

  const tools: LlmTool[] = Object.entries(toolDefs).map(([name, def]) => ({
    name,
    description: def.description,
    input_schema: toInputSchema(def.input),
  }));
  if (config.outputSchema) {
    tools.push({
      name: RESPOND_TOOL,
      description:
        "Return the final structured result. Call this exactly once when done.",
      input_schema: toInputSchema(config.outputSchema),
    });
  }
  if (tools.length > 0) {
    // Cache the (stable) tool prefix across turns.
    tools[tools.length - 1]!.cache_control = { type: "ephemeral" };
  }

  const systemFor = (inputs: I): string =>
    config.system
      ? config.system(inputs)
      : (config.description ?? `You are ${config.name}.`);

  const agent: Agent<I, O> = {
    name: config.name,
    async run(inputs: I): Promise<O> {
      const client = config.client ?? anthropicClient();
      const hooks = config.hooks;
      const attempts = (config.retries ?? 0) + 1;
      const callModel = async (req: LlmRequest): Promise<LlmResponse> => {
        let lastError: unknown;
        for (let attempt = 0; attempt < attempts; attempt++) {
          try {
            return await client.create(req);
          } catch (error) {
            lastError = error;
            hooks?.onError?.(error);
          }
        }
        throw lastError;
      };
      let userText = config.prompt(inputs);
      if (config.outputSchema) {
        userText += `\n\nWhen finished, call the \`${RESPOND_TOOL}\` tool with the final result.`;
      }
      const messages: LlmMessage[] = [{ role: "user", content: userText }];

      for (let turn = 0; turn < maxTurns; turn++) {
        const res = await callModel({
          model: config.model,
          max_tokens: maxTokens,
          system: [
            {
              type: "text",
              text: systemFor(inputs),
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: tools.length > 0 ? tools : undefined,
          messages,
        });

        const toolUses = res.content.filter(
          (b): b is LlmToolUse => b.type === "tool_use",
        );

        if (toolUses.length === 0) {
          if (config.outputSchema) {
            throw new OutputParseError(
              `agent "${config.name}" stopped without calling ${RESPOND_TOOL}`,
            );
          }
          return joinText(res.content) as O;
        }

        messages.push({ role: "assistant", content: res.content });
        const results: unknown[] = [];

        for (const tu of toolUses) {
          if (config.outputSchema && tu.name === RESPOND_TOOL) {
            const parsed = config.outputSchema.safeParse(tu.input);
            if (!parsed.success) {
              throw new OutputParseError(
                `agent "${config.name}" returned invalid output: ${parsed.error.message}`,
              );
            }
            return parsed.data;
          }
          const def = toolDefs[tu.name];
          if (!def) {
            results.push(toolResult(tu.id, `unknown tool "${tu.name}"`, true));
            continue;
          }
          const input = def.input.safeParse(tu.input);
          if (!input.success) {
            results.push(
              toolResult(tu.id, `invalid input: ${input.error.message}`, true),
            );
            continue;
          }
          hooks?.onToolCall?.(tu.name, input.data);
          let output: unknown;
          try {
            output = await def.run(input.data);
          } catch (err) {
            hooks?.onError?.(err);
            throw new ToolError(tu.name, err);
          }
          hooks?.onToolResult?.(tu.name, output);
          const enc = serializeResult(
            output,
            config.toolResultFormat ?? "json",
          );
          results.push(toolResult(tu.id, enc.text));
          hooks?.onToolResultEncoded?.({
            tool: tu.name,
            format: enc.format,
            jsonTokens: enc.jsonTokens,
            sentTokens: enc.sentTokens,
            savedTokens: Math.max(0, enc.jsonTokens - enc.sentTokens),
          });
        }

        messages.push({ role: "user", content: results });
      }

      throw new MaxTurnsError(maxTurns);
    },
    stream(inputs: I): AsyncIterable<string> {
      const client = config.client ?? anthropicClient();
      const userText = config.prompt(inputs);
      async function* generate(): AsyncGenerator<string> {
        if (client.stream === undefined) {
          throw new Error(
            `agent "${config.name}": the LLM client does not support streaming`,
          );
        }
        const req: LlmRequest = {
          model: config.model,
          max_tokens: maxTokens,
          system: [
            {
              type: "text",
              text: systemFor(inputs),
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: userText }],
        };
        for await (const chunk of client.stream(req)) {
          if (chunk.text !== undefined) {
            yield chunk.text;
          }
        }
      }
      return generate();
    },
    asTool(options) {
      const input =
        config.inputSchema ?? (z.object({}) as unknown as ZodType<I>);
      return {
        description:
          options?.description ??
          config.description ??
          `Run the ${config.name} agent.`,
        input,
        run: (value: I) => agent.run(value),
      };
    },
  };
  return agent;
}

function toInputSchema(schema: ZodType<any>): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function toolResult(id: string, content: string, isError = false): unknown {
  return isError
    ? { type: "tool_result", tool_use_id: id, content, is_error: true }
    : { type: "tool_result", tool_use_id: id, content };
}

function joinText(content: { type: string }[]): string {
  return content
    .filter((b): b is LlmText => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/**
 * Render a value for interpolation into a prompt. Scalars coerce to string
 * exactly as a template literal would; objects and arrays become TOON (the
 * token-efficient, LLM-legible encoding) instead of the useless `[object
 * Object]`. The compiler emits a call to this only for non-scalar inputs, so
 * scalar interpolations stay byte-identical to plain `${...}`.
 */
export function toonValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  try {
    return toonEncode(value as never);
  } catch {
    return JSON.stringify(value);
  }
}

/**
 * Approximate GPT-style token count. The runtime stays dependency-free, so this
 * is a heuristic (words ≈ 4 chars/token, numbers denser, symbols sparser), good
 * enough to report the savings reported via the `onToolResult` encoding hook.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  const pieces =
    text.match(
      /'(?:s|t|re|ve|m|ll|d)|[^\s\p{L}\p{N}]+|\s*\p{L}+|\s*\p{N}+|\s+/gu,
    ) ?? [];
  let tokens = 0;
  for (const piece of pieces) {
    const t = piece.trim();
    if (!t) tokens += Math.max(1, Math.ceil(piece.length / 6));
    else if (/\p{L}/u.test(t)) tokens += Math.max(1, Math.round(t.length / 4));
    else if (/\p{N}/u.test(t)) tokens += Math.max(1, Math.ceil(t.length / 3));
    else tokens += Math.max(1, Math.ceil(t.length / 2));
  }
  return tokens;
}

interface SerializedResult {
  /** The text sent back to the model. */
  text: string;
  /** Which encoding was chosen. */
  format: "json" | "toon";
  /** Estimated tokens the JSON encoding would have cost. */
  jsonTokens: number;
  /** Estimated tokens actually sent. */
  sentTokens: number;
}

/**
 * Serialize a tool result for the conversation. Strings pass through; objects
 * and arrays are encoded as JSON or TOON depending on `format`. TOON is a more
 * token-efficient, LLM-legible encoding of the JSON data model — see TOAD's
 * naming. `"auto"` only chooses TOON when it is at least 15% smaller, so it can
 * never make a result more expensive than JSON. Returns the chosen text plus
 * the token cost of JSON vs what was sent, so callers can measure savings.
 */
function serializeResult(
  value: unknown,
  format: "json" | "toon" | "auto",
): SerializedResult {
  if (typeof value === "string") {
    const t = estimateTokens(value);
    return { text: value, format: "json", jsonTokens: t, sentTokens: t };
  }
  const json = JSON.stringify(value) ?? String(value);
  const jsonTokens = estimateTokens(json);
  const measured = (text: string, fmt: "json" | "toon"): SerializedResult => ({
    text,
    format: fmt,
    jsonTokens,
    sentTokens: estimateTokens(text),
  });

  if (format === "json") return measured(json, "json");

  let toon: string;
  try {
    toon = toonEncode(value as never);
  } catch {
    // TOON can only encode the JSON data model; fall back for anything else.
    return measured(json, "json");
  }
  if (format === "toon") return measured(toon, "toon");
  // "auto": adopt TOON only on a clear win (guards against marginal swaps that
  // trade JSON's ubiquity for a few tokens).
  return toon.length <= json.length * 0.85
    ? measured(toon, "toon")
    : measured(json, "json");
}
