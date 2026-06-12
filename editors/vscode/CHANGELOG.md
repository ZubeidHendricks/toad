# Changelog

## 0.3.0

- **Hover docs** for every top-level key.
- **Completions**: top-level keys (with snippets for `inputs`/`outputs`/`prompt`/`tools`), template constructs after `{` (`#each`/`#if` expand to full blocks), and your declared input names after `{inputs.`.

## 0.2.0

- **Live diagnostics** — the real `toac` compiler is bundled into the extension and validates `.agent` files as you type (located errors, debounced, with `TOAxxx` codes).
- Grammar: optional-field marker (`detail?,string`) and the `temperature` key.

## 0.1.0

- Initial release: `.agent` language registration, TextMate grammar (keys, `[N]` counts, tabular headers, types, template language), and language configuration (comments, brackets, indent rules).
