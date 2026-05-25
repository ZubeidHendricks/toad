/**
 * `@toa/compiler` — the `toac` compiler: `.agent` (a TOON superset) → typed `.ts`.
 *
 * The pipeline (preprocess → TOON decode → validate → codegen) is built across
 * epics E1–E4 — see `_bmad-output/epics.md`.
 */
import type { Diagnostic } from "./diagnostics.js";

export const COMPILER_VERSION = "0.0.0";

export type { Diagnostic } from "./diagnostics.js";
export { errorDiagnostic, formatDiagnostic } from "./diagnostics.js";
export { decodeToon, type DecodeToonResult } from "./toon.js";
export { preprocess, type PreprocessResult } from "./preprocess.js";
export { analyze, type AnalyzeResult } from "./analyze.js";
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

/** Pipeline entry point — a stub until epics E2–E4 wire the remaining stages. */
export function compile(_source: string, file = "<input>"): CompileResult {
  return {
    diagnostics: [
      {
        severity: "error",
        code: "TOA000",
        message: "compiler not implemented yet (epics E2–E4)",
        file,
      },
    ],
  };
}
