import type { EachItem, PromptSegment } from "./ast.js";

/** A parse error and the character offset (into the template text) it points at. */
export interface TemplateError {
  message: string;
  offset: number;
}

export interface ParseTemplateResult {
  segments: PromptSegment[];
  errors: TemplateError[];
}

type EachSeg = Extract<PromptSegment, { kind: "each" }>;
type IfSeg = Extract<PromptSegment, { kind: "if" }>;

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const EACH =
  /^#each\s+([A-Za-z_][A-Za-z0-9_.]*)\s+as\s+(\{[^}]*\}|[A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z_][A-Za-z0-9_]*))?$/;
const IF = /^#if\s+(!?)\s*([A-Za-z_][A-Za-z0-9_.]*)$/;
const ELSE_IF = /^:else if\s+(!?)\s*([A-Za-z_][A-Za-z0-9_.]*)$/;

interface Branch {
  cond: string[];
  negate: boolean;
  body: PromptSegment[];
}

interface Frame {
  kind: "root" | "each" | "if";
  /** The collection currently being appended to. */
  segs: PromptSegment[];
  /** Offset of the opening `{#each`/`{#if`, for locating an unclosed block. */
  start?: number;
  // each
  source?: string[];
  item?: EachItem;
  index?: string;
  body?: PromptSegment[];
  // each + if (the {:else} branch)
  elseSegs?: PromptSegment[];
  // if (the {#if}/{:else if} branches)
  branches?: Branch[];
}

/**
 * Parse a prompt string into segments. Supports:
 *   - `{ a.b }` / `{ env.X }`                 interpolation
 *   - `{#each xs as x, i}…{:else}…{/each}`     loop (index + empty fallback)
 *   - `{#if a}…{:else if b}…{:else}…{/if}`     conditional chain
 *   - `{{` / `}}`                             literal braces
 *
 * `{:else if}` desugars to a nested `{#if}` in the else branch, so the `if`
 * segment stays a simple then/else. Block directives are control lines (the
 * newline immediately after each is consumed). Validation happens in `validate`.
 */
export function parsePromptTemplate(text: string): ParseTemplateResult {
  const errors: TemplateError[] = [];
  const err = (message: string, offset: number): void => {
    errors.push({ message, offset });
  };
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
      // Find the matching close brace, allowing one nested `{...}` (e.g. a
      // destructure pattern in `{#each xs as {a, b}}`).
      let end = -1;
      let depth = 0;
      for (let j = i; j < text.length; j++) {
        if (text[j] === "{") {
          depth += 1;
        } else if (text[j] === "}") {
          depth -= 1;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      if (end === -1) {
        err("unterminated interpolation: missing '}'", i);
        buf += ch;
        i += 1;
        continue;
      }
      const inner = text.slice(i + 1, end).trim();

      if (inner.startsWith("#each")) {
        const m = EACH.exec(inner);
        if (!m) {
          err(
            `invalid {#each}: {${inner}} (use {#each inputs.xs as x} or {#each inputs.xs as x, i})`,
            i,
          );
          i = end + 1;
          continue;
        }
        flush();
        const body: PromptSegment[] = [];
        const bind = m[2]!;
        const item: EachItem = bind.startsWith("{")
          ? {
              kind: "destructure",
              fields: bind
                .slice(1, -1)
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
            }
          : { kind: "name", name: bind };
        const frame: Frame = {
          kind: "each",
          segs: body,
          source: m[1]!.split("."),
          item,
          body,
          elseSegs: [],
          start: i,
        };
        if (m[3] !== undefined) {
          frame.index = m[3];
        }
        stack.push(frame);
        i = eatNewline(end + 1);
        continue;
      }

      if (inner.startsWith("#if")) {
        const m = IF.exec(inner);
        if (!m) {
          err(
            `invalid {#if}: {${inner}} (use {#if inputs.flag} or {#if !inputs.flag})`,
            i,
          );
          i = end + 1;
          continue;
        }
        flush();
        const first: Branch = {
          cond: m[2]!.split("."),
          negate: m[1] === "!",
          body: [],
        };
        stack.push({
          kind: "if",
          segs: first.body,
          branches: [first],
          elseSegs: [],
          start: i,
        });
        i = eatNewline(end + 1);
        continue;
      }

      if (inner.startsWith(":else if")) {
        const m = ELSE_IF.exec(inner);
        const frame = top();
        if (!m) {
          err(`invalid {:else if}: {${inner}}`, i);
          i = end + 1;
          continue;
        }
        if (frame.kind !== "if") {
          err("unexpected {:else if}", i);
          i = end + 1;
          continue;
        }
        flush();
        const branch: Branch = {
          cond: m[2]!.split("."),
          negate: m[1] === "!",
          body: [],
        };
        frame.branches!.push(branch);
        frame.segs = branch.body;
        i = eatNewline(end + 1);
        continue;
      }

      if (inner === ":else") {
        flush();
        const frame = top();
        if (frame.kind !== "if" && frame.kind !== "each") {
          err("unexpected {:else}", i);
          i = end + 1;
          continue;
        }
        frame.segs = frame.elseSegs!;
        i = eatNewline(end + 1);
        continue;
      }

      if (inner === "/each") {
        flush();
        const frame = top();
        if (frame.kind !== "each") {
          err("unexpected {/each}", i);
          i = end + 1;
          continue;
        }
        stack.pop();
        const seg: EachSeg = {
          kind: "each",
          source: frame.source!,
          item: frame.item!,
          body: frame.body!,
        };
        if (frame.index !== undefined) {
          seg.index = frame.index;
        }
        if (frame.elseSegs!.length > 0) {
          seg.else = frame.elseSegs;
        }
        top().segs.push(seg);
        i = eatNewline(end + 1);
        continue;
      }

      if (inner === "/if") {
        flush();
        const frame = top();
        if (frame.kind !== "if") {
          err("unexpected {/if}", i);
          i = end + 1;
          continue;
        }
        stack.pop();
        // Fold the branch chain into nested if/else segments.
        let elseChain: PromptSegment[] = frame.elseSegs!;
        const branches = frame.branches!;
        for (let k = branches.length - 1; k >= 0; k--) {
          const branch = branches[k]!;
          const ifSeg: IfSeg = {
            kind: "if",
            cond: branch.cond,
            negate: branch.negate,
            then: branch.body,
            else: elseChain,
          };
          elseChain = [ifSeg];
        }
        top().segs.push(elseChain[0]!);
        i = eatNewline(end + 1);
        continue;
      }

      if (inner === "" || !PATH.test(inner)) {
        err(`invalid interpolation: {${inner}}`, i);
        i = end + 1;
        continue;
      }
      flush();
      top().segs.push({ kind: "interp", path: inner.split(".") });
      i = end + 1;
      continue;
    }

    if (ch === "}") {
      err("unexpected '}' (use '}}' for a literal brace)", i);
      buf += ch;
      i += 1;
      continue;
    }

    buf += ch;
    i += 1;
  }

  flush();
  if (stack.length > 1) {
    // Point at the innermost unclosed block's opening directive.
    err(
      "unclosed block (missing {/each} or {/if})",
      top().start ?? text.length,
    );
  }
  return { segments: root, errors };
}
