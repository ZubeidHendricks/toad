# Release Notes

What's new in TOAD. Follow along on [GitHub releases](https://github.com/ZubeidHendricks/toad/releases).

## TOAD 0.1.0 — the first release {#v0-1-0}

_May 27, 2026_

TOAD is now on npm. Write an AI agent as a tiny declarative `.agent` file; the `toac` compiler turns it into readable, fully-typed TypeScript that runs on Claude.

```bash
npm i -g toad-compiler
npm i toad-runtime @anthropic-ai/sdk
```

**What's in it:**

- **The compiler** — `.agent` (a strict [TOON](https://github.com/toon-format/toon) superset) lowered, decoded, validated, and emitted as typed TypeScript, with located `file:line:col` diagnostics.
- **The language** — typed `inputs` / `outputs` / `tools`, object types, interpolation, `{#each}` loops (with index, `{:else}`, and destructuring), and `{#if}/{:else if}/{:else}` conditionals.
- **The runtime** — the tool-use loop, structured output, composition (`uses:` / `asTool()`), lifecycle (`retries`, `maxTurns`, hooks), and streaming.
- **The site** — docs, a step-by-step tutorial, live examples, and an in-browser playground running the real compiler.

Two packages: [`toad-compiler`](https://www.npmjs.com/package/toad-compiler) (the `toac` CLI) and [`toad-runtime`](https://www.npmjs.com/package/toad-runtime). MIT-licensed. Issues and PRs welcome — it's early and there's plenty to build.
