import type { PromptSegment } from "./ast.js";

export interface ParseTemplateResult {
  segments: PromptSegment[];
  errors: string[];
}

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const EACH =
  /^#each\s+([A-Za-z_][A-Za-z0-9_.]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/;

interface Frame {
  segs: PromptSegment[];
  each?: { source: string[]; item: string };
}

/**
 * Parse a prompt string into segments. Supports:
 *   - `{ a.b }`           interpolation over a dotted path
 *   - `{#each xs as x}…{/each}`  iterate an array input (body is a sub-template)
 *   - `{{` / `}}`         literal braces
 *
 * Directive lines are treated as control lines: the newline immediately after
 * `{#each …}` and after `{/each}` is consumed, so a block on its own lines emits
 * one clean body per element. Path/scope validation happens in `validate`.
 */
export function parsePromptTemplate(text: string): ParseTemplateResult {
  const errors: string[] = [];
  const root: PromptSegment[] = [];
  const stack: Frame[] = [{ segs: root }];
  let buf = "";

  const top = (): Frame => stack[stack.length - 1]!;
  const flush = (): void => {
    if (buf.length > 0) {
      top().segs.push({ kind: "text", value: buf });
      buf = "";
    }
  };
  const eatNewline = (i: number): number => (text[i] === "\n" ? i + 1 : i);

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
      const inner = text.slice(i + 1, end).trim();

      if (inner.startsWith("#each")) {
        const m = EACH.exec(inner);
        if (!m) {
          errors.push(
            `invalid {#each}: {${inner}} (use {#each inputs.xs as x})`,
          );
          i = end + 1;
          continue;
        }
        flush();
        stack.push({
          segs: [],
          each: { source: m[1]!.split("."), item: m[2]! },
        });
        i = eatNewline(end + 1);
        continue;
      }

      if (inner === "/each") {
        flush();
        const frame = top();
        if (frame.each === undefined) {
          errors.push("unexpected {/each}");
          i = end + 1;
          continue;
        }
        stack.pop();
        top().segs.push({
          kind: "each",
          source: frame.each.source,
          item: frame.each.item,
          body: frame.segs,
        });
        i = eatNewline(end + 1);
        continue;
      }

      if (inner === "" || !PATH.test(inner)) {
        errors.push(`invalid interpolation: {${inner}}`);
        i = end + 1;
        continue;
      }
      flush();
      top().segs.push({ kind: "interp", path: inner.split(".") });
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
  if (stack.length > 1) {
    errors.push("unclosed {#each} (missing {/each})");
  }
  return { segments: root, errors };
}
