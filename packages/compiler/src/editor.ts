/**
 * Editor services — the single source of truth for hover and completion over
 * `.agent` files. These functions are editor-agnostic: positions are 0-based
 * (line, character), matching the Language Server Protocol, and results are
 * plain data with no editor SDK types. Both the bundled VS Code extension and
 * the standalone `toac lsp` server consume this module, so the two never drift.
 *
 * Pure and dependency-free (only `analyze`), so it is safe to bundle into the
 * browser playground alongside the rest of the compiler.
 */
import { analyze } from "./analyze.js";

/** One-line docs per top-level key, shown on hover and in completions. */
export const KEY_DOCS: Record<string, string> = {
  agent:
    "**agent** (required) — the agent's name: an identifier, also the emitted export and filename.",
  model: "**model** (required) — a Claude model id, e.g. `claude-opus-4-7`.",
  description:
    "**description** — one line on what the agent does; doubles as the default system prompt and the default tool description for `asTool()`.",
  inputs:
    "**inputs[N]{name,type}:** — N typed call parameters, one `name,type` row each. A trailing `?` (`detail?,string`) makes a field optional.",
  tools:
    "**tools[N]: a,b** — N tool names, implemented in the co-located `<agent>.tools.ts`.",
  prompt:
    "**prompt: |** (required) — the instruction prompt as an indented block. Supports `{inputs.x}`, `{env.X}`, `{#each}`, `{#if}`.",
  outputs:
    "**outputs[N]{name,type}:** — N typed result fields; the agent returns a validated object instead of free text.",
  system:
    "**system: |** — system prompt block; defaults to the description when absent.",
  uses: "**uses[N]: a,b** — sub-agents wired in as tools via `asTool()`.",
  maxTurns: "**maxTurns** — tool-use turn cap (default 8).",
  maxContextTokens:
    "**maxContextTokens** — soft per-turn context budget; oldest tool results are elided once a turn exceeds it.",
  retries: "**retries** — retry the model call this many times on error.",
  temperature:
    "**temperature** — sampling temperature, a number from 0 to 1; omit for the API default.",
};

/** Docs per template construct, shown on hover and in `{` completions. */
export const TEMPLATE_DOCS: Record<string, string> = {
  "#each":
    "`{#each inputs.xs as x}` … `{/each}` — iterate an array input. Index: `as x, i`; empty fallback: `{:else}`; destructure: `as {a, b}`.",
  "#if":
    "`{#if inputs.flag}` … `{:else if …}` … `{:else}` … `{/if}` — condition on a boolean input; a leading `!` negates.",
  ":else": "`{:else}` — the empty-list / false branch of `{#each}` or `{#if}`.",
  "/each": "`{/each}` — closes an `{#each}` block.",
  "/if": "`{/if}` — closes an `{#if}` block.",
  "inputs.": "`{inputs.<name>}` — interpolate a declared input.",
  "env.":
    "`{env.<NAME>}` — interpolate an environment variable (empty string when unset).",
};

/** Editor-agnostic completion item kinds (a subset of the LSP enum names). */
export type CompletionKind = "property" | "keyword" | "variable";

export interface CompletionItem {
  label: string;
  kind: CompletionKind;
  /** Short right-aligned annotation (LSP `detail`). */
  detail?: string;
  /** Markdown documentation. */
  documentation?: string;
  /** Text to insert; defaults to `label` when absent. */
  insertText?: string;
  /** When true, `insertText` is an LSP snippet (`$1`, `$0`, …). */
  snippet?: boolean;
}

export interface HoverResult {
  /** Markdown contents. */
  contents: string;
}

/** Declared input names for a document — from the AST, falling back to a scan. */
export function inputNames(source: string, file = "<input>"): string[] {
  try {
    const { ast } = analyze(source, file);
    if (ast) return ast.inputs.map((f) => f.name);
  } catch {
    // fall through to the regex scan — completions must work mid-edit
  }
  const names: string[] = [];
  const m = source.match(/^inputs\[\d+\][^\n]*\n((?:[ ]{2}[^\n]*\n?)*)/m);
  if (m) {
    for (const row of m[1]!.split("\n")) {
      const r = /^ {2}([A-Za-z_][A-Za-z0-9_]*)\??,/.exec(row);
      if (r) names.push(r[1]!);
    }
  }
  return names;
}

/** The text of a 0-based line, or "" when out of range. */
function lineAt(source: string, line: number): string {
  return source.split("\n")[line] ?? "";
}

/**
 * Hover info at a 0-based (line, character), or `undefined`. Resolves top-level
 * keys (`prompt:`, `inputs[…]:`) at column 0, the word being hovered counts.
 */
export function hoverAt(
  source: string,
  line: number,
  character: number,
): HoverResult | undefined {
  const text = lineAt(source, line);
  // Top-level keys: `key:` or `key[N]…:` at column 0.
  const m = /^([A-Za-z_][A-Za-z0-9_]*)(?=[:[])/.exec(text);
  if (m && KEY_DOCS[m[1]!] && character <= m[1]!.length) {
    return { contents: KEY_DOCS[m[1]!]! };
  }
  return undefined;
}

/**
 * Completions at a 0-based (line, character). Context-sensitive:
 * `{inputs.` → declared input names, `{` → template constructs, column 0 → keys.
 */
export function completionsAt(
  source: string,
  line: number,
  character: number,
  file = "<input>",
): CompletionItem[] {
  const before = lineAt(source, line).slice(0, character);

  // `{inputs.` -> declared input names.
  if (/\{inputs\.[A-Za-z0-9_]*$/.test(before)) {
    return inputNames(source, file).map((name) => ({
      label: name,
      kind: "variable" as const,
      detail: "declared input",
    }));
  }

  // `{` -> template constructs.
  if (/\{[#:/A-Za-z]*$/.test(before) && before.includes("{")) {
    return Object.entries(TEMPLATE_DOCS).map(([label, documentation]) => {
      const item: CompletionItem = { label, kind: "keyword", documentation };
      if (label === "#each") {
        item.insertText = "#each inputs.${1:items} as ${2:item}}\n$0\n{/each}";
        item.snippet = true;
      } else if (label === "#if") {
        item.insertText = "#if inputs.${1:flag}}\n$0\n{/if}";
        item.snippet = true;
      }
      return item;
    });
  }

  // Column 0 (typing a bare word) -> top-level keys.
  if (/^[A-Za-z]*$/.test(before)) {
    return Object.entries(KEY_DOCS).map(([key, documentation]) => {
      const item: CompletionItem = {
        label: key,
        kind: "property",
        documentation,
      };
      if (key === "inputs" || key === "outputs") {
        item.insertText = `${key}[\${1:1}]{name,type}:\n  \${2:name},\${3:string}`;
        item.snippet = true;
      } else if (key === "prompt" || key === "system") {
        item.insertText = `${key}: |\n  $0`;
        item.snippet = true;
      } else if (key === "tools" || key === "uses") {
        item.insertText = `${key}[\${1:1}]: \${2:name}`;
        item.snippet = true;
      } else {
        item.insertText = `${key}: $0`;
        item.snippet = true;
      }
      return item;
    });
  }

  return [];
}
