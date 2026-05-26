# Epics & Stories — Toa (MVP)

- **Phase:** 3 · Solutioning (Winston 🏗️) → hands off to Implementation (Bob 🏃)
- **Date:** 2026-05-25
- **Inputs:** [`prd.md`](./prd.md), [`architecture.md`](./architecture.md)

**Rule:** one story = one focused, reviewable diff (≤~800 lines), each gated by
`/review-loop` (tests + typecheck + lint green) before its PR. AC = acceptance
criteria; FR refs point at the PRD.

**Critical path:** `E0 → E1 → E2 → (E3 ∥ E4) → E5 → E6`. E3 (runtime) and E4
(codegen) parallelize once the `AgentAst` (E2) is frozen.

---

## E0 — Repo scaffold

- **S0.1 — Monorepo skeleton.** pnpm workspace + Turbo; `@toad/runtime` and
  `@toad/compiler` packages (empty, with build/test/typecheck/lint scripts);
  `tsconfig.base.json` (strict), Vitest, ESLint, Prettier; minimal CI.
  - *AC:* `pnpm install` clean; `pnpm -w typecheck`, `lint`, `test`, `build` all
    pass on the empty packages; `@toad/compiler` exposes a `toac` bin stub.
  - *Deps (await approval, ages verified at install):* dev-only —
    `typescript`, `vitest`, `turbo`, `eslint`, `prettier`, a bundler (`tsup`).

## E1 — Front-end: TOON + preprocessor

- **S1.1 — TOON decode wrapper + conformance.** Add `@toon-format/toon`; wrap
  `decode()`; conformance-test against fixtures from the fetched repo.
  - *AC:* known TOON samples decode to expected JSON; malformed input yields a
    `Diagnostic`, never a throw (FR1, FR4).
- **S1.2 — Block-scalar preprocessor (D6).** Detect `key: |`, capture + dedent
  the block, TOON-escape, lower to a quoted string; build `keyLineIndex`.
  - *AC:* golden tests: superset → valid TOON; a multi-line prompt containing
    `{inputs.x}`, `:`, and `"` survives lower→decode byte-exact (FR1).
- **S1.3 — Diagnostics core.** `Diagnostic` type, collector, `file:line:col`
  formatting; locate TOON decode errors via `keyLineIndex`.
  - *AC:* each error path produces a located diagnostic (NFR4).

## E2 — Validation & AST

- **S2.1 — Schema map → `AgentAst`.** Required keys, unknown-key rejection,
  `inputs`/`outputs` tabular → `FieldDecl[]`, `type` grammar validation.
  - *AC:* FR2 + FR5 table-driven cases green; valid file → populated `AgentAst`.
- **S2.2 — Interpolation parser.** `{ path }` scan, `{{`/`}}` escapes, dotted-path
  parse, root/`inputs` validation.
  - *AC:* FR3 + FR7; unknown path (e.g. `{inputs.nope}`) → located error;
    `PromptSegment[]` correct for the §5 contract.

## E3 — Runtime  *(parallel after E2 freeze)*

- **S3.1 — `defineTool` + schema.** Typed `defineTool`; Zod v4 `z.toJSONSchema()`
  → Anthropic tool schema.
  - *AC:* FR12; tool def carries description + schema + `run`.
- **S3.2 — Agent loop.** `createAgent`/`run` over `@anthropic-ai/sdk`: tool-use
  loop, `maxTurns` guard, prompt caching. Built per the `claude-api` skill.
  - *AC:* FR13; mocked-SDK test drives a one-tool conversation to completion;
    cache_control present on system + tools.
  - *Deps (await approval):* `@anthropic-ai/sdk`, `zod`.
- **S3.3 — Structured output + errors.** Final-tool `respond` pattern; parse to
  typed `O`; `ToolError`/`MaxTurnsError`/`OutputParseError`.
  - *AC:* FR14 + FR15; declared outputs → typed object; bad output →
    `OutputParseError`.

## E4 — Codegen  *(parallel after E2 freeze)*

- **S4.1 — Type emission.** `AgentAst` → `*Input`/`*Output` interfaces + Zod
  `outputSchema`.
  - *AC:* FR8; golden snapshot matches §5 contract types.
- **S4.2 — Agent + prompt emission.** `createAgent` call + prompt template literal
  with `{inputs.x}` → `${inputs.x}`; deterministic output.
  - *AC:* FR9–FR11; emitted `researcher.ts` is **byte-identical** to the §5
    contract; re-running `toac build` produces no diff.

## E5 — CLI

- **S5.1 — `toac build` / `toac check`.** Glob input; emit beside source or
  `--outDir`; print `file:line:col` diagnostics; non-zero exit on error.
  - *AC:* FR16–FR18; integration test compiles `examples/researcher`.

## E6 — Example & evals

- **S6.1 — Researcher end-to-end.** `researcher.agent` + `researcher.tools.ts` →
  `toac build` → runs against Claude, returns typed output.
  - *AC:* compiles and runs; output typed as `ResearcherOutput` (live test behind
    `ANTHROPIC_API_KEY`).
- **S6.2 — Eval harness.** NFR1 token-efficiency vs a JSON-schema+SDK baseline;
  NFR2 authorability (Claude generates `.agent` from a one-line spec → % that
  compile).
  - *AC:* harness prints both metrics on a small fixed set; NFR1 ≤60%, NFR2 ≥80%
    are the targets to track (not hard gates for MVP merge).

---

## Sequencing notes

- Freeze `AgentAst` (§4 of architecture) at the end of E2 — it's the contract E3
  and E4 build against in parallel.
- E6 is the first place real API cost is incurred; everything before it runs on
  mocks/goldens and is free to iterate.
- Dependency approvals are batched per epic (E0 dev tools, E1 `@toon-format/toon`,
  E3 `@anthropic-ai/sdk` + `zod`) — state package + age + reason before each install.
