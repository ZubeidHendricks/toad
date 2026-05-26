/**
 * The Toa agent AST — the frozen contract that codegen (E4) and the runtime (E3)
 * build against. See `_bmad-output/architecture.md` §4.
 */

export type ToaTypeBase = "string" | "number" | "boolean";

export interface ToaType {
  base: ToaTypeBase;
  array: boolean;
}

export interface FieldDecl {
  name: string;
  type: ToaType;
}

export type PromptSegment =
  | { kind: "text"; value: string }
  | { kind: "interp"; path: string[] }
  | { kind: "each"; source: string[]; item: string; body: PromptSegment[] }
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
  /** Tool names; resolved against the co-located `<name>.tools.ts`. */
  tools: string[];
  prompt: PromptSegment[];
}
