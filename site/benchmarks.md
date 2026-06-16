# Benchmarks

TOAD's pitch is in its name: token-oriented. Two places save tokens — **authoring** (a `.agent` file vs the JSON it replaces) and **runtime** (tool results fed back to the model as TOON vs JSON). Both are measured below with [gpt-tokenizer](https://github.com/niieani/gpt-tokenizer) (o200k, a close real-world proxy for Claude's tokenizer, which has no public library).

All numbers are reproducible: the agents are the exact presets in the [playground](/playground), which shows the same comparison live for anything you type.

## Authoring: `.agent` vs equivalent JSON

Each agent's `.agent` source, against the same structure pretty-printed as JSON (lower the `.agent` superset to TOON, decode with the reference `@toon-format/toon` decoder, `JSON.stringify(value, null, 2)`):

| Agent        | What it exercises                     | `.agent` tokens | JSON tokens | Savings |
| ------------ | ------------------------------------- | --------------: | ----------: | ------: |
| `researcher` | tools + structured output             |             101 |         162 | **38%** |
| `summarizer` | typed array output                    |              74 |         115 | **36%** |
| `digest`     | `{#each}` loop with index             |              86 |         125 | **31%** |
| `report`     | `{#each}` + `{#if}` conditional       |             115 |         170 | **32%** |
| `brief`      | object types, destructuring, fallback |             151 |         217 | **30%** |

**30–38% fewer tokens** across the board — and unlike JSON, the `[N]` length markers and `{field}` headers hand a model explicit structure, which is what makes LLM-authored agents validate on the first try.

## Runtime: tool results as TOON vs JSON {#tool-results}

With `toolResultFormat: "auto"`, the runtime re-encodes object/array tool results as [TOON](https://github.com/toon-format/toon) when that's meaningfully smaller than compact JSON. Measured on representative tool results:

| Dataset                    | Shape           | JSON tokens | TOON tokens | Savings  |
| -------------------------- | --------------- | ----------: | ----------: | -------: |
| `users` (20 rows)          | uniform tabular |         506 |         311 | **39%**  |
| `orders` (50 rows)         | uniform tabular |       1,336 |         896 | **33%**  |
| `search results` (10 rows) | long text cells |         452 |         401 | **11%**  |
| `nested config` (object)   | deeply nested   |          68 |          80 | **−18%** |

Two things to notice:

1. **Tabular data is where TOON shines** — uniform rows collapse into a header + CSV-like body, saving 30–40% per result. In a multi-turn tool loop these savings compound on every turn.
2. **TOON isn't always smaller** — on small, deeply nested objects it can cost _more_ than JSON. That's exactly why `"auto"` exists: it measures both and only switches when TOON wins, so it **never increases tokens**. The nested-config row above would be sent as JSON.

```ts
const agent = createAgent({
  // ...
  toolResultFormat: "auto", // never worse than JSON
  hooks: {
    onToolResultEncoded: ({ savedTokens }) => (total += savedTokens),
  },
});
```

## Multi-turn loop: the optimizations compound {#tool-loop}

A real agent runs the tool loop many times, and the whole conversation is re-sent every turn — so the levers stack. This runs a fixed **5-turn** agent (an over-fetching search tool returning 10 uniform rows per call) through each optimization and measures the **total input tokens sent across the run**:

| Config                              | Input tokens | vs baseline |
| ----------------------------------- | -----------: | ----------: |
| baseline (JSON, no shaping)         |       28,380 |           — |
| + TOON `auto` encoding              |       22,860 |  **−19%**   |
| + field projection (`fields`)       |       18,405 |  **−35%**   |
| + ephemeral results (`ephemeral`)   |        7,695 |  **−73%**   |

Each layer builds on the last: TOON shrinks each result's encoding, `fields` drops the keys the model doesn't need, and `ephemeral` stops re-sending one-shot results on every later turn (`maxContextTokens` does the same for history under a hard ceiling). Over a long loop the compounding is the whole game — a one-time authoring saving is dwarfed by what the loop re-sends.

Reproduce: `pnpm build && node scripts/bench-tool-loop.mjs` — deterministic, no API key (heuristic token estimate, so the **deltas** are the result, not the absolute counts).

## Methodology

- Tokenizer: `gpt-tokenizer` (o200k). Claude's tokenizer has no public library; o200k is the standard proxy and tracks it closely on code/data text.
- Authoring comparison: `.agent` source bytes vs `JSON.stringify(decoded, null, 2)` of the identical structure (pretty-printed, as JSON agents are written in practice).
- Runtime comparison: compact `JSON.stringify(value)` vs `encode(value)` from `@toon-format/toon` — the exact comparison `"auto"` mode performs.
- Reproduce locally: run [`scripts/measure-tokens.mjs`](https://github.com/ZubeidHendricks/toad/blob/main/scripts/measure-tokens.mjs) after `pnpm build` — and the [playground](/playground) recomputes the authoring comparison live for any agent you write.

::: tip See it yourself
Open the [playground](/playground), pick a preset, and switch "Compare to" → **Equivalent JSON**. The savings line at the bottom is computed from the same tokenizer on exactly what's on screen.
:::
