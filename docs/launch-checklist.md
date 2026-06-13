# Launch & adoption checklist

Goal: make TOAD the de facto standard for token-optimised agentic development.
A standard needs four things: **a spec people can target, tooling everywhere
code is written, numbers people can verify, and distribution**. The first three
are in the repo; this file is the distribution plan. Items marked 🔑 need
account credentials only Zubeid has.

## 1 · Ship the release train

- [ ] Merge the `vitepress-site` branch → site deploys to GitHub Pages
- [ ] Bump packages to `0.2.0` (adds `toac init`), update `site/blog/index.md` with release notes
- [ ] 🔑 `git tag v0.2.0 && git push origin v0.2.0` → `release.yml` publishes to npm (needs `NPM_TOKEN` secret)
- [ ] Cut a GitHub Release with the same notes (releases feed the blog + nav version menu)

## 2 · Publish the VS Code extension

- [ ] 🔑 Create a [VS Code Marketplace publisher](https://marketplace.visualstudio.com/manage) matching `"publisher": "ZubeidHendricks"` in `editors/vscode/package.json` (or update the field)
- [ ] `cd editors/vscode && npx @vscode/vsce package` → smoke-test the `.vsix` locally
- [ ] 🔑 `npx @vscode/vsce publish`
- [ ] Also publish to [Open VSX](https://open-vsx.org) (`npx ovsx publish`) for Cursor/VSCodium users — agent authors disproportionately use these
- [ ] Update `site/ecosystem.md` editor section with the marketplace link

## 3 · Plant the flag in the TOON ecosystem

TOAD's legitimacy flows from TOON's. Being the canonical "agents" entry in their ecosystem is the single highest-leverage listing:

- [ ] 🔑 Open a PR/issue at [toon-format/toon](https://github.com/toon-format/toon) proposing TOAD for their ecosystem/implementations list ("TOAD — a compile-first agent framework whose `.agent` format is a strict TOON superset")
- [ ] Ask for a link on toonformat.dev's ecosystem page (same repo or their site repo)
- [ ] Watch TOON spec releases; track decoder versions promptly (standards die from drift)

## 4 · Publish the credibility numbers

- [ ] 🔑 Run `ANTHROPIC_API_KEY=... node scripts/eval-authoring.mjs` (20 tasks, one call each)
- [ ] Add the first-try-valid % to `site/benchmarks.md` as a third section ("Authoring accuracy") and to the README/hero if strong (expected: high — the `[N]` markers exist precisely for this)
- [ ] If a task fails, that's a diagnostics bug to fix before launch — failures are the QA list

## 5 · Launch posts

- [ ] 🔑 **Show HN** — suggested draft:
  > **Show HN: TOAD – Write AI agents as tiny TOON files that compile to typed TypeScript**
  >
  > I built TOAD (Token-Oriented Agentic Development) because agent definitions are mostly boilerplate: JSON schemas, SDK wiring, prompt templating. A TOAD agent is a small declarative `.agent` file — a strict superset of TOON — that a compiler (`toac`) turns into readable, fully-typed TypeScript running on Claude.
  >
  > Measured on the playground presets, a `.agent` file is 30–38% fewer tokens than the equivalent JSON, and the runtime can re-encode tabular tool results as TOON for another ~30–40% per tool turn (with an "auto" mode that never loses to JSON). The explicit `[N]` length markers also make the format unusually reliable for LLMs to author.
  >
  > Everything compiles in the browser on the site's playground — no server. Spec, benchmarks, and a VS Code extension are in the repo. MIT.
- [ ] 🔑 X/Twitter thread: lead with the playground GIF + the 38% number; tag the TOON author
- [ ] 🔑 r/ClaudeAI, r/LocalLLaMA posts (different angles: token cost vs typed agents)
- [ ] dev.to / Hashnode cross-post of a "why compile agents" essay (reuse blog post)

## 6 · GitHub repo polish

- [ ] 🔑 Repo topics: `ai-agents`, `toon`, `llm`, `claude`, `anthropic`, `typescript`, `compiler`, `token-optimization`, `agentic-ai`
- [ ] 🔑 Repo description → "Token-Oriented Agentic Development — tiny .agent files compiled to typed TypeScript. 30–38% fewer tokens." + site URL
- [ ] 🔑 Social preview image (Settings → General; use the mascot + tagline)
- [ ] Add `CONTRIBUTING.md` + 5–10 `good first issue`s (grammar improvements, new examples, diagnostics polish) — arrivals from HN need something to grab
- [ ] Submit to awesome lists: awesome-claude, awesome-llm-agents, awesome-typescript

## 7 · Keep compounding (the actual "de facto" part)

- [ ] One blog post per release, every release — dead blogs read as dead projects
- [ ] Grow `site/examples.md` toward 15–20 agents covering real use cases (the gallery is the SEO surface)
- [ ] In-editor diagnostics (`toac check` → LSP) — the roadmap item people will ask for first
- [ ] Integrations where agents already live: a Claude Code skill that authors `.agent` files; ~~an MCP server exposing compiled agents as tools~~ — shipped as `serveMcp` in `toad-runtime/mcp`
- [ ] Track the two numbers that define "standard": weekly npm downloads and `.agent` files visible in GitHub code search — review monthly
