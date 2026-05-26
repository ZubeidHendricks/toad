import type { PromptSegment } from "./ast.js";

export interface ParseTemplateResult {
  segments: PromptSegment[];
  errors: string[];
}

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const EACH =
  /^#each\s+([A-Za-z_][A-Za-z0-9_.]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/;
const IF = /^#if\s+(!?)\s*([A-Za-z_][A-Za-z0-9_.]*)$/;

interface Frame {
  kind: "root" | "each" | "if";
  /** The collection currently being appended to (then- or else-branch for if). */
  segs: PromptSegment[];
  source?: string[];
  item?: string;
  cond?: string[];
  negate?: boolean;
  thenSegs?: PromptSegment[];
  elseSegs?: PromptSegment[];
}

/**
 * Parse a prompt string into segments. Supports:
 *   - `{ a.b }`                         interpolation over a dotted path
 *   - `{#each xs as x}…{/each}`          iterate an array input
 *   - `{#if inputs.flag}…{:else}…{/if}`  conditional (boolean input; `!` negates)
 *   - `{{` / `}}`                       literal braces
 *
 * Block directives are control lines: the newline immediately after each is
 * consumed. Path/scope/type validation happens in `validate`.
 */
export function parsePromptTemplate(text: string): ParseTemplateResult {
  const errors: string[] = [];
  const root: PromptSegment[] = [];
  const stack: Frame[] = [{ kind: "root", segs: root }];
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
          kind: "each",
          segs: [],
          source: m[1]!.split("."),
          item: m[2]!,
        });
        i = eatNewline(end + 1);
        continue;
      }

      if (inner.startsWith("#if")) {
        const m = IF.exec(inner);
        if (!m) {
          errors.push(
            `invalid {#if}: {${inner}} (use {#if inputs.flag} or {#if !inputs.flag})`,
          );
          i = end + 1;
          continue;
        }
        flush();
        const thenSegs: PromptSegment[] = [];
        const elseSegs: PromptSegment[] = [];
        stack.push({
          kind: "if",
          segs: thenSegs,
          cond: m[2]!.split("."),
          negate: m[1] === "!",
          thenSegs,
          elseSegs,
        });
        i = eatNewline(end + 1);
        continue;
      }

      if (inner === ":else") {
        flush();
        const frame = top();
        if (frame.kind !== "if") {
          errors.push("unexpected {:else}");
          i = end + 1;
          continue;
        }
        frame.segs = frame.elseSegs!;
        i = eatNewline(end + 1);
        continue;
      }

      if (inner === "/if") {
        flush();
        const frame = top();
        if (frame.kind !== "if") {
          errors.push("unexpected {/if}");
          i = end + 1;
          continue;
        }
        stack.pop();
        top().segs.push({
          kind: "if",
          cond: frame.cond!,
          negate: frame.negate!,
          then: frame.thenSegs!,
          else: frame.elseSegs!,
        });
        i = eatNewline(end + 1);
        continue;
      }

      if (inner === "/each") {
        flush();
        const frame = top();
        if (frame.kind !== "each") {
          errors.push("unexpected {/each}");
          i = end + 1;
          continue;
        }
        stack.pop();
        top().segs.push({
          kind: "each",
          source: frame.source!,
          item: frame.item!,
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
    errors.push("unclosed block (missing {/each} or {/if})");
  }
  return { segments: root, errors };
}
