/**
 * `toad-compiler` — the `toac` compiler: `.agent` (a TOON superset) -> typed `.ts`.
 * Pipeline: preprocess -> TOON decode -> validate -> codegen.
 * See `_bmad-output/architecture.md`.
 */
import { analyze } from "./analyze.js";
import { generate } from "./codegen.js";
import type { Diagnostic } from "./diagnostics.js";

export const COMPILER_VERSION = "0.3.0";

export type { Diagnostic } from "./diagnostics.js";
export {
  errorDiagnostic,
  formatDiagnostic,
  renderDiagnostic,
} from "./diagnostics.js";
export { decodeToon, type DecodeToonResult } from "./toon.js";
export { preprocess, type PreprocessResult } from "./preprocess.js";
export { analyze, type AnalyzeResult } from "./analyze.js";
export { generate } from "./codegen.js";
export { formatAgent, type FormatResult } from "./format.js";
export {
  estimateAgentCost,
  formatCostReport,
  type CostReport,
} from "./cost.js";
export type {
  AgentAst,
  FieldDecl,
  PromptSegment,
  ToaType,
  ToaTypeBase,
} from "./ast.js";

export interface CompileResult {
  /** Emitted TypeScript, present only when there are no error diagnostics. */
  code?: string;
  diagnostics: Diagnostic[];
}

/** Compile `.agent` source to a TypeScript module, or return diagnostics. */
export function compile(source: string, file = "<input>"): CompileResult {
  const { ast, diagnostics } = analyze(source, file);
  if (ast === undefined) {
    return { diagnostics };
  }
  return { code: generate(ast), diagnostics };
}
