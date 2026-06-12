// Measures the token numbers published on site/benchmarks.md and emits the
// compiled TS embedded on site/examples.md. Run after `pnpm build`:
//   node scripts/measure-tokens.mjs
import {
  compile,
  preprocess,
  decodeToon,
} from "../packages/compiler/dist/index.js";
import { countTokens } from "gpt-tokenizer";
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";

const req = createRequire(
  new URL("../packages/runtime/package.json", import.meta.url),
);
const { encode } = await import(req.resolve("@toon-format/toon"));

const PRESETS = {
  researcher: `agent: researcher
model: claude-opus-4-7
description: Research a topic and return a sourced summary.
inputs[1]{name,type}:
  topic,string
tools[2]: web_search,fetch_page
prompt: |
  You are a research analyst. Research: {inputs.topic}
  Use web_search to find sources, then fetch_page to read them.
  Return a cited summary.
outputs[2]{name,type}:
  summary,string
  sources,string[]`,
  summarizer: `agent: summarizer
model: claude-opus-4-7
description: Summarize text into key bullet points.
inputs[1]{name,type}:
  text,string
prompt: |
  Summarize the following into 3-5 concise bullet points:
  {inputs.text}
outputs[1]{name,type}:
  bullets,string[]`,
  digest: `agent: digest
model: claude-opus-4-7
description: Turn a list of notes into a short summary.
inputs[1]{name,type}:
  notes,string[]
prompt: |
  Summarize these notes into a short paragraph:
  {#each inputs.notes as note, i}
  {i}. {note}
  {/each}
outputs[1]{name,type}:
  summary,string`,
  report: `agent: report
model: claude-opus-4-7
description: Write a report from findings, optionally detailed.
inputs[2]{name,type}:
  findings,string[]
  detailed,boolean
prompt: |
  Write a report from these findings:
  {#each inputs.findings as f}
  - {f}
  {/each}
  {#if inputs.detailed}
  Include a thorough analysis section.
  {:else}
  Keep it to a single paragraph.
  {/if}
outputs[1]{name,type}:
  report,string`,
  brief: `agent: brief
model: claude-opus-4-7
description: Summarize sources for an audience, optionally in detail.
inputs[3]{name,type}:
  sources,"{title:string;url:string}[]"
  detailed,boolean
  audience,string
prompt: |
  Write a brief for {inputs.audience}.
  {#each inputs.sources as {title, url}, i}
  {i}. {title} — {url}
  {:else}
  No sources provided.
  {/each}
  {#if inputs.detailed}
  Include a thorough analysis section.
  {:else}
  Keep it to a single paragraph.
  {/if}
outputs[1]{name,type}:
  brief,string`,
};

// --- 1. .agent vs equivalent JSON, per preset -------------------------------
console.log("## agent vs json\n");
console.log("| agent | .agent tokens | JSON tokens | savings |");
for (const [name, src] of Object.entries(PRESETS)) {
  const { toon } = preprocess(src, `${name}.agent`);
  const { value } = decodeToon(toon, `${name}.agent`);
  const json = JSON.stringify(value, null, 2);
  const a = countTokens(src);
  const j = countTokens(json);
  console.log(`| ${name} | ${a} | ${j} | ${Math.round((1 - a / j) * 100)}% |`);
}

// --- 2. tool-result serialization: JSON vs TOON -----------------------------
const users = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  name: ["Alice", "Bob", "Carol", "Dan", "Eve"][i % 5] + ` ${i + 1}`,
  email: `user${i + 1}@example.com`,
  role: i % 3 === 0 ? "admin" : "member",
  active: i % 4 !== 0,
}));
const orders = Array.from({ length: 50 }, (_, i) => ({
  orderId: 1000 + i,
  sku: `SKU-${(i * 37) % 900}`,
  qty: (i % 7) + 1,
  price: Math.round((9.99 + i * 1.37) * 100) / 100,
  status: ["pending", "shipped", "delivered"][i % 3],
}));
const search = Array.from({ length: 10 }, (_, i) => ({
  title: `Result ${i + 1}: a moderately descriptive page title`,
  url: `https://example.com/articles/${i + 1}`,
  snippet: `A short snippet of the page content for result number ${i + 1}, truncated.`,
  score: Math.round((0.95 - i * 0.06) * 100) / 100,
}));
const nested = {
  service: "api-gateway",
  env: "production",
  limits: { rps: 100, burst: 250, timeoutMs: 30000 },
  features: { auth: true, tracing: true, cache: { ttl: 300, maxItems: 5000 } },
  origins: ["https://app.example.com", "https://admin.example.com"],
};

console.log("\n## tool results json vs toon\n");
console.log("| dataset | JSON tokens | TOON tokens | savings |");
for (const [name, value] of Object.entries({
  "users (20 rows)": users,
  "orders (50 rows)": orders,
  "search results (10 rows)": search,
  "nested config (object)": nested,
})) {
  const j = countTokens(JSON.stringify(value));
  const t = countTokens(encode(value));
  console.log(`| ${name} | ${j} | ${t} | ${Math.round((1 - t / j) * 100)}% |`);
}

// --- 3. compiled TS per preset, for the examples page ------------------------
mkdirSync("/tmp/toad-compiled", { recursive: true });
for (const [name, src] of Object.entries(PRESETS)) {
  const { code, diagnostics } = compile(src, `${name}.agent`);
  if (code === undefined) {
    console.error(`compile failed for ${name}`, diagnostics);
    continue;
  }
  writeFileSync(`/tmp/toad-compiled/${name}.ts`, code);
  const b64 = Buffer.from(src, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  writeFileSync(`/tmp/toad-compiled/${name}.hash.txt`, b64);
}
console.log("\ncompiled TS written to /tmp/toad-compiled/");
