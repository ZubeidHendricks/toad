# PRD — Toa (MVP)

- **Phase:** 2 · Planning (John 📋)
- **Date:** 2026-05-25
- **Status:** Draft for review → feeds Solutioning (architecture + epics)
- **Inputs:** [`product-brief.md`](./product-brief.md)

Toa is a Svelte-style compiler framework for AI agents. You author a declarative
`.agent` file in TOON-derived syntax; the `toac` compiler emits readable, typed
TypeScript that runs against Claude. MVP is **single-agent**.

---

## 1. Resolved decisions

These close the brief's open questions and frame the requirements below.

| # | Question | Decision (MVP) | Rationale |
|---|----------|----------------|-----------|
| D1 | Parser strategy | **Reuse `@toon-format/toon`'s `decode()` as a dependency** for the data layer + a thin Toa preprocessor that lowers superset sugar to valid TOON, then semantic passes (schema, interpolation, validation). | Source review (Solutioning) showed the decoder is library-grade, spec-conformant, and exposes events + line primitives. Reusing it removes a parser's worth of maintenance and guarantees TOON compatibility. |
| D2 | DSL vs. escape hatch | **Tiny DSL**: declarative keys + `{ }` interpolation in strings only. **No `{#if}`/`{#each}` in MVP.** All logic → TS. | Keep the surface non-Turing-complete and LLM-predictable. |
| D3 | Escape-hatch shape | **Co-located `<name>.tools.ts`** exporting tools via a typed `defineTool` helper. (Inline single-file block deferred.) | No embedded-TS parsing; full type-checking and IDE support for free. |
| D4 | Compile target | **Emit readable `.ts`** (not a runtime AST interpreter). | Debuggable, reviewable, Svelte-like; the emitted code *is* the documentation. |
| D5 | Runtime substrate | **`@anthropic-ai/sdk` directly**, wrapped by a thin `toad-runtime`. Prompt caching on; latest Claude models; per the `claude-api` skill. **Not** the Agent SDK for MVP. | Minimal deps, full control of the tool loop, Anthropic-native. |
| D6 | Multi-line prompts | **`prompt: \|` block-scalar superset** (Toa-only). The preprocessor captures the indented block, dedents it, and lowers it to a TOON-escaped quoted string before `decode()` runs; `{ }` interpolation works inside it. | TOON has no block scalar and forces quoting on `:`/`{}`/`"`; escaped single-line prompts kill authorability. **Toa is a strict superset of TOON.** |

---

## 2. Scope

**In (MVP):** `.agent` parser, `toac build`, code generation to TS, a runtime
tool-loop, typed `inputs`/`outputs`/`tools`, `{ }` interpolation in prompts, one
runnable example, tests.

**Out (deferred):** multi-agent/workflows, `{#if}`/`{#each}`, inline `<script>`,
LSP/formatter, hot-reload, non-Anthropic providers, package registry, a custom VM
or WASM target.

---

## 3. The `.agent` language (MVP surface)

A `.agent` file is a TOON document with reserved top-level keys. Strings may
contain `{ <path> }` interpolations resolved at runtime.

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

Co-located `researcher.tools.ts`:

```ts
import { defineTool } from "toad-runtime";
import { z } from "zod";

export const web_search = defineTool({
  description: "Search the web for a query",
  input: z.object({ query: z.string() }),
  run: async ({ query }) => { /* ... */ },
});

export const fetch_page = defineTool({
  description: "Fetch and read a URL",
  input: z.object({ url: z.string().url() }),
  run: async ({ url }) => { /* ... */ },
});
```

### Reserved keys (MVP)

| Key | Required | Form | Meaning |
|-----|----------|------|---------|
| `agent` | ✅ | identifier | Agent name → exported symbol + emitted filename. |
| `model` | ✅ | string | Claude model id. |
| `description` | — | string | Human/LLM-facing summary. |
| `inputs` | — | tabular `{name,type}` | Typed call parameters → generated TS input type. |
| `tools` | — | inline array of names | References exports in `<name>.tools.ts`. |
| `prompt` | ✅ | block scalar `\|` | Instruction prompt; supports `{ }` interpolation. |
| `outputs` | — | tabular `{name,type}` | Typed structured result → generated TS output type. |

### Expression sublanguage (MVP)

Only **dotted property access** inside `{ }`: `{inputs.topic}`, `{inputs.user.id}`.
No calls, arithmetic, or conditionals. Reference root is `inputs` (and `env` for
environment access). Unknown roots/paths are a **compile error**.

### Type grammar (MVP)

`type` cells in `inputs`/`outputs` accept: `string`, `number`, `boolean`, and the
`[]` array suffix (e.g. `string[]`). Nested object types are deferred.

---

## 4. Functional requirements

### Parser (`toad-compiler`)
- **FR1** Parse the TOON data subset used by `.agent`: `key: value`, nested
  objects, block scalars (`|`), inline primitive arrays (`name[N]:`), and tabular
  arrays (`name[N]{fields}:`), per TOON spec v3.2 quoting/escaping rules.
- **FR2** Recognize the reserved keys (§3) and reject unknown top-level keys with
  a clear, located error (line/column).
- **FR3** Tokenize `{ <path> }` interpolations within string/block-scalar values
  into an AST node list (literal + interpolation segments).
- **FR4** Produce a typed AST + a structured diagnostics list (never throw on user
  error; collect and report).

### Validation
- **FR5** Validate required keys present (`agent`, `model`, `prompt`), `inputs`/
  `outputs` rows match the `{name,type}` header arity, and `type` values are in the
  MVP type grammar.
- **FR6** Resolve every `tools` name to an export in the co-located
  `<name>.tools.ts`; missing/typo'd tools are a compile error.
- **FR7** Validate every interpolation path against declared `inputs` (and `env`);
  unknown paths are a compile error.

### Code generation
- **FR8** Emit one readable `.ts` module per `.agent` file exporting a runnable
  agent (default export + named `<agent>`), with generated TS types for `inputs`
  and `outputs`.
- **FR9** Emitted code imports tools from the co-located `.tools.ts` and the
  agent loop from `toad-runtime`; no logic is inlined that belongs in the runtime
  (service-layer rule).
- **FR10** Interpolations compile to template-literal substitutions over the typed
  `inputs` object — no runtime string-key lookups.
- **FR11** Emitted code is formatted and stable (same input → byte-identical
  output) so diffs are meaningful.

### Runtime (`toad-runtime`)
- **FR12** `defineTool({ description, input: ZodSchema, run })` returns a typed tool;
  derives the Anthropic tool JSON schema from the Zod schema.
- **FR13** Provide the agent execution loop over `@anthropic-ai/sdk`: send prompt
  → handle `tool_use` → run tool → return `tool_result` → repeat until stop;
  prompt caching enabled; configurable max-turns guard.
- **FR14** When `outputs` are declared, request a structured final result and parse
  it into the typed output object; parse failure surfaces as a typed runtime error.
- **FR15** Typed errors for: tool failure, max-turns exceeded, malformed output.

### CLI (`toac`)
- **FR16** `toac build <path|glob>` compiles `.agent` files to `.ts` beside them
  (or to `--outDir`), printing diagnostics with file:line:col.
- **FR17** `toac check <path>` validates without emitting (CI gate).
- **FR18** Non-zero exit on any error; clean machine-readable summary.

---

## 5. Non-functional requirements

- **NFR1 — Token efficiency.** An MVP agent definition uses ≤60% of the tokens of
  the equivalent hand-written JSON-schema + SDK boilerplate (measured on the
  example set).
- **NFR2 — LLM authorability.** ≥80% of `.agent` files generated by Claude from a
  one-line spec compile on the first try (small eval set, tracked).
- **NFR3 — Type safety.** `inputs`/`outputs`/`tools` misuse is a compile-time TS
  error in consumer code, not a runtime surprise.
- **NFR4 — DX.** A clear, located diagnostic for every user error; no stack-trace
  spew for user-fixable mistakes.
- **NFR5 — Determinism.** Compilation is pure and reproducible (FR11).
- **NFR6 — House standards.** TS strict, Vitest, pnpm + Turbo; gated by
  `/review-loop` (tests + typecheck + lint green) before any PR. Package-safety
  rule enforced.

---

## 6. Epic & story outline (one story = one focused diff)

> Detailed stories are produced in Solutioning. This is the sequencing skeleton.

- **E0 — Repo scaffold.** pnpm + Turbo monorepo; `toad-compiler`, `toad-runtime`;
  TS strict, Vitest, lint, CI. *(small)*
- **E1 — Parser.** TOON-subset + interpolation tokenizer → AST + diagnostics
  (FR1–FR4). Conformance-test against fetched `toon-format/toon` fixtures. *(2–3 stories)*
- **E2 — Validation.** Reserved keys, types, tool/interp resolution (FR5–FR7).
- **E3 — Runtime.** `defineTool`, agent loop, structured output, typed errors
  (FR12–FR15). Built per `claude-api` skill.
- **E4 — Codegen.** AST → readable typed `.ts` (FR8–FR11).
- **E5 — CLI.** `toac build`/`check` (FR16–FR18).
- **E6 — Example + evals.** `researcher` end-to-end; token-efficiency (NFR1) and
  authorability (NFR2) eval harness.

**Critical path:** E0 → E1 → E2 → (E3 ∥ E4) → E5 → E6. E3 and E4 can proceed in
parallel once the AST (E1) is stable.

---

## 7. Dependencies & assumptions

- `@anthropic-ai/sdk`, `zod` — established, well past the 14-day safety window
  (confirm exact versions at install time, state age + reason per house rule).
- `toon-format/toon` — **reference only**, fetched via `opensrc`, not a dependency.
- `ANTHROPIC_API_KEY` available for the runtime/example; evals may incur API cost.
- TypeScript strict, Node ≥ 20.

## 8. Open items for Solutioning (Architect)

- ~~Parser implementation~~ **Resolved (D1/architecture):** reuse `decode()` +
  preprocessor; no hand-written TOON parser.
- Structured-output mechanism (FR14): Anthropic native structured outputs vs. a
  final tool-call vs. parse-from-text. Pick during architecture.
- AST shape and the codegen template strategy (string templates vs. ts-morph).
- Whether `toad-runtime` and the `toac` bin live in one package or two.

## 9. Out of scope (restated)

Multi-agent/workflows · `{#if}`/`{#each}` · inline `<script>` · LSP/formatter ·
hot-reload · non-Anthropic providers · package registry · custom VM/WASM.
