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
  type LlmUsage,
} from "./client.js";
import { MaxTurnsError, OutputParseError, ToolError } from "./errors.js";
import type { AnyToolDef, ToolDef, ToolRunContext } from "./tool.js";

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

/**
 * Token usage for one model call (or a running total across a run), as
 * reported by the API. Cache fields measure prompt caching at work: tokens
 * read from the cache are billed at a fraction of the input rate, so a high
 * `cacheReadTokens` is the multi-turn savings the runtime's `cache_control`
 * breakpoints exist to produce.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the prompt cache (cheap). */
  cacheReadTokens: number;
  /** Input tokens written to the prompt cache this call. */
  cacheWriteTokens: number;
}

/**
 * An estimate of how a model call's input tokens split across its parts. The
 * provider reports only a single input total, so the runtime estimates the
 * breakdown locally (same heuristic as elsewhere) — useful for seeing where
 * input tokens actually go, above all the conversation history that grows every
 * turn. Relative, not exact billing.
 */
export interface ContextBreakdown {
  /** Estimated tokens for the system prompt sent this call. */
  system: number;
  /** Estimated tokens for the tool definitions sent this call. */
  tools: number;
  /** Estimated tokens for the conversation messages (history) sent this call. */
  messages: number;
  /** `system + tools + messages`. */
  estimatedTotal: number;
}

export interface AgentHooks {
  onToolCall?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, output: unknown) => void;
  onError?: (error: unknown) => void;
  /**
   * Called after each model response with that call's token usage and the
   * cumulative total for the run — the framework's namesake, measured. Both
   * objects are snapshots; mutating them has no effect.
   */
  onUsage?: (turn: TokenUsage, total: TokenUsage) => void;
  /**
   * Called before each model call with an estimate of how the request's input
   * tokens split across system prompt, tool definitions, and conversation
   * history — the attribution the provider's usage totals don't give you. Watch
   * `messages` climb across turns to see history dominate a long loop.
   */
  onContext?: (breakdown: ContextBreakdown) => void;
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
  /** Sampling temperature (0–1); omitted = the API default. */
  temperature?: number;
  /** Retry the model call up to this many times on error. */
  retries?: number;
  /**
   * Default execution timeout (ms) for every tool; a tool's own `timeoutMs`
   * overrides it. A timed-out tool fails the run with a `ToolError`.
   */
  toolTimeoutMs?: number;
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

/** Per-call options for `run()` / `send()` / `stream()`. */
export interface RunOptions {
  /** Abort the run: cancels the in-flight model call and is visible to tools. */
  signal?: AbortSignal;
  /**
   * Hooks for just this call, merged over (not replacing) the agent's
   * configured `hooks` — both fire, config first. Useful for observing one
   * run, e.g. rolling a sub-agent's usage up into a parent (see `asTool`).
   */
  hooks?: AgentHooks;
}

/**
 * An event from `runStream()` — the full tool loop, observed as it happens:
 * - `text` — a streamed text delta from the model.
 * - `tool_use` — the model asked to call a tool (raw `input` as sent).
 * - `tool_result` — that tool ran; `output` is its (pre-serialization) result.
 * - `usage` — one model call's token usage and the running total.
 * - `done` — the loop finished; `output` is the typed result (joined text when
 *   the agent declares no `outputs`). Always the last event.
 */
export type AgentEvent<O = string> =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; output: unknown }
  | { type: "usage"; turn: TokenUsage; total: TokenUsage }
  | { type: "done"; output: O };

/**
 * A JSON-serializable snapshot of a session — persist it anywhere (a file, a
 * row, a KV store) and pass it back to `agent.session(inputs, state)` to
 * resume the conversation after a restart.
 */
export interface SessionState {
  messages: LlmMessage[];
  usage: TokenUsage;
}

/**
 * A multi-turn conversation with an agent. Each `send()` runs the full
 * tool-use loop and the conversation (including tool calls and results)
 * carries over to the next send, so the model keeps its context.
 */
export interface AgentSession<O = string> {
  /**
   * Send the next user message. On the first call the rendered prompt is
   * sent (an optional `message` is appended to it); afterwards `message` is
   * required. Returns the typed result, exactly like `run()`.
   */
  send(message?: string, options?: RunOptions): Promise<O>;
  /** A snapshot of the conversation so far. */
  readonly messages: readonly LlmMessage[];
  /** Cumulative token usage for the session (zeros if the client reports none). */
  readonly usage: TokenUsage;
  /** A JSON-serializable snapshot; restore with `agent.session(inputs, state)`. */
  readonly state: SessionState;
}

export interface Agent<I, O> {
  readonly name: string;
  run(inputs: I, options?: RunOptions): Promise<O>;
  /** Start (or, given a saved state, resume) a multi-turn conversation. */
  session(inputs: I, state?: SessionState): AgentSession<O>;
  /** Stream the model's text for the prompt (no tools / structured output). */
  stream(inputs: I, options?: RunOptions): AsyncIterable<string>;
  /**
   * Run the full tool loop, yielding {@link AgentEvent}s as they happen: text
   * deltas, tool calls and their results, per-call usage, and a final typed
   * `done` event. The streaming counterpart of `run()`.
   */
  runStream(inputs: I, options?: RunOptions): AsyncIterable<AgentEvent<O>>;
  /**
   * Expose this agent as a tool that another agent can call. The caller's
   * cancellation signal is forwarded to this agent's run; pass `onUsage` to
   * observe this sub-agent's token usage (e.g. to roll it up into a parent).
   */
  asTool(options?: {
    description?: string;
    onUsage?: AgentHooks["onUsage"];
  }): ToolDef<I>;
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

  const makeSession = (inputs: I, state?: SessionState): AgentSession<O> => {
    const client = config.client ?? anthropicClient();
    const attempts = (config.retries ?? 0) + 1;
    const callModel = async (
      req: LlmRequest,
      signal: AbortSignal | undefined,
      hooks: AgentHooks | undefined,
    ): Promise<LlmResponse> => {
      let lastError: unknown;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          return await client.create(req, signal ? { signal } : undefined);
        } catch (error) {
          // A cancellation is deliberate — don't burn retries on it.
          if (signal?.aborted) {
            throw error;
          }
          lastError = error;
          hooks?.onError?.(error);
        }
      }
      throw lastError;
    };

    const messages: LlmMessage[] = state ? [...state.messages] : [];
    const total: TokenUsage = state
      ? { ...state.usage }
      : {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };
    let started = messages.length > 0;

    const send = async (message?: string, options?: RunOptions): Promise<O> => {
      const signal = options?.signal;
      const hooks = mergeHooks(config.hooks, options?.hooks);
      let userText: string;
      if (!started) {
        started = true;
        userText = config.prompt(inputs);
        if (message !== undefined) {
          userText += `\n\n${message}`;
        }
      } else {
        if (message === undefined) {
          throw new Error(
            `agent "${config.name}": session.send() needs a message after the first turn`,
          );
        }
        userText = message;
      }
      if (config.outputSchema) {
        userText += `\n\nWhen finished, call the \`${RESPOND_TOOL}\` tool with the final result.`;
      }
      messages.push({ role: "user", content: userText });

      // Each send gets a fresh turn budget; the conversation carries over.
      for (let turn = 0; turn < maxTurns; turn++) {
        signal?.throwIfAborted();
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
          messages,
        };
        if (tools.length > 0) {
          req.tools = tools;
        }
        if (config.temperature !== undefined) {
          req.temperature = config.temperature;
        }
        reportContext(hooks, systemFor(inputs), tools, messages);
        const res = await callModel(req, signal, hooks);
        trackUsage(res, total, hooks);

        const toolUses = res.content.filter(
          (b): b is LlmToolUse => b.type === "tool_use",
        );

        if (toolUses.length === 0) {
          if (config.outputSchema) {
            throw new OutputParseError(
              `agent "${config.name}" stopped without calling ${RESPOND_TOOL}`,
            );
          }
          // Record the reply so a later send() continues the conversation.
          messages.push({ role: "assistant", content: res.content });
          return joinText(res.content) as O;
        }

        // Structured output ends the send; the model is done, so any sibling
        // tool calls in the same turn are moot and are not executed. The
        // respond call is acknowledged in history (a tool_use must be paired
        // with a tool_result) so the session stays valid for the next send.
        if (config.outputSchema) {
          const respond = toolUses.find((tu) => tu.name === RESPOND_TOOL);
          if (respond !== undefined) {
            const parsed = config.outputSchema.safeParse(respond.input);
            if (!parsed.success) {
              throw new OutputParseError(
                `agent "${config.name}" returned invalid output: ${parsed.error.message}`,
              );
            }
            messages.push({ role: "assistant", content: res.content });
            messages.push({
              role: "user",
              content: [toolResult(respond.id, "delivered")],
            });
            return parsed.data;
          }
        }

        messages.push({ role: "assistant", content: res.content });

        // Tools within one turn run concurrently (the model asked for all of
        // them at once); results are sent back in the model's request order.
        const execs = await runToolUses(
          toolUses,
          toolDefs,
          config,
          signal,
          hooks,
        );
        messages.push({ role: "user", content: execs.map((e) => e.content) });
      }

      throw new MaxTurnsError(maxTurns);
    };

    return {
      send,
      get messages(): readonly LlmMessage[] {
        return [...messages];
      },
      get usage(): TokenUsage {
        return { ...total };
      },
      get state(): SessionState {
        return {
          messages: structuredClone(messages),
          usage: { ...total },
        };
      },
    };
  };

  const agent: Agent<I, O> = {
    name: config.name,
    run(inputs: I, options?: RunOptions): Promise<O> {
      return makeSession(inputs).send(undefined, options);
    },
    session(inputs: I, state?: SessionState): AgentSession<O> {
      return makeSession(inputs, state);
    },
    stream(inputs: I, options?: RunOptions): AsyncIterable<string> {
      const client = config.client ?? anthropicClient();
      const userText = config.prompt(inputs);
      const signal = options?.signal;
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
        if (config.temperature !== undefined) {
          req.temperature = config.temperature;
        }
        // Stream usage arrives in cumulative pieces (input side at start,
        // output side as deltas) — merge by maxima, report once at the end.
        const usage: TokenUsage = {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };
        let sawUsage = false;
        for await (const chunk of client.stream(
          req,
          signal ? { signal } : undefined,
        )) {
          if (chunk.text !== undefined) {
            yield chunk.text;
          }
          if (chunk.usage !== undefined) {
            sawUsage = true;
            const u = chunk.usage;
            usage.inputTokens = Math.max(
              usage.inputTokens,
              u.input_tokens ?? 0,
            );
            usage.outputTokens = Math.max(
              usage.outputTokens,
              u.output_tokens ?? 0,
            );
            usage.cacheReadTokens = Math.max(
              usage.cacheReadTokens,
              u.cache_read_input_tokens ?? 0,
            );
            usage.cacheWriteTokens = Math.max(
              usage.cacheWriteTokens,
              u.cache_creation_input_tokens ?? 0,
            );
          }
        }
        if (sawUsage) {
          config.hooks?.onUsage?.({ ...usage }, { ...usage });
        }
      }
      return generate();
    },
    runStream(inputs: I, options?: RunOptions): AsyncIterable<AgentEvent<O>> {
      const client = config.client ?? anthropicClient();
      const signal = options?.signal;
      const hooks = mergeHooks(config.hooks, options?.hooks);
      async function* generate(): AsyncGenerator<AgentEvent<O>> {
        if (client.stream === undefined) {
          throw new Error(
            `agent "${config.name}": the LLM client does not support streaming`,
          );
        }
        let userText = config.prompt(inputs);
        if (config.outputSchema) {
          userText += `\n\nWhen finished, call the \`${RESPOND_TOOL}\` tool with the final result.`;
        }
        const messages: LlmMessage[] = [{ role: "user", content: userText }];
        const total: TokenUsage = {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };

        for (let turn = 0; turn < maxTurns; turn++) {
          signal?.throwIfAborted();
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
            messages,
          };
          if (tools.length > 0) {
            req.tools = tools;
          }
          if (config.temperature !== undefined) {
            req.temperature = config.temperature;
          }

          // Stream this call: emit text deltas live, merge cumulative usage by
          // maxima, and capture the terminal assembled message (with tool_use
          // blocks) the client yields last.
          const turnUsage: TokenUsage = {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          };
          let sawUsage = false;
          let message: LlmResponse | undefined;
          reportContext(hooks, systemFor(inputs), tools, messages);
          for await (const chunk of client.stream(
            req,
            signal ? { signal } : undefined,
          )) {
            if (chunk.text !== undefined) {
              yield { type: "text", text: chunk.text };
            }
            if (chunk.usage !== undefined) {
              sawUsage = true;
              mergeUsage(turnUsage, chunk.usage);
            }
            if (chunk.message !== undefined) {
              message = chunk.message;
            }
          }
          if (message === undefined) {
            throw new Error(
              `agent "${config.name}": stream ended without a final message`,
            );
          }
          if (message.usage !== undefined) {
            sawUsage = true;
            mergeUsage(turnUsage, message.usage);
          }
          if (sawUsage) {
            total.inputTokens += turnUsage.inputTokens;
            total.outputTokens += turnUsage.outputTokens;
            total.cacheReadTokens += turnUsage.cacheReadTokens;
            total.cacheWriteTokens += turnUsage.cacheWriteTokens;
            const totalSnapshot = { ...total };
            hooks?.onUsage?.({ ...turnUsage }, totalSnapshot);
            yield {
              type: "usage",
              turn: { ...turnUsage },
              total: totalSnapshot,
            };
          }

          const toolUses = message.content.filter(
            (b): b is LlmToolUse => b.type === "tool_use",
          );

          if (toolUses.length === 0) {
            if (config.outputSchema) {
              throw new OutputParseError(
                `agent "${config.name}" stopped without calling ${RESPOND_TOOL}`,
              );
            }
            yield { type: "done", output: joinText(message.content) as O };
            return;
          }

          if (config.outputSchema) {
            const respond = toolUses.find((tu) => tu.name === RESPOND_TOOL);
            if (respond !== undefined) {
              const parsed = config.outputSchema.safeParse(respond.input);
              if (!parsed.success) {
                throw new OutputParseError(
                  `agent "${config.name}" returned invalid output: ${parsed.error.message}`,
                );
              }
              yield { type: "done", output: parsed.data };
              return;
            }
          }

          messages.push({ role: "assistant", content: message.content });
          for (const tu of toolUses) {
            yield {
              type: "tool_use",
              id: tu.id,
              name: tu.name,
              input: tu.input,
            };
          }
          const execs = await runToolUses(
            toolUses,
            toolDefs,
            config,
            signal,
            hooks,
          );
          for (const e of execs) {
            yield {
              type: "tool_result",
              id: e.id,
              name: e.name,
              output: e.output,
            };
          }
          messages.push({ role: "user", content: execs.map((e) => e.content) });
        }
        throw new MaxTurnsError(maxTurns);
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
        run: (value: I, ctx?: ToolRunContext) => {
          // Forward the parent's cancellation, and optionally surface this
          // sub-agent's usage so a composition tree's cost can be aggregated.
          const runOptions: RunOptions = {};
          if (ctx?.signal !== undefined) runOptions.signal = ctx.signal;
          if (options?.onUsage !== undefined) {
            runOptions.hooks = { onUsage: options.onUsage };
          }
          return agent.run(value, runOptions);
        },
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

/**
 * Run a tool body with the caller's signal and an optional timeout. The
 * timeout rejects (the caller wraps it in `ToolError`); the underlying work is
 * also told to stop via the context signal where it cooperates.
 */
async function runTool(
  def: AnyToolDef,
  input: unknown,
  name: string,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const exec = Promise.resolve(def.run(input, signal ? { signal } : {}));
  if (timeoutMs === undefined) {
    return exec;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      exec,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** One executed tool call: its raw output and the tool_result block to send back. */
interface ToolExecution {
  id: string;
  name: string;
  /** The tool's pre-serialization result; `undefined` for unknown/invalid calls. */
  output: unknown;
  /** The `tool_result` content block fed back into the conversation. */
  content: unknown;
}

/**
 * Run the tools the model asked for in one turn. Calls run concurrently (the
 * model requested them together); hooks fire and results return in request
 * order. Shared by the blocking loop (`send`) and the streaming loop
 * (`runStream`). A tool that throws aborts the run with a `ToolError`; an
 * unknown tool or invalid input is fed back as an error tool_result so the
 * model can recover.
 */
async function runToolUses<I, O>(
  toolUses: LlmToolUse[],
  toolDefs: Record<string, AnyToolDef>,
  config: AgentConfig<I, O>,
  signal: AbortSignal | undefined,
  hooks: AgentHooks | undefined,
): Promise<ToolExecution[]> {
  return Promise.all(
    toolUses.map(async (tu): Promise<ToolExecution> => {
      const def = toolDefs[tu.name];
      if (!def) {
        return {
          id: tu.id,
          name: tu.name,
          output: undefined,
          content: toolResult(tu.id, `unknown tool "${tu.name}"`, true),
        };
      }
      const input = def.input.safeParse(tu.input);
      if (!input.success) {
        return {
          id: tu.id,
          name: tu.name,
          output: undefined,
          content: toolResult(
            tu.id,
            `invalid input: ${input.error.message}`,
            true,
          ),
        };
      }
      hooks?.onToolCall?.(tu.name, input.data);
      let output: unknown;
      try {
        output = await runTool(
          def,
          input.data,
          tu.name,
          def.timeoutMs ?? config.toolTimeoutMs,
          signal,
        );
      } catch (err) {
        hooks?.onError?.(err);
        throw new ToolError(tu.name, err);
      }
      hooks?.onToolResult?.(tu.name, output);
      const enc = serializeResult(output, config.toolResultFormat ?? "json");
      hooks?.onToolResultEncoded?.({
        tool: tu.name,
        format: enc.format,
        jsonTokens: enc.jsonTokens,
        sentTokens: enc.sentTokens,
        savedTokens: Math.max(0, enc.jsonTokens - enc.sentTokens),
      });
      return {
        id: tu.id,
        name: tu.name,
        output,
        content: toolResult(tu.id, enc.text),
      };
    }),
  );
}

/** Estimate the request's component sizes and report them via `onContext`. */
function reportContext(
  hooks: AgentHooks | undefined,
  systemText: string,
  tools: LlmTool[],
  messages: LlmMessage[],
): void {
  if (hooks?.onContext === undefined) return;
  const system = estimateTokens(systemText);
  const toolsTokens =
    tools.length > 0 ? estimateTokens(JSON.stringify(tools)) : 0;
  const messagesTokens = estimateTokens(JSON.stringify(messages));
  hooks.onContext({
    system,
    tools: toolsTokens,
    messages: messagesTokens,
    estimatedTotal: system + toolsTokens + messagesTokens,
  });
}

/** Compose two callbacks into one that invokes both, `f` first. */
function chain<T extends (...args: never[]) => void>(
  f: T | undefined,
  g: T | undefined,
): T | undefined {
  if (f === undefined) return g;
  if (g === undefined) return f;
  return ((...args: Parameters<T>) => {
    f(...args);
    g(...args);
  }) as T;
}

/**
 * Merge per-call hooks over the agent's configured hooks: for each event both
 * fire, `base` (config) first. Returns whichever is defined when only one is.
 */
function mergeHooks(
  base: AgentHooks | undefined,
  extra: AgentHooks | undefined,
): AgentHooks | undefined {
  if (base === undefined) return extra;
  if (extra === undefined) return base;
  return {
    onToolCall: chain(base.onToolCall, extra.onToolCall),
    onToolResult: chain(base.onToolResult, extra.onToolResult),
    onError: chain(base.onError, extra.onError),
    onUsage: chain(base.onUsage, extra.onUsage),
    onContext: chain(base.onContext, extra.onContext),
    onToolResultEncoded: chain(
      base.onToolResultEncoded,
      extra.onToolResultEncoded,
    ),
  };
}

/**
 * Merge one cumulative streamed usage update into a running per-call snapshot.
 * Stream usage arrives in pieces (input side at `message_start`, output side as
 * deltas); fields are cumulative, so merge by maxima rather than summing.
 */
function mergeUsage(into: TokenUsage, u: LlmUsage): void {
  into.inputTokens = Math.max(into.inputTokens, u.input_tokens ?? 0);
  into.outputTokens = Math.max(into.outputTokens, u.output_tokens ?? 0);
  into.cacheReadTokens = Math.max(
    into.cacheReadTokens,
    u.cache_read_input_tokens ?? 0,
  );
  into.cacheWriteTokens = Math.max(
    into.cacheWriteTokens,
    u.cache_creation_input_tokens ?? 0,
  );
}

/** Fold a response's usage into the running total and notify `onUsage`. */
function trackUsage(
  res: LlmResponse,
  total: TokenUsage,
  hooks: AgentHooks | undefined,
): void {
  const u: LlmUsage | undefined = res.usage;
  if (u === undefined) {
    return;
  }
  const turn: TokenUsage = {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
  total.inputTokens += turn.inputTokens;
  total.outputTokens += turn.outputTokens;
  total.cacheReadTokens += turn.cacheReadTokens;
  total.cacheWriteTokens += turn.cacheWriteTokens;
  hooks?.onUsage?.(turn, { ...total });
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
