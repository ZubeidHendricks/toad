/**
 * Reproducible, no-API benchmark of TOAD's tool-loop token optimizations.
 *
 * A scripted multi-turn agent calls an over-fetching, tabular search tool a few
 * times before answering. We replay the exact same conversation through a mock
 * client under increasingly-optimized configs and measure the total input
 * tokens sent across the run — so each lever's contribution is isolated and the
 * result is deterministic (no network, no API key).
 *
 *   pnpm build && node scripts/bench-tool-loop.mjs
 *
 * Token counts use the project's own heuristic estimator (the same one behind
 * `toac cost` / `onContext`): relative, not exact provider billing — but the
 * deltas between configs are the point.
 */
import { createRequire } from "node:module";
import { createAgent, defineTool } from "../packages/runtime/dist/index.js";
import { estimateTokens } from "../packages/compiler/dist/cost.js";

// Resolve the same `zod` copy the runtime uses (pnpm doesn't hoist it to root).
const { z } = createRequire(
  new URL("../packages/runtime/dist/index.js", import.meta.url),
)("zod");

const SEARCH_TURNS = 5; // tool calls before the model answers

// One over-fetched search hit: flat, uniform rows — what search / DB / listing
// tools typically return (TOON's sweet spot). The model usually needs only
// title/url/snippet, but the tool returns the whole record.
function hit(i) {
  return {
    title: `Result ${i}: Token-Oriented Agentic Development`,
    url: `https://example.com/articles/${i}/token-oriented-agentic-development`,
    snippet:
      "TOAD compiles a tiny .agent file into typed TypeScript and runs a " +
      "tool-use loop over Claude, with TOON-encoded results and context " +
      "budgeting to keep multi-turn loops cheap. " +
      `(${i})`,
    score: 0.9 - i * 0.01,
    source: "example.com",
    publishedAt: "2026-06-01T12:00:00Z",
    rank: i,
    docId: `doc_${i}_abcdef0123456789`,
  };
}
const RESULTS = Array.from({ length: 10 }, (_, i) => hit(i + 1));

// A mock client that (a) measures the input it is sent, and (b) replays the
// fixed script: call `search` SEARCH_TURNS times, then answer.
function benchClient() {
  let call = 0;
  let inputTokens = 0;
  return {
    tokens: () => inputTokens,
    create: async (req) => {
      inputTokens +=
        estimateTokens(JSON.stringify(req.system ?? "")) +
        estimateTokens(JSON.stringify(req.tools ?? [])) +
        estimateTokens(JSON.stringify(req.messages ?? []));
      call += 1;
      if (call <= SEARCH_TURNS) {
        return {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: `s${call}`,
              name: "search",
              input: { q: `query ${call}` },
            },
          ],
        };
      }
      return {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "final answer" }],
      };
    },
  };
}

async function runConfig({
  toolResultFormat,
  fields,
  ephemeral,
  maxContextTokens,
}) {
  const client = benchClient();
  const search = defineTool({
    description: "Search the web for a query; returns ranked results.",
    input: z.object({ q: z.string() }),
    ...(fields ? { fields } : {}),
    ...(ephemeral ? { ephemeral: true } : {}),
    run: () => RESULTS,
  });
  const config = {
    name: "researcher",
    model: "claude-opus-4-7",
    description: "Research a topic using the search tool, then summarize.",
    tools: { search },
    prompt: () => "Research the topic thoroughly using search, then summarize.",
    client,
  };
  if (toolResultFormat) config.toolResultFormat = toolResultFormat;
  if (maxContextTokens) config.maxContextTokens = maxContextTokens;
  await createAgent(config).run({});
  return client.tokens();
}

const CONFIGS = [
  { label: "baseline (JSON, no shaping)", opts: {} },
  { label: "+ TOON auto encoding", opts: { toolResultFormat: "auto" } },
  {
    label: "+ field projection",
    opts: { toolResultFormat: "auto", fields: ["title", "url", "snippet"] },
  },
  {
    label: "+ ephemeral results",
    opts: {
      toolResultFormat: "auto",
      fields: ["title", "url", "snippet"],
      ephemeral: true,
    },
  },
];

const results = [];
for (const c of CONFIGS)
  results.push({ ...c, tokens: await runConfig(c.opts) });

const baseline = results[0].tokens;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
console.log(
  `\nTool-loop input tokens over ${SEARCH_TURNS} search turns (estimated)\n`,
);
console.log(
  `  ${pad("config", 32)}${lpad("tokens", 9)}${lpad("vs baseline", 14)}`,
);
console.log(`  ${"─".repeat(32 + 9 + 14)}`);
for (const r of results) {
  const delta =
    r.tokens === baseline
      ? "—"
      : `-${Math.round((1 - r.tokens / baseline) * 100)}%`;
  console.log(
    `  ${pad(r.label, 32)}${lpad(r.tokens.toLocaleString(), 9)}${lpad(delta, 14)}`,
  );
}
console.log(
  `\n  Heuristic estimate (relative, not provider billing). ${SEARCH_TURNS} tool turns,` +
    ` each returning ${RESULTS.length} over-fetched results.\n`,
);
