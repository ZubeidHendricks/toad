/**
 * `@toa/compiler` — the `toac` compiler: `.agent` (a TOON superset) → typed `.ts`.
 *
 * Scaffold for story E0. The pipeline (preprocess → TOON decode → validate →
 * codegen) lands across epics E1–E4 — see `_bmad-output/epics.md`. The
 * `Diagnostic`/`CompileResult` shapes below are the real contracts from
 * `_bmad-output/architecture.md` §4 and are intentionally seeded here.
 */

export const COMPILER_VERSION = "0.0.0";

export interface Diagnostic {
  severity: "error" | "warning";
  /** Stable code, e.g. "TOA001". */
  code: string;
  message: string;
  file: string;
  line?: number;
  col?: number;
}

export interface CompileResult {
  /** Emitted TypeScript, present only when there are no error diagnostics. */
  code?: string;
  diagnostics: Diagnostic[];
}

/** Pipeline entry point — a stub until epics E1–E4 implement the stages. */
export function compile(_source: string, file = "<input>"): CompileResult {
  return {
    diagnostics: [
      {
        severity: "error",
        code: "TOA000",
        message: "compiler not implemented yet (epics E1–E4)",
        file,
      },
    ],
  };
}
