import Anthropic from "@anthropic-ai/sdk";

/**
 * A minimal seam over the Anthropic Messages API. The runtime is written
 * against this interface so the agent loop can be tested without a network
 * call; `anthropicClient()` is the real adapter. See architecture.md §6.
 */

export interface LlmToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface LlmText {
  type: "text";
  text: string;
}

export type LlmBlock = LlmToolUse | LlmText | { type: string };

export interface LlmMessage {
  role: "user" | "assistant";
  content: unknown;
}

export interface LlmTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: { type: "ephemeral" };
}

export interface LlmRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system?: unknown;
  tools?: LlmTool[];
  messages: LlmMessage[];
}

/** Token usage reported by the API for a single model call (wire shape). */
export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface LlmResponse {
  content: LlmBlock[];
  stop_reason: string | null;
  usage?: LlmUsage;
}

/** A streamed text delta and/or usage update from the model. */
export interface LlmStreamChunk {
  text?: string;
  /**
   * Usage so far, when the provider reports it (`message_start` carries the
   * input side; `message_delta` carries the cumulative output side). Fields
   * are cumulative — consumers should merge by taking maxima, not summing.
   */
  usage?: LlmUsage;
  /**
   * Terminal chunk: the fully-assembled assistant message for this call, once
   * the stream is complete. Carries the content blocks (including `tool_use`
   * with parsed input) and the stop reason, so a streaming tool loop can
   * execute the requested tools and continue. A client that streams MUST emit
   * exactly one of these last; text-only consumers ignore it.
   */
  message?: LlmResponse;
}

/** Per-call options (cancellation). */
export interface LlmCallOptions {
  signal?: AbortSignal;
}

export interface LlmClient {
  create(req: LlmRequest, options?: LlmCallOptions): Promise<LlmResponse>;
  /** Optional: stream text deltas for a request. */
  stream?(
    req: LlmRequest,
    options?: LlmCallOptions,
  ): AsyncIterable<LlmStreamChunk>;
}

/**
 * Real client backed by `@anthropic-ai/sdk`. SDK request/response typings are
 * intentionally cast at this boundary; the live integration test (E6) covers
 * the wire shape.
 */
export function anthropicClient(options?: { apiKey?: string }): LlmClient {
  const client = new Anthropic(
    options?.apiKey ? { apiKey: options.apiKey } : {},
  );
  return {
    async create(req, options) {
      const res = (await client.messages.create(
        req as never,
        options?.signal ? { signal: options.signal } : undefined,
      )) as unknown as LlmResponse;
      const out: LlmResponse = {
        content: res.content,
        stop_reason: res.stop_reason,
      };
      if (res.usage !== undefined) {
        out.usage = res.usage;
      }
      return out;
    },
    async *stream(req, options) {
      const runner = client.messages.stream(
        req as never,
        options?.signal ? { signal: options.signal } : undefined,
      );
      const events = runner as unknown as AsyncIterable<{
        type?: string;
        delta?: { type?: string; text?: string };
        message?: { usage?: LlmUsage };
        usage?: LlmUsage;
      }>;
      for await (const event of events) {
        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta" &&
          typeof event.delta.text === "string"
        ) {
          yield { text: event.delta.text };
        } else if (
          event.type === "message_start" &&
          event.message?.usage !== undefined
        ) {
          yield { usage: event.message.usage };
        } else if (
          event.type === "message_delta" &&
          event.usage !== undefined
        ) {
          yield { usage: event.usage };
        }
      }
      // Terminal chunk: the SDK accumulates content blocks (including tool_use
      // with parsed input) into the final message; surface it so the streaming
      // tool loop can act on tool calls.
      const final = (await (
        runner as unknown as { finalMessage(): Promise<LlmResponse> }
      ).finalMessage()) as LlmResponse;
      const message: LlmResponse = {
        content: final.content,
        stop_reason: final.stop_reason,
      };
      if (final.usage !== undefined) {
        message.usage = final.usage;
      }
      yield { message };
    },
  };
}
