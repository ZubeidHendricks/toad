/**
 * The Toa agent AST — the frozen contract that codegen (E4) and the runtime (E3)
 * build against. See `_bmad-output/architecture.md` §4.
 */

export type ToaTypeBase = "string" | "number" | "boolean" | "object" | "enum";

export interface ToaType {
  base: ToaTypeBase;
  array: boolean;
  /** Field declarations, present when `base` is "object". */
  fields?: FieldDecl[];
  /** Literal values, present when `base` is "enum" (`"draft|final"`). */
  values?: string[];
}

export interface FieldDecl {
  name: string;
  type: ToaType;
  /** Declared with a trailing `?` (`name?,type`) — may be omitted. */
  optional?: boolean;
}

/**
 * A declared tool. The bare-name form (`tools[N]: a,b`) yields just a `name`,
 * binding to a `ToolDef` in the co-located `<agent>.tools.ts`. The typed
 * tabular form (`tools[N]{name,input}:`) additionally carries the tool's input
 * type, so the compiler owns the schema and the tools file supplies only the
 * `run` body.
 */
export interface ToolDecl {
  name: string;
  /** Declared input type (typed form only); an object type per §5. */
  input?: ToaType;
  /** Optional description sent to the model (the `{name,input,description}` form). */
  description?: string;
}

/** The binding of an `{#each}` loop: a single name or a destructure pattern. */
export type EachItem =
  | { kind: "name"; name: string }
  | { kind: "destructure"; fields: string[] };

export type PromptSegment =
  | { kind: "text"; value: string }
  | { kind: "interp"; path: string[] }
  | {
      kind: "each";
      source: string[];
      item: EachItem;
      index?: string;
      body: PromptSegment[];
      else?: PromptSegment[];
    }
  | {
      kind: "if";
      cond: string[];
      negate: boolean;
      then: PromptSegment[];
      else: PromptSegment[];
    };

export interface AgentAst {
  /** `agent` — also the emitted export symbol and filename stem. */
  name: string;
  model: string;
  description?: string;
  inputs: FieldDecl[];
  outputs: FieldDecl[];
  /** Declared tools; resolved against the co-located `<name>.tools.ts`. */
  tools: ToolDecl[];
  /** Sub-agent names used as tools (wired via `asTool()`). */
  uses: string[];
  prompt: PromptSegment[];
  /** Optional system prompt; defaults to the description at runtime. */
  system?: PromptSegment[];
  /** Max tool-use turns before giving up. */
  maxTurns?: number;
  /** Soft per-turn context-token budget; older tool results are elided over it. */
  maxContextTokens?: number;
  /** Retries for the model call on error. */
  retries?: number;
  /** Sampling temperature (0–1); omitted = the API default. */
  temperature?: number;
}
