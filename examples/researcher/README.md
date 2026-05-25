# Example: researcher

A minimal Toa agent that researches a topic and returns a sourced summary.

## Files

- `researcher.agent` — the agent, written in Toa (TOON superset).
- `researcher.tools.ts` — the tool implementations (`web_search`, `fetch_page`).
- `researcher.ts` — **generated** by `toac` (do not edit).

## Build

From the repo root:

```bash
pnpm --filter @toa/compiler build
node packages/compiler/dist/bin.js build examples/researcher/researcher.agent
```

This regenerates `researcher.ts`. Then `pnpm --filter @toa/example-researcher typecheck`
confirms the generated agent + tools type-check.

## Run (needs an API key)

The generated `researcher` is a runnable agent. With `ANTHROPIC_API_KEY` set and a
TS runner (e.g. `tsx`):

```ts
import { researcher } from "./researcher.js";
const out = await researcher.run({ topic: "the TOON format" });
console.log(out.summary, out.sources);
```

## Evals

- `node evals/token-efficiency.mjs` — NFR1: `.agent` size vs. the hand-written
  JSON-schema + SDK baseline it replaces (rough chars/4 token estimate).
- **Authorability (NFR2)** — give a model a one-line spec, ask for a `.agent`,
  and check it compiles with `toac check`. Requires an API key; tracked manually.
