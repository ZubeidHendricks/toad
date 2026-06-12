// Generates site/public/llms-full.txt — the whole documentation set as one
// plain-markdown file for LLM consumption (https://llmstxt.org). Runs as part
// of `pnpm build:site`.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// Page order mirrors the site's sidebar.
const SOURCES = [
  "site/guide/getting-started.md",
  "site/guide/tutorial.md",
  "site/guide/agent-format.md",
  "site/guide/templates.md",
  "site/guide/writing-with-ai.md",
  "SPEC.md",
  "site/reference/cli.md",
  "site/reference/runtime.md",
  "site/benchmarks.md",
  "site/examples.md",
  "site/ecosystem.md",
];

function clean(md) {
  return (
    md
      // frontmatter
      .replace(/^---\n[\s\S]*?\n---\n/, "")
      // Vue-only bits: component tags and v-pre wrappers
      .replace(/<Mermaid[^>]*\/>\n?/g, "")
      .replace(/<div v-pre>\n?/g, "")
      .replace(/<\/div>\n?/g, "")
      .replace(/<code v-pre>(.*?)<\/code>/g, "`$1`")
      // include directives (the spec page includes SPEC.md, listed separately)
      .replace(/<!--@include:.*-->\n?/g, "")
      // VitePress containers -> plain text
      .replace(/^:::\s*\w*.*$/gm, "")
      .trim()
  );
}

const parts = [
  "# TOAD — Token-Oriented Agentic Development (full documentation)",
  "",
  "> Generated from the site sources. Index: https://zubeidhendricks.github.io/toad/llms.txt",
  "",
];
for (const rel of SOURCES) {
  const md = readFileSync(new URL(rel, `file://${root}`), "utf8");
  parts.push("---", "", `<!-- source: ${rel} -->`, "", clean(md), "");
}

const out = new URL("site/public/llms-full.txt", `file://${root}`);
writeFileSync(out, parts.join("\n"));
console.log(`wrote ${fileURLToPath(out)} (${parts.join("\n").length} chars)`);
