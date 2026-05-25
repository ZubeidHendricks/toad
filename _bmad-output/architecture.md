# Architecture — Toa (MVP)

- **Phase:** 3 · Solutioning (Winston 🏗️)
- **Date:** 2026-05-25
- **Status:** Draft for review → feeds Implementation (epics)
- **Inputs:** [`product-brief.md`](./product-brief.md), [`prd.md`](./prd.md)
- **Grounded on:** `toon-format/toon@main` (fetched via `opensrc` to
  `~/.opensrc/repos/github.com/toon-format/toon/main`; spec v3.2, MIT).

---

## 1. One-line architecture

```
 .agent (TOON superset)
   │  ① preprocess: lower `prompt: |` blocks → valid TOON   (Toa)
   ▼
 valid TOON text ──② decode()  ────────────────────────────  (@toon-format/toon, dependency)
   │  JsonObject
   ▼
 ③ schema map + validate → AgentAst                          (Toa)
 ④ parse interpolations `{ }` in strings                     (Toa)
 ⑤ resolve tools against <name>.tools.ts                     (Toa)
   │  validated AgentAst
   ▼
 ⑥ codegen → readable <name>.ts                              (Toa)
   │  emitted module imports…
   ▼
 @toa/runtime  ──► @anthropic-ai/sdk  (tool loop, structured output, caching)
```

Toa is a **strict superset of TOON**. The only thing we parse ourselves is the
superset sugar (block scalars) and the `{ }` interpolation inside string values.
Everything structural is delegated to TOON's own, spec-conformant `decode()`.

## 2. What the source review settled (and why)

From reading `toon-format/toon`'s `src/decode/{scanner,parser}.ts`, `types.ts`,
and `index.ts`:

- **`decode(input): JsonValue`** and **`decodeStreamSync(lines): JsonStreamEvent[]`**
  are library-grade and spec-conformant. → We **depend** on the package; we do
  **not** write a TOON parser (PRD D1).
- The decoder is **line-oriented**: indentation = `spaces / indentSize`; strict
  mode forbids tab indentation and non-multiple indents (`scanner.ts`). → Our
  preprocessor can work purely line-by-line at depth 0/1 and stay compatible.
- **TOON has no block scalar.** Multi-line strings are quoted with `\n` escapes,
  and `:` `{` `}` `"` `[` `]` *force quoting* (`syntax-cheatsheet.md` quoting
  rules). → Block scalars must be a **Toa preprocessor extension that lowers to a
  quoted TOON string** (PRD D6). Inside quotes, braces are literal (not in TOON's
  six escape sequences), so `{ }` interpolation survives decode untouched.
- `decode()` returns values without source positions. → We build a cheap
  **top-level-key → line index** during preprocessing for located diagnostics.

## 3. Compiler pipeline (`@toa/compiler`)

Pure, deterministic, no I/O except reading the `.agent` and its `.tools.ts`.
Each stage appends to a `Diagnostic[]`; user errors are **collected, never
thrown** (NFR4).

| # | Stage | Output | Maps to |
|---|-------|--------|---------|
| ① | **Preprocess / lower** | valid TOON text + `keyLineIndex: Map<string,number>` | FR1 |
| ② | **TOON decode** (`@toon-format/toon`) | `JsonObject` | FR1 |
| ③ | **Schema map + validate** | `AgentAst` (partial) + diagnostics | FR2, FR5 |
| ④ | **Interpolation parse** | `PromptTemplate` + diagnostics | FR3, FR7 |
| ⑤ | **Tool resolve** | resolved tool names (or diagnostic) | FR6 |
| ⑥ | **Codegen** | `<name>.ts` string (deterministic) | FR8–FR11 |

### ① Preprocess / lower (the only hand-written scan)

Algorithm, line by line:
1. If a line matches `^(\s*)<key>:\s*\|\s*$` → it's a block-scalar header. Capture
   following lines more indented than `<key>`; **dedent** by the block's base
   indent; join with `\n`; **TOON-escape** (`\` `"` `\n` `\r` `\t`, control →
   `\uXXXX`); re-emit as `<key>: "<escaped>"`. This *lowers* superset → valid TOON.
2. Record `keyLineIndex[key] = lineNumber` for depth-0 keys.
3. All other lines pass through unchanged.

Result is guaranteed-valid TOON (or TOON `decode()` reports the error, which we
surface located via `keyLineIndex`). No double round-trip, no sentinels — escape
once, decode once, get exact bytes back. `{ }` are untouched by escaping.

> Block-scalar MVP: plain `|` only (single trailing newline stripped). `|-`/`|+`
> chomping indicators are deferred.

### ③ Schema map + validate

Map `JsonObject` → `AgentAst`:
- Require `agent`, `model`, `prompt`. Reject unknown top-level keys (located).
- `inputs`/`outputs`: TOON tabular `[N]{name,type}` decodes to
  `Array<{name,type}>` → `FieldDecl[]`; validate each `type` against the grammar.
- `tools`: TOON inline array `[N]` decodes to `string[]` → tool names.

### ④ Interpolation parse

For interpolation-bearing strings (MVP: `prompt`), scan for `{ … }`:
- `{{` / `}}` → literal `{` / `}`.
- `{ <dotted.path> }` → `{ kind:'interp', path:['inputs','topic'] }`.
- Validate `path[0] ∈ {inputs}` (env deferred) and `path[1]` ∈ declared `inputs`.
  Unknown → located diagnostic.

### ⑤ Tool resolve

MVP: tool names are wired into the emitted `import { … } from "./<name>.tools"`.
Existence/shape is then enforced by **`tsc` on the emitted code** (the
`/review-loop` typecheck gate), so a typo is a hard failure. A friendlier
pre-check (read exports via the TS API) is a documented fast-follow, not MVP.

## 4. Data structures (`@toa/compiler`)

```ts
type ToaType = { base: "string" | "number" | "boolean"; array: boolean };

interface FieldDecl { name: string; type: ToaType }

type PromptSegment =
  | { kind: "text"; value: string }
  | { kind: "interp"; path: string[] };

interface AgentAst {
  name: string;            // `agent`  → export symbol + emitted filename
  model: string;
  description?: string;
  inputs: FieldDecl[];
  outputs: FieldDecl[];
  tools: string[];         // names → imported from <name>.tools.ts
  prompt: PromptSegment[];
}

interface Diagnostic {
  severity: "error" | "warning";
  code: string;            // e.g. "TOA001"
  message: string;
  file: string;
  line?: number;
  col?: number;
}

interface CompileResult {
  ast?: AgentAst;
  code?: string;           // emitted TS, present iff no errors
  diagnostics: Diagnostic[];
}
```

## 5. Code generation (⑥)

Strategy: **string templates** for MVP (transparent, small, easy to snapshot-test;
`ts-morph` is a later option). Output is **byte-stable** for a given input (FR11).
The interpolation root `inputs` is emitted as the prompt function's parameter, so
`{inputs.topic}` lowers to `${inputs.topic}` 1:1.

**Codegen contract** — this `.agent`:

```
agent: researcher
model: claude-opus-4-7
description: Research a topic and return a sourced summary.

inputs[1]{name,type}:
  topic,string

tools[2]: web_search,fetch_page

prompt: |
  You are a research analyst. Research: {inputs.topic}
  Use web_search to find sources, then fetch_page to read them.
  Return a cited summary.

outputs[2]{name,type}:
  summary,string
  sources,string[]
```

emits this `researcher.ts`:

```ts
// Generated by toac from researcher.agent — do not edit.
import { createAgent, type Agent } from "@toa/runtime";
import { z } from "zod";
import { web_search, fetch_page } from "./researcher.tools";

export interface ResearcherInput {
  topic: string;
}

export interface ResearcherOutput {
  summary: string;
  sources: string[];
}

const outputSchema = z.object({
  summary: z.string(),
  sources: z.array(z.string()),
});

export const researcher: Agent<ResearcherInput, ResearcherOutput> = createAgent({
  name: "researcher",
  model: "claude-opus-4-7",
  description: "Research a topic and return a sourced summary.",
  tools: { web_search, fetch_page },
  outputSchema,
  prompt: (inputs: ResearcherInput) =>
    `You are a research analyst. Research: ${inputs.topic}
Use web_search to find sources, then fetch_page to read them.
Return a cited summary.`,
});

export default researcher;
```

## 6. Runtime (`@toa/runtime`)

Thin layer over `@anthropic-ai/sdk`. The emitted code depends on this package;
the compiler does **not** (clean dependency direction).

```ts
defineTool({ description, input: ZodSchema, run })  // name comes from wiring key
createAgent<I, O>(config): Agent<I, O>
agent.run(input: I): Promise<O>
```

- **Tool schema:** derive the Anthropic tool JSON schema from the Zod schema via
  Zod v4's native `z.toJSONSchema()` (no extra dependency).
- **Loop (FR13):** `messages.create` with tools → on `tool_use`, run the matching
  tool, append `tool_result`, repeat until `end_turn` or `maxTurns` guard.
- **Prompt caching:** `cache_control` on the system prompt and tool definitions
  (per the `claude-api` skill). Latest Claude models.
- **Structured output (FR14):** the **final-tool pattern** — synthesize a `respond`
  tool whose input schema is `outputSchema`; instruct the model to call it to
  finish; parse its input as the typed `O`.
- **Errors (FR15):** `ToolError`, `MaxTurnsError`, `OutputParseError`.

## 7. Packages & dependency direction

```
toa/
  _bmad-output/                 planning artifacts
  packages/
    runtime/    @toa/runtime    defineTool, createAgent, run loop, errors
    compiler/   @toa/compiler   pipeline + `toac` bin
  examples/researcher/          researcher.agent + .tools.ts (+ generated .ts)
  pnpm-workspace.yaml · turbo.json · tsconfig.base.json
```

```
emitted .ts ─► @toa/runtime ─► @anthropic-ai/sdk, zod
@toa/compiler ─► @toon-format/toon, zod      (build-time; NOT runtime)
@toa/compiler ─X─► @toa/runtime              (no dependency — one-way)
```

`toac` bin lives in `@toa/compiler` (single package for MVP; split later if a
programmatic API consumer appears).

## 8. Testing strategy

- **TOON conformance:** import fixtures from the fetched repo; assert our
  `decode()` wrapper + preprocessor round-trips them.
- **Preprocessor:** golden tests — superset input → exact valid-TOON output;
  prompts containing `{ }`, `:`, `"` survive lower→decode unchanged.
- **Validation:** table-driven cases for each diagnostic code (FR2/FR5/FR7).
- **Codegen:** golden snapshot; the §5 contract is the canonical fixture (FR11
  byte-stability).
- **Runtime:** drive the loop against a mocked Anthropic client; one live
  integration test behind `ANTHROPIC_API_KEY`.
- Gate every story with `/review-loop` (tests + typecheck + lint green).

## 9. Resolved PRD open items (§8)

| PRD item | Resolution |
|----------|------------|
| Parser impl | Reuse `decode()` + line-oriented preprocessor (§2, §3.①). |
| Structured output | Final-tool `respond` pattern (§6). |
| AST + codegen | `AgentAst` (§4) + string-template codegen (§5). |
| Runtime vs bin packaging | `toac` in `@toa/compiler`; `@toa/runtime` separate (§7). |

## 10. Risks

- **TOON version drift.** We pin `@toon-format/toon` and re-run conformance on
  bumps; spec is at v3.2 working-draft.
- **Internal primitives not exported.** We rely only on the package's public
  `decode()`/types — verified present in `index.ts` — not deep imports.
- **Block-scalar edge cases** (blank lines inside a block, trailing indentation):
  covered by golden tests; chomping deferred.
- **Structured-output reliability** depends on model tool-calling; mitigated by
  the explicit `respond` tool + `OutputParseError` surfacing.
