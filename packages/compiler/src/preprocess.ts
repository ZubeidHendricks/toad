import type { Diagnostic } from "./diagnostics.js";

export interface PreprocessResult {
  /** Valid TOON text, with Toa superset sugar (block scalars) lowered. */
  toon: string;
  /** Depth-0 key -> 1-based source line, for locating later diagnostics. */
  keyLines: Map<string, number>;
  diagnostics: Diagnostic[];
}

const BLOCK_HEADER = /^([A-Za-z_][A-Za-z0-9_.]*|"(?:[^"\\]|\\.)*"): *\| *$/;
// A top-level key is followed by `:` (scalars, block scalars) or `[` (tabular
// headers like `inputs[2]{name,type}:` and lists like `tools[2]:`); capture both
// so every key's line is recorded for diagnostics.
const TOP_LEVEL_KEY = /^([A-Za-z_][A-Za-z0-9_.]*|"(?:[^"\\]|\\.)*")(?::|\[)/;

/**
 * Lower the Toa superset to valid TOON. The only MVP extension is the block
 * scalar `key: |`, whose indented body is captured, dedented, TOON-escaped, and
 * re-emitted as a quoted string — so the real `@toon-format/toon` decoder parses
 * the result while authors still write clean multi-line prompts. See
 * `_bmad-output/architecture.md` §3.①.
 *
 * Indentation is space-based (TOON forbids tabs in indentation). Plain `|` only;
 * trailing blank lines are stripped, internal blank lines preserved.
 */
export function preprocess(source: string, _file: string): PreprocessResult {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const keyLines = new Map<string, number>();
  const diagnostics: Diagnostic[] = [];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const indent = leadingSpaces(raw);
    const content = raw.slice(indent);

    if (indent === 0) {
      const keyMatch = TOP_LEVEL_KEY.exec(content);
      if (keyMatch && !keyLines.has(keyMatch[1]!)) {
        keyLines.set(keyMatch[1]!, i + 1);
      }
    }

    const header = BLOCK_HEADER.exec(content);
    if (header) {
      const key = header[1]!;
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const line = lines[j] ?? "";
        if (line.trim() === "" || leadingSpaces(line) > indent) {
          body.push(line);
        } else {
          break;
        }
      }
      while (body.length > 0 && (body[body.length - 1] ?? "").trim() === "") {
        body.pop();
      }
      const nonBlankIndents = body
        .filter((l) => l.trim() !== "")
        .map(leadingSpaces);
      const base =
        nonBlankIndents.length > 0 ? Math.min(...nonBlankIndents) : 0;
      const text = body
        .map((l) => (l.trim() === "" ? "" : l.slice(base)))
        .join("\n");
      out.push(`${" ".repeat(indent)}${key}: "${toonEscape(text)}"`);
      i = j;
      continue;
    }

    out.push(raw);
    i++;
  }

  return { toon: out.join("\n"), keyLines, diagnostics };
}

function leadingSpaces(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === " ") {
    n++;
  }
  return n;
}

/** Escape a string as a TOON quoted-string body (spec §7.1 escape set). */
function toonEscape(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\\") {
      out += "\\\\";
    } else if (ch === '"') {
      out += '\\"';
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "\t") {
      out += "\\t";
    } else if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    } else {
      out += ch;
    }
  }
  return out;
}
