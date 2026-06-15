import type { ZodType } from "zod";

/** Passed to a tool's `run` so long-running tools can cooperate with callers. */
export interface ToolRunContext {
  /** Aborted when the caller cancels the run (`run(inputs, { signal })`). */
  signal?: AbortSignal;
}

/**
 * A typed tool. The tool's *name* comes from the key it is registered under in
 * an agent's `tools` record, so it isn't part of the definition itself.
 */
export interface ToolDef<I = unknown> {
  description: string;
  /** Zod schema for the tool input; also the source of its JSON schema. */
  input: ZodType<I>;
  /** Execution timeout (ms) for this tool; overrides the agent's `toolTimeoutMs`. */
  timeoutMs?: number;
  /**
   * Mark this tool's results as needed only once. After the model has seen a
   * result (i.e. on later turns), the runtime elides it from the conversation —
   * the result is sent in full to the next call, then replaced with a short
   * placeholder. Ideal for large one-shot payloads (a page fetch, a big query)
   * the model reads once and shouldn't pay to re-send every turn.
   */
  ephemeral?: boolean;
  run: (input: I, ctx?: ToolRunContext) => unknown | Promise<unknown>;
}

/** Identity helper that infers the tool's input type from its Zod schema. */
export function defineTool<I>(def: ToolDef<I>): ToolDef<I> {
  return def;
}

/**
 * A tool with its input type erased, for heterogeneous registries where each
 * tool has a different input. Any `ToolDef<X>` is assignable to `AnyToolDef`;
 * the schema validates the real input at runtime.
 */
export type AnyToolDef = ToolDef<any>;
