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
  /** 1-based line of the primary span, when known. */
  line?: number;
  /** 1-based column of the primary span, when known. */
  col?: number;
  /** Width of the caret at (line, col); a frame underlines this many columns. */
  length?: number;
  /** A short hint shown under the frame, e.g. "did you mean `prompt`?". */
  help?: string;
}

/** Location and presentation details attached to a diagnostic. */
export interface DiagnosticLoc {
  line?: number;
  col?: number;
  length?: number;
  help?: string;
}

/** Build an error-severity diagnostic, attaching location only when known. */
export function errorDiagnostic(
  code: string,
  message: string,
  file: string,
  loc?: DiagnosticLoc,
): Diagnostic {
  const diagnostic: Diagnostic = { severity: "error", code, message, file };
  if (loc?.line !== undefined) diagnostic.line = loc.line;
  if (loc?.col !== undefined) diagnostic.col = loc.col;
  if (loc?.length !== undefined) diagnostic.length = loc.length;
  if (loc?.help !== undefined) diagnostic.help = loc.help;
  return diagnostic;
}

/** Format a diagnostic as `file:line:col severity CODE: message` (one line). */
export function formatDiagnostic(d: Diagnostic): string {
  const loc =
    d.line !== undefined
      ? `:${d.line}${d.col !== undefined ? `:${d.col}` : ""}`
      : "";
  return `${d.file}${loc} ${d.severity} ${d.code}: ${d.message}`;
}

/**
 * Render a diagnostic as a code frame, in the style of rustc/Elm:
 *
 * ```text
 * error[TOA202]: unknown key "promt"
 *   --> researcher.agent:4:1
 *    |
 *  4 | promt: |
 *    | ^^^^^ did you mean `prompt`?
 *    |
 * ```
 *
 * Falls back to a single line (with the `--> file` pointer) when the source or
 * line is unavailable, so it is always safe to call.
 */
export function renderDiagnostic(d: Diagnostic, source?: string): string {
  const head = `${d.severity}[${d.code}]: ${d.message}`;
  const locText =
    d.line !== undefined
      ? `:${d.line}${d.col !== undefined ? `:${d.col}` : ""}`
      : "";

  // No line, or no source to quote: keep it to the header plus a pointer.
  if (d.line === undefined || source === undefined) {
    const pointer = `\n  --> ${d.file}${locText}`;
    const help = d.help !== undefined ? `\n  = help: ${d.help}` : "";
    return head + pointer + help;
  }

  const srcLine = source.split("\n")[d.line - 1] ?? "";
  const gutter = String(d.line);
  const gw = gutter.length;
  // The numbered line is ` <num> | <src>`; the bar therefore sits at column
  // gw + 2 (leading space + gutter + space). Align every gutter line to it.
  const gutterPad = " ".repeat(gw + 2);
  const bar = `${gutterPad}|`;

  const lines = [head, `${" ".repeat(gw + 1)}--> ${d.file}${locText}`, bar];
  lines.push(` ${gutter} | ${srcLine}`);

  const col = d.col ?? 1;
  const length = d.length ?? 0;
  if (length > 0) {
    const caret =
      " ".repeat(Math.max(0, col - 1)) +
      "^".repeat(length) +
      (d.help !== undefined ? ` ${d.help}` : "");
    lines.push(`${bar} ${caret}`);
    lines.push(bar);
  } else {
    lines.push(bar);
    if (d.help !== undefined) lines.push(`${gutterPad}= help: ${d.help}`);
  }
  return lines.join("\n");
}

/**
 * The Levenshtein-closest candidate to `name`, for "did you mean?" hints.
 * Returns `undefined` when nothing is close enough (distance must be ≤ a third
 * of the name's length, min 1), so unrelated names don't produce noise.
 */
export function closest(
  name: string,
  candidates: Iterable<string>,
): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const d = editDistance(name, candidate);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  const threshold = Math.max(1, Math.floor(name.length / 3));
  return best !== undefined && bestDistance <= threshold ? best : undefined;
}

/**
 * Damerau–Levenshtein (optimal string alignment) edit distance: insertions,
 * deletions, substitutions, and adjacent transpositions each cost 1. Counting
 * transpositions as one edit matters because they are the most common typo
 * (e.g. `tpoic` → `topic`).
 */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) d[i]![0] = i;
  for (let j = 0; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }
  return d[m]![n]!;
}
