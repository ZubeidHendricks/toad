# TOAD Agent for VS Code

Syntax highlighting for [TOAD](https://zubeidhendricks.github.io/toad/) `.agent` files — token-oriented, declarative AI agents that the `toac` compiler turns into readable, fully-typed TypeScript running on Claude.

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
outputs[2]{name,type}:
  summary,string
  sources,string[]
```

## What you get

- **Live diagnostics from the real compiler** — the actual `toac` compiler is bundled in and validates as you type: count mismatches, unknown keys, type errors, undeclared `{inputs.x}` references, unclosed blocks — each with its `TOAxxx` code at the right line
- Highlighting for keys, `[N]` length markers, `{name,type}` tabular headers, types (including enums like `draft|final` and optional `field?` markers)
- Template-language highlighting: `{inputs.x}` / `{env.X}` interpolation, `{#each}` loops, `{#if}` conditionals, `{{` literal braces
- Sensible editing defaults: `#` comments, brace pairs, auto-indent after `prompt: |` and tabular headers

## Related

- **Docs & playground:** https://zubeidhendricks.github.io/toad/
- **The `.agent` spec:** https://zubeidhendricks.github.io/toad/reference/spec
- **Compiler:** `npm i -g toad-compiler` → `toac build your.agent`

## Roadmap

Hover docs for keys, completions for declared inputs in templates, and a full LSP. Issues and PRs welcome at [ZubeidHendricks/toad](https://github.com/ZubeidHendricks/toad).
