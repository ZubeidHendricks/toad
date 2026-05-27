# Example: researcher

A minimal Toa agent that researches a topic and returns a sourced summary.

## Files

- `researcher.agent` — the agent, written in Toa (TOON superset).
- `researcher.tools.ts` — the tool implementations (`web_search`, `fetch_page`).
- `researcher.ts` — **generated** by `toac` (do not edit).

## Build

From the repo root:

```bash
pnpm --filter toad-compiler build
node packages/compiler/dist/bin.js build examples/researcher/researcher.agent
```

This regenerates `researcher.ts`. Then `pnpm --filter toad-example-researcher typecheck`
confirms the generated agent + tools type-check.

## Run (needs an API key)

`live.test.ts` runs the generated agent end-to-end against Claude. With a key set,
it executes; without one it's skipped (so CI stays offline and free):

```bash
ANTHROPIC_API_KEY=sk-... pnpm --filter toad-example-researcher test
```

In code, the generated agent is just:

```ts
import { researcher } from "./researcher";
const out = await researcher.run({ topic: "the TOON format" });
console.log(out.summary, out.sources);
```

## Evals

- `node evals/token-efficiency.mjs` — NFR1: `.agent` size vs. the hand-written
  JSON-schema + SDK baseline it replaces (rough chars/4 token estimate).
- **Authorability (NFR2)** — give a model a one-line spec, ask for a `.agent`,
  and check it compiles with `toac check`. Requires an API key; tracked manually.
