/**
 * Diagnostics shared across the compiler pipeline. User errors are collected and
 * reported here — never thrown (see `_bmad-output/architecture.md`, NFR4).
 *
 * Code ranges: TOA0xx general · TOA1xx parse/decode · TOA2xx validation ·
 * TOA3xx interpolation.
 */

export interface Diagnostic {
  severity: "error" | "warning";
  /** Stable code, e.g. "TOA101". */
  code: string;
  message: string;
  file: string;
  line?: number;
  col?: number;
}

/** Build an error-severity diagnostic, attaching location only when known. */
export function errorDiagnostic(
  code: string,
  message: string,
  file: string,
  loc?: { line?: number; col?: number },
): Diagnostic {
  const diagnostic: Diagnostic = { severity: "error", code, message, file };
  if (loc?.line !== undefined) {
    diagnostic.line = loc.line;
  }
  if (loc?.col !== undefined) {
    diagnostic.col = loc.col;
  }
  return diagnostic;
}

/** Format a diagnostic as `file:line:col severity CODE: message`. */
export function formatDiagnostic(d: Diagnostic): string {
  const loc =
    d.line !== undefined
      ? `:${d.line}${d.col !== undefined ? `:${d.col}` : ""}`
      : "";
  return `${d.file}${loc} ${d.severity} ${d.code}: ${d.message}`;
}
