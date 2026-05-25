# Product Brief — Toa

> **Name locked: `Toa`** (Token-Oriented Agents). Source files use the `.agent`
> extension; the compiler is `toac`.

- **Phase:** 1 · Analysis (Mary 📊)
- **Date:** 2026-05-25
- **Status:** Draft for review → feeds Planning (PRD)

---

## 1. Vision

**Svelte, but for AI agents.** You write a declarative `.agent` file in a
TOON-derived syntax; a compiler turns it into runnable, typed code that calls
Claude. The surface is deliberately minimal and token-cheap so that *two* authors
can write it fluently: **humans** (readable, low-ceremony) and **LLMs**
(predictable, schema-explicit, ~40% fewer tokens than JSON).

The bet, lifted directly from Svelte's playbook: **push work into a compiler, not
a runtime.** A small, declarative source language with an escape hatch to the host
language beats a large API surface — for humans *and* for the models generating it.

## 2. The problem

Building agents today means hand-writing orchestration glue: SDK boilerplate,
tool schemas duplicated between JSON and code, prompt strings interpolated by
hand, state threaded manually. The result is verbose, error-prone, and—crucially—
**hard for an LLM to author or modify reliably**, because the "shape" of an agent
is scattered across many tokens of imperative code.

There is no declarative, compile-first medium for agents the way Svelte is for UI.

## 3. Why TOON (grounded in the spec)

TOON (Token-Oriented Object Notation, spec v3.2, MIT, reference impl
`toon-format/toon`) is a line-oriented, indentation-based encoding of the JSON
data model. Three properties make it the right surface syntax:

1. **Token-efficient** — ~40% fewer tokens than JSON in mixed-structure
   benchmarks. Agent definitions are cheaper to read *and* to generate.
2. **Schema-explicit** — `[N]` length markers and `{field}` headers give a model
   the structure up front, measurably improving generation accuracy
   (76.4% vs JSON's 75.0% across 4 models). This *is* the "LLMs author it
   reliably" goal, already validated by the format.
3. **Lossless JSON mapping** — interop with existing tool schemas, configs, and
   eval datasets for free.

TOON gives us tabular arrays (`tools[2]{name,description}:`), nested objects,
inline/block primitive arrays, block scalars for prompts, and a formal ABNF
grammar we can build a parser against.

## 4. The core design (the crux)

TOON encodes **data only** — no expressions, no control flow. An agent language
needs dynamism. We resolve this exactly the way Svelte does, in three layers:

| Layer | Svelte | Toa | Purpose |
|-------|--------|-----|---------|
| **Structure** | HTML markup | **TOON data** | declarative shape: model, tools, memory, steps |
| **Bindings** | `{expr}`, `{#if}`, `{#each}` | **`{ }` expression sublanguage** | thread context into prompts, conditional/looped steps |
| **Logic** | `<script>` | **typed TS escape hatch** | tool bodies and custom code, in real TypeScript |

This keeps the DSL small and *non-Turing-complete on purpose*: anything that wants
real logic drops into TypeScript, which the model already writes fluently. The
compiler's job is: parse TOON + bindings → AST → emit readable TypeScript that
calls the Anthropic SDK.

### Illustrative `.agent` file (syntax is provisional)

```
agent: researcher
model: claude-opus-4-7
description: Research a topic and return a sourced summary.

inputs[1]{name,type}:
  topic,string

tools[2]{name,description}:
  web_search,Search the web for a query
  fetch_page,Fetch and read a URL

prompt: |
  You are a research analyst. Research: {inputs.topic}
  Use web_search to find sources, then fetch_page to read them.
  Return a cited summary.

outputs[2]{name,type}:
  summary,string
  sources,string[]
```

Tool bodies live in real TypeScript (co-located file or inline block — Open
Question Q3). The compiler emits `researcher.ts`: a typed, runnable agent.

## 5. Target users

- **Primary:** developers building agents who want a declarative, reviewable,
  diff-friendly format instead of SDK boilerplate.
- **Co-primary (the differentiator):** **LLM coding agents** that author and edit
  agents. A token-cheap, schema-explicit surface is a first-class user, not an
  afterthought.
- **Secondary:** teams who want agent definitions as artifacts they can lint,
  version, and review like Svelte components.

## 6. Goals & success metrics (MVP)

1. **It compiles and runs.** `toac build researcher.agent` → a TS module whose
   exported agent executes against Claude and returns typed output.
2. **It is token-cheap.** An agent definition uses materially fewer tokens than
   the equivalent hand-written JSON-schema + TS boilerplate (target: ≤60%).
3. **LLMs author it reliably.** Given a one-line spec, a Claude model emits a
   *valid, compilable* `.agent` file on the first try in a strong majority of
   trials (target: ≥80% on a small eval set).
4. **Typed end to end.** `inputs`/`outputs`/`tools` produce TS types; misuse is a
   compile error, not a runtime surprise.

## 7. MVP scope (one focused vertical slice)

- `.agent` parser: a working subset of TOON + `{ }` interpolation.
- Compiler `toac build`: `.agent` → readable `.ts` exporting a runnable agent.
- First-class keywords for MVP: `agent`, `model`, `description`, `prompt`,
  `inputs`, `outputs`, `tools`.
- Tiny runtime package: thin wrapper over the Anthropic SDK (tool loop, typed
  I/O). Built per the `claude-api` skill, with prompt caching, latest Claude
  models.
- One end-to-end example (`researcher.agent`) that uses a tool and runs.

## 8. Non-goals (explicitly out for MVP)

- A full general-purpose language, custom VM, or WASM target.
- Turing-complete control flow in the DSL (logic belongs in the TS escape hatch).
- Multi-provider abstraction — **Anthropic-native first.**
- LSP / formatter / package registry / hot-reload — later phases.
- Reimplementing TOON — we reuse the reference parser (see Q1).

## 9. Constraints & assumptions

- **Standalone repo** (not inside GAX): `~/toa`, TS monorepo idiom (pnpm + Turbo
  + Vitest) to match the house stack and tooling.
- **Anthropic-native runtime** — use the `claude-api` skill; default to the latest
  Claude models; prompt caching on by default.
- **Reuse real TOON source** via `opensrc`/`/fetch-source`, pinned to spec v3.2
  (MIT) — don't hand-roll the parser if we can extend the reference.
- **Package-safety rule** applies: no dependency whose latest version is younger
  than 14 days; state package + age + reason before adding.
- Build it through the **BMAD cycle**, one story = one focused diff, gated by
  `/review-loop` before any PR.

## 10. Risks & open questions (resolve in Planning/PRD)

- **Q1 — Parser strategy.** TOON is data-only; we must extend the grammar for
  `{ }` bindings and a logic escape hatch. Do we (a) reuse `toon-format/toon`'s
  parser and layer a binding pass on top, (b) fork/extend it, or (c) write a
  purpose-built parser that accepts a TOON superset? *Leaning (a)→(c).*
- **Q2 — DSL vs. escape hatch boundary.** How much control flow (`{#if}`,
  `{#each}`) lives in the DSL before it must drop to TS? Keep the DSL small.
- **Q3 — Logic escape hatch shape.** Co-located `researcher.tools.ts` (clean, very
  TS-native) vs. inline `<script>`/fenced block (single-file, Svelte-like).
- **Q4 — Compile target.** Emit readable `.ts` (debuggable, Svelte-like —
  *recommended*) vs. interpret an AST at runtime.
- **Q5 — Runtime substrate.** Anthropic SDK directly vs. the Claude Agent SDK for
  the tool loop / sub-agents.
- **Q6 — Is BMAD a *feature* or just our *method*? RESOLVED:** BMAD is our build
  *method* only. Toa is a **single-agent** compiler framework for MVP. First-class
  multi-agent / workflow primitives are explicitly **deferred** (Phase 2, if ever);
  the data model should not preclude them but MVP ships none.
- **Q7 — Name. RESOLVED:** `Toa` — compiler `toac`, files `.agent`.

## 11. Recommended next step

Proceed to **Planning (PRD, John 📋)** to resolve Q1–Q6 into concrete
requirements, then **Solutioning (Architect, Winston 🏗️)** for the compiler
architecture and a `fetch-source` pull of the TOON reference parser. Defer all
code until the PRD pins the parser strategy and the BMAD-as-feature question.
