import type { ZodType } from "zod";

/**
 * A typed tool. The tool's *name* comes from the key it is registered under in
 * an agent's `tools` record, so it isn't part of the definition itself.
 */
export interface ToolDef<I = unknown> {
  description: string;
  /** Zod schema for the tool input; also the source of its JSON schema. */
  input: ZodType<I>;
  run: (input: I) => unknown | Promise<unknown>;
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
