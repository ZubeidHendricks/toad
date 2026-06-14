/**
 * `toac cost` — a static, offline estimate of an agent's per-turn token
 * footprint: the fixed prefix (system prompt + tool schemas + the structured-
 * output schema) that is sent on every model call, plus the static text of the
 * prompt template. This is the "what you pay before any data" floor — exactly
 * the part prompt caching serves cheaply — so it is the right thing to watch and
 * shrink. Tool-result and conversation-history tokens are runtime-dependent and
 * are reported by the runtime, not here.
 *
 * Estimates are heuristic (no network, no provider tokenizer), so treat them as
 * relative measures — compare agents, or before/after a change — not as exact
 * billing.
 */

import type { AgentAst, FieldDecl, PromptSegment, ToaType } from "./ast.js";

const RESPOND_DESCRIPTION =
  "Return the final structured result. Call this exactly once when done.";

export interface CostReport {
  /** System prompt (or the description fallback). */
  system: number;
  /** Static text of the prompt template — excludes interpolated input values. */
  prompt: number;
  /** The `respond` tool's schema, when the agent declares `outputs` (else 0). */
  outputSchema: number;
  /** Combined name + description + input schema of the typed tools. */
  typedTools: number;
  /** Number of typed tools counted in `typedTools`. */
  typedToolCount: number;
  /** Bare tool names whose schema lives in `.tools.ts` (not visible to toac). */
  bareTools: string[];
  /** Sub-agents wired in via `uses` (sized from their own `.agent`, not here). */
  usesCount: number;
  /**
   * The statically-known fixed prefix: system + typed-tool schemas + output
   * schema. The floor you pay every turn before any inputs, tool results, or
   * history — and the cached prefix when caching is on.
   */
  fixedTotal: number;
}

/** Estimate the per-turn token footprint of an agent from its AST. */
export function estimateAgentCost(ast: AgentAst): CostReport {
  const system = estimateTokens(
    ast.system !== undefined
      ? promptStaticText(ast.system)
      : (ast.description ?? `You are ${ast.name}.`),
  );
  const prompt = estimateTokens(promptStaticText(ast.prompt));

  const outputSchema =
    ast.outputs.length > 0
      ? estimateTokens(
          "respond" +
            RESPOND_DESCRIPTION +
            stableStringify(objectSchema(ast.outputs)),
        )
      : 0;

  let typedTools = 0;
  let typedToolCount = 0;
  const bareTools: string[] = [];
  for (const tool of ast.tools) {
    if (tool.input === undefined) {
      bareTools.push(tool.name);
      continue;
    }
    typedToolCount += 1;
    typedTools += estimateTokens(
      tool.name +
        (tool.description ?? tool.name) +
        stableStringify(jsonSchema(tool.input)),
    );
  }

  return {
    system,
    prompt,
    outputSchema,
    typedTools,
    typedToolCount,
    bareTools,
    usesCount: ast.uses.length,
    fixedTotal: system + typedTools + outputSchema,
  };
}

/** Render a cost report as a human-readable block for the CLI. */
export function formatCostReport(name: string, r: CostReport): string {
  const lines: string[] = [];
  const row = (label: string, value: string) => `  ${label.padEnd(22)}${value}`;
  lines.push(`${name} — estimated per-turn tokens (heuristic)`);
  lines.push("");
  lines.push(row("system prompt", `~${r.system}`));
  if (r.outputSchema > 0) {
    lines.push(row("output schema", `~${r.outputSchema}`));
  }
  if (r.typedToolCount > 0) {
    lines.push(
      row(
        "typed tool schemas",
        `~${r.typedTools}  (${r.typedToolCount} tool${r.typedToolCount === 1 ? "" : "s"})`,
      ),
    );
  }
  lines.push("  " + "─".repeat(34));
  lines.push(row("fixed prefix / turn", `~${r.fixedTotal}`));
  lines.push("");
  lines.push(
    row("prompt template", `~${r.prompt}  (excludes interpolated values)`),
  );
  if (r.bareTools.length > 0) {
    lines.push(
      row(
        "bare tools",
        `${r.bareTools.length} — schema in .tools.ts, not visible to toac`,
      ),
    );
  }
  if (r.usesCount > 0) {
    lines.push(
      row("sub-agents (uses)", `${r.usesCount} — sized from their own .agent`),
    );
  }
  lines.push("");
  lines.push(
    "  Heuristic estimate. Tool-result and history tokens are runtime-dependent;",
  );
  lines.push("  use the runtime token report for those.");
  return lines.join("\n");
}

/** Sum the static text of prompt segments (interpolations contribute nothing). */
function promptStaticText(segments: PromptSegment[]): string {
  let out = "";
  for (const seg of segments) {
    if (seg.kind === "text") {
      out += seg.value;
    } else if (seg.kind === "each") {
      out += promptStaticText(seg.body);
      if (seg.else) out += promptStaticText(seg.else);
    } else if (seg.kind === "if") {
      out += promptStaticText(seg.then) + promptStaticText(seg.else);
    }
    // interp segments are dynamic — excluded from the static estimate.
  }
  return out;
}

/** The JSON Schema the runtime would emit for a TOAD type (for sizing). */
function jsonSchema(t: ToaType): unknown {
  if (t.array) {
    return { type: "array", items: jsonSchema({ ...t, array: false }) };
  }
  switch (t.base) {
    case "string":
    case "number":
    case "boolean":
      return { type: t.base };
    case "enum":
      return { type: "string", enum: t.values ?? [] };
    case "object":
      return objectSchema(t.fields ?? []);
  }
}

function objectSchema(fields: FieldDecl[]): unknown {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of fields) {
    properties[f.name] = jsonSchema(f.type);
    if (f.optional !== true) required.push(f.name);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

/** Deterministic stringify (object key order is already insertion order). */
function stableStringify(value: unknown): string {
  return JSON.stringify(value) ?? "";
}

/**
 * Approximate token count — words ≈ 4 chars/token, numbers denser, symbols
 * sparser. Mirrors the runtime's estimator so static and runtime numbers are
 * comparable. Heuristic, not a provider tokenizer.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const pieces =
    text.match(
      /'(?:s|t|re|ve|m|ll|d)|[^\s\p{L}\p{N}]+|\s*\p{L}+|\s*\p{N}+|\s+/gu,
    ) ?? [];
  let tokens = 0;
  for (const piece of pieces) {
    const t = piece.trim();
    if (!t) tokens += Math.max(1, Math.ceil(piece.length / 6));
    else if (/\p{L}/u.test(t)) tokens += Math.max(1, Math.round(t.length / 4));
    else if (/\p{N}/u.test(t)) tokens += Math.max(1, Math.ceil(t.length / 3));
    else tokens += Math.max(1, Math.ceil(t.length / 2));
  }
  return tokens;
}
