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
  system?: unknown;
  tools?: LlmTool[];
  messages: LlmMessage[];
}

export interface LlmResponse {
  content: LlmBlock[];
  stop_reason: string | null;
}

/** A streamed text delta from the model. */
export interface LlmStreamChunk {
  text?: string;
}

export interface LlmClient {
  create(req: LlmRequest): Promise<LlmResponse>;
  /** Optional: stream text deltas for a request. */
  stream?(req: LlmRequest): AsyncIterable<LlmStreamChunk>;
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
    async create(req) {
      const res = (await client.messages.create(
        req as never,
      )) as unknown as LlmResponse;
      return { content: res.content, stop_reason: res.stop_reason };
    },
    async *stream(req) {
      const events = client.messages.stream(req as never) as AsyncIterable<{
        type?: string;
        delta?: { type?: string; text?: string };
      }>;
      for await (const event of events) {
        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta" &&
          typeof event.delta.text === "string"
        ) {
          yield { text: event.delta.text };
        }
      }
    },
  };
}
