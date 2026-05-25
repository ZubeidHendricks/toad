// NFR1 eval: how compact is a Toa `.agent` vs. the hand-written equivalent
// (JSON tool/IO schemas + SDK boilerplate) it replaces?
//
// Token counts here are a rough chars/4 estimate — good enough to track the
// trend without an API/tokenizer dependency. Run: `node evals/token-efficiency.mjs`.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const agent = await readFile(join(here, "..", "researcher.agent"), "utf8");

// A faithful "without Toa" baseline: the same agent expressed by hand.
const baseline = `import Anthropic from "@anthropic-ai/sdk";

interface ResearcherInput { topic: string }
interface ResearcherOutput { summary: string; sources: string[] }

const tools = [
  {
    name: "web_search",
    description: "Search the web for a query",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "fetch_page",
    description: "Fetch and read a URL",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "respond",
    description: "Return the final structured result.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        sources: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "sources"],
    },
  },
];

async function researcher(inputs: ResearcherInput): Promise<ResearcherOutput> {
  const client = new Anthropic();
  const messages = [
    {
      role: "user",
      content:
        "You are a research analyst. Research: " + inputs.topic + "\\n" +
        "Use web_search to find sources, then fetch_page to read them.\\n" +
        "Return a cited summary.\\n\\nWhen finished, call respond.",
    },
  ];
  // ... plus the full tool-use loop, tool dispatch, and output parsing ...
}
`;

const est = (s) => Math.ceil(s.length / 4);
const a = est(agent);
const b = est(baseline);
const ratio = Math.round((a / b) * 100);

console.log(`Toa .agent:    ${String(agent.length).padStart(5)} chars  ~${a} tokens`);
console.log(`JSON+TS base:  ${String(baseline.length).padStart(5)} chars  ~${b} tokens`);
console.log(`ratio:         ${ratio}% of baseline   (NFR1 target: <= 60%)`);
console.log(ratio <= 60 ? "PASS" : "OVER TARGET");
