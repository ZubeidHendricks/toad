import type { PromptSegment } from "./ast.js";

export interface ParseTemplateResult {
  segments: PromptSegment[];
  errors: string[];
}

const SEGMENT_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Parse a string into literal/interpolation segments. `{ a.b }` is an
 * interpolation over a dotted path; `{{` and `}}` are literal braces. Path
 * validation (root must be `inputs`, etc.) happens in `validate`, not here.
 */
export function parsePromptTemplate(text: string): ParseTemplateResult {
  const segments: PromptSegment[] = [];
  const errors: string[] = [];
  let buf = "";

  const flush = (): void => {
    if (buf.length > 0) {
      segments.push({ kind: "text", value: buf });
      buf = "";
    }
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    const next = text[i + 1];

    if (ch === "{" && next === "{") {
      buf += "{";
      i += 2;
      continue;
    }
    if (ch === "}" && next === "}") {
      buf += "}";
      i += 2;
      continue;
    }
    if (ch === "{") {
      const end = text.indexOf("}", i + 1);
      if (end === -1) {
        errors.push("unterminated interpolation: missing '}'");
        buf += ch;
        i += 1;
        continue;
      }
      const expr = text.slice(i + 1, end).trim();
      const path = expr.split(".").map((p) => p.trim());
      if (expr === "" || path.some((p) => !SEGMENT_IDENT.test(p))) {
        errors.push(`invalid interpolation: {${expr}}`);
      } else {
        flush();
        segments.push({ kind: "interp", path });
      }
      i = end + 1;
      continue;
    }
    if (ch === "}") {
      errors.push("unexpected '}' (use '}}' for a literal brace)");
      buf += ch;
      i += 1;
      continue;
    }

    buf += ch;
    i += 1;
  }

  flush();
  return { segments, errors };
}
