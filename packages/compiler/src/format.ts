/**
 * The canonical formatter behind `toac fmt` — the gofmt/rustfmt of TOAD. It
 * reorders top-level keys into the spec's schema order, normalizes indentation,
 * key spacing, blank lines, and the trailing newline, and re-indents block
 * scalars while preserving their content exactly (via the same dedent rule the
 * preprocessor uses, so a prompt's meaning never changes).
 *
 * Safety: the formatted output is re-parsed and its AST compared to the input's;
 * if they differ at all, the file is left untouched and an error is reported.
 * `toac fmt` therefore can never change what an agent means.
 */

import type { AgentAst } from "./ast.js";
import { analyze } from "./analyze.js";
import { errorDiagnostic, type Diagnostic } from "./diagnostics.js";

/** Top-level keys in the order the spec's §3 schema table lists them. */
const CANONICAL_ORDER = [
  "agent",
  "model",
  "description",
  "inputs",
  "tools",
  "prompt",
  "outputs",
  "system",
  "uses",
  "maxTurns",
  "retries",
  "temperature",
];

export interface FormatResult {
  /** The canonical text; `undefined` when the file could not be formatted. */
  code?: string;
  /** Whether the canonical text differs from the input. */
  changed: boolean;
  /** Errors (an unparseable file, or a failed safety check) — empty on success. */
  diagnostics: Diagnostic[];
}

interface Section {
  key: string;
  header: string;
  body: string[];
  block: boolean;
}

/**
 * Format one `.agent` source. Only well-formed files are formatted; an invalid
 * file is returned unchanged with its diagnostics, so `toac fmt` reports errors
 * the same way `toac check` does.
 */
export function formatAgent(source: string, file = "<input>"): FormatResult {
  const { ast, diagnostics } = analyze(source, file);
  if (ast === undefined) {
    return { changed: false, diagnostics };
  }

  const sections = parseSections(source).map(formatSection);
  // Stable sort by canonical position keeps any unrecognized keys in place.
  sections.sort((a, b) => rank(a.key) - rank(b.key));
  const code = sections.map(renderSection).join("\n") + "\n";

  // Never change meaning: the result must parse back to an identical AST.
  const check = analyze(code, file);
  if (check.ast === undefined || !sameAst(check.ast, ast)) {
    return {
      changed: false,
      diagnostics: [
        errorDiagnostic(
          "TOA010",
          "could not format this file without changing its meaning (please report this)",
          file,
        ),
      ],
    };
  }
  return { code, changed: code !== source, diagnostics: [] };
}

function rank(key: string): number {
  const i = CANONICAL_ORDER.indexOf(key);
  return i === -1 ? CANONICAL_ORDER.length : i;
}

const BLOCK_HEADER = /:\s*\|\s*$/;

/** Split source into top-level sections: a key line plus its indented body. */
function parseSections(source: string): Section[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "" || leadingSpaces(line) > 0) {
      // A blank line or a stray indented line outside any section: skip it.
      i++;
      continue;
    }
    const header = line;
    const key = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(line)?.[1] ?? line.trim();
    const body: string[] = [];
    i++;
    while (i < lines.length) {
      const l = lines[i]!;
      if (l.trim() === "" || leadingSpaces(l) > 0) {
        body.push(l);
        i++;
      } else {
        break;
      }
    }
    while (body.length > 0 && body[body.length - 1]!.trim() === "") {
      body.pop();
    }
    sections.push({ key, header, body, block: BLOCK_HEADER.test(header) });
  }
  return sections;
}

function formatSection(s: Section): Section {
  return { ...s, header: formatHeader(s.header), body: formatBody(s) };
}

/** Normalize a key line: trim, one space after the structural colon. */
function formatHeader(header: string): string {
  const h = header.replace(/\s+$/, "");
  const colon = h.indexOf(":");
  if (colon === -1) return h;
  const left = h.slice(0, colon).replace(/\s+$/, "");
  const right = h.slice(colon + 1).trim();
  return right === "" ? `${left}:` : `${left}: ${right}`;
}

/**
 * Re-indent a section's body to a 2-space step. The common leading indent is
 * stripped and replaced with two spaces (mirroring the preprocessor's dedent,
 * so the lowered text is unchanged). For tabular rows, trailing whitespace is
 * stripped; for block scalars it is preserved, since it is part of the prompt.
 */
function formatBody(s: Section): string[] {
  const nonBlank = s.body.filter((l) => l.trim() !== "");
  if (nonBlank.length === 0) return [];
  const base = Math.min(...nonBlank.map(leadingSpaces));
  return s.body.map((l) => {
    if (l.trim() === "") return "";
    const content = l.slice(base);
    return `  ${s.block ? content : content.replace(/\s+$/, "")}`;
  });
}

function renderSection(s: Section): string {
  return [s.header, ...s.body].join("\n");
}

function leadingSpaces(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === " ") n++;
  return n;
}

/** Structural equality of two ASTs (plain data, so a JSON compare suffices). */
function sameAst(a: AgentAst, b: AgentAst): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
