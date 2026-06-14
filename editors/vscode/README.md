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
- **Formatting** — Format Document (and `editor.formatOnSave`) runs the canonical `toac fmt`: keys reordered to the schema order, indentation/spacing normalized, prompt/system block content preserved exactly
- **Hover docs** for every top-level key, and **completions** for keys, template constructs, and your declared input names
- Highlighting for keys, `[N]` length markers, `{name,type}` tabular headers, types (including enums like `draft|final` and optional `field?` markers)
- Template-language highlighting: `{inputs.x}` / `{env.X}` interpolation, `{#each}` loops, `{#if}` conditionals, `{{` literal braces
- Sensible editing defaults: `#` comments, brace pairs, auto-indent after `prompt: |` and tabular headers

## Related

- **Docs & playground:** https://zubeidhendricks.github.io/toad/
- **The `.agent` spec:** https://zubeidhendricks.github.io/toad/reference/spec
- **Compiler:** `npm i -g toad-compiler` → `toac build your.agent`

## Roadmap

A full language server (go-to-definition, rename, workspace-wide diagnostics). Issues and PRs welcome at [ZubeidHendricks/toad](https://github.com/ZubeidHendricks/toad).
