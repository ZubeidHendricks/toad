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

`.agent` files get the same diagnostics, hovers, completions, and formatting in
every editor, because they all run the **real compiler** — the one behind
`toac`. There's no second implementation to drift.

### VS Code

The **[TOAD Agent extension](https://github.com/ZubeidHendricks/toad/tree/main/editors/vscode)** bundles the compiler directly and gives `.agent` files:

- **Syntax highlighting** — keys, `[N]` length markers, tabular headers, types, and the whole template language (`{#each}`, `{#if}`, interpolation).
- **Live diagnostics** — the exact errors `toac check` reports, with carets on the offending span, as you type.
- **Hovers & completions** — docs for every top-level key and template construct, plus your declared `inputs.*` names.
- **Format on save** — `toac fmt`'s canonical formatter as a document formatter.

Until it's on the marketplace, install from source:

```bash
cd editors/vscode
npx @vscode/vsce package
code --install-extension toad-agent-0.5.0.vsix
```

The same TextMate grammar powers the code blocks on this site.

### Every other editor — the language server

`toac lsp` is a standalone [Language Server](https://microsoft.github.io/language-server-protocol/) over stdio: the same diagnostics, hovers, completions, and formatting, for any LSP-capable editor. Install the compiler globally (`npm i -g toad-compiler`) so `toac` is on your `PATH`, then point your editor at `toac lsp` for the `agent` language (files ending in `.agent`).

**Neovim** (with [`nvim-lspconfig`](https://github.com/neovim/nvim-lspconfig) or the built-in API):

```lua
vim.filetype.add({ extension = { agent = "agent" } })
vim.api.nvim_create_autocmd("FileType", {
  pattern = "agent",
  callback = function(args)
    vim.lsp.start({
      name = "toad",
      cmd = { "toac", "lsp" },
      root_dir = vim.fs.dirname(args.file),
    })
  end,
})
```

**Helix** (`~/.config/helix/languages.toml`):

```toml
[[language]]
name = "agent"
scope = "source.agent"
file-types = ["agent"]
roots = []
language-servers = ["toad"]
auto-format = true

[language-server.toad]
command = "toac"
args = ["lsp"]
```

**Zed** (`~/.config/zed/settings.json`) — register `toac lsp` as a language server and map the `agent` extension to it.

**Emacs** ([Eglot](https://github.com/joaotavora/eglot)):

```elisp
(add-to-list 'auto-mode-alist '("\\.agent\\'" . prog-mode))
(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs '(prog-mode "toac" "lsp")))
```

Anything that speaks LSP — JetBrains (via the LSP plugin), Sublime (LSP package), Kakoune (kak-lsp) — works the same way: run `toac lsp`, associate `.agent`.

## Contributing

TOAD is MIT-licensed and early. The compiler, runtime, language features, and docs are all fair game.

- [Star it on GitHub](https://github.com/ZubeidHendricks/toad)
- [Open an issue](https://github.com/ZubeidHendricks/toad/issues/new)
- [Read the release notes](/blog/)

<a href="https://github.com/ZubeidHendricks/toad/graphs/contributors" target="_blank" rel="noreferrer" title="Contributors">
  <img src="https://contrib.rocks/image?repo=ZubeidHendricks/toad" alt="TOAD contributors" loading="lazy" />
</a>
