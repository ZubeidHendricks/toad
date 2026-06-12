# Ecosystem

Everything that ships with TOAD, what it's built on, and where it plugs in.

## Packages

| Package                                                          | What it is                                                                  |                                                                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`toad-compiler`](https://www.npmjs.com/package/toad-compiler)   | The `toac` CLI + programmatic API — compiles `.agent` → typed TypeScript    | ![npm](https://img.shields.io/npm/v/toad-compiler?color=4ade80&label=npm)                                      |
| [`toad-runtime`](https://www.npmjs.com/package/toad-runtime)     | `createAgent`, `defineTool`, the tool-use loop, TOON serialization          | ![npm](https://img.shields.io/npm/v/toad-runtime?color=4ade80&label=npm)                                       |

```bash
npm i -g toad-compiler
npm i toad-runtime @anthropic-ai/sdk
```

## Built on

| Project                                                            | Role                                                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [TOON](https://github.com/toon-format/toon)                        | Token-Oriented Object Notation — the `.agent` format is a strict TOON superset                      |
| [`@toon-format/toon`](https://www.npmjs.com/package/@toon-format/toon) | The spec-conformant decoder/encoder; TOAD has no bespoke parser                                 |
| [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) | The model client the runtime's tool loop drives                                                |
| [zod](https://zod.dev)                                             | Runtime validation behind every `inputs` / `outputs` schema                                         |

## Tooling & resources

- **[Playground](/playground)** — the real compiler bundled to the browser; live token meters, JSON baseline, shareable links.
- **[Authoring prompt](/guide/writing-with-ai)** — a copy-paste prompt that turns any LLM into a TOAD author ([`docs/authoring.md`](https://github.com/ZubeidHendricks/toad/blob/main/docs/authoring.md) in the repo).
- **[`examples/researcher`](https://github.com/ZubeidHendricks/toad/tree/main/examples/researcher)** — a complete, type-checked project: `.agent` source, generated `.ts`, tool implementations, and a live integration test.
- **[Benchmarks](/benchmarks)** — measured token numbers for authoring and runtime serialization.

## Editor support

The **[TOAD Agent VS Code extension](https://github.com/ZubeidHendricks/toad/tree/main/editors/vscode)** gives `.agent` files full syntax highlighting — keys, `[N]` length markers, tabular headers, types, and the whole template language (`{#each}`, `{#if}`, interpolation). Until it's on the marketplace, install from source:

```bash
cd editors/vscode
npx @vscode/vsce package
code --install-extension toad-agent-0.1.0.vsix
```

The same TextMate grammar powers the code blocks on this site. In-editor diagnostics from `toac check` are on the roadmap — [issues and PRs welcome](https://github.com/ZubeidHendricks/toad/issues).

## Contributing

TOAD is MIT-licensed and early. The compiler, runtime, language features, and docs are all fair game.

- [Star it on GitHub](https://github.com/ZubeidHendricks/toad)
- [Open an issue](https://github.com/ZubeidHendricks/toad/issues/new)
- [Read the release notes](/blog/)

<a href="https://github.com/ZubeidHendricks/toad/graphs/contributors" target="_blank" rel="noreferrer" title="Contributors">
  <img src="https://contrib.rocks/image?repo=ZubeidHendricks/toad" alt="TOAD contributors" loading="lazy" />
</a>
