// First-try authoring accuracy: have Claude write .agent files for a set of
// task descriptions using the public authoring prompt, then check how many
// compile cleanly on the first attempt. This is the credibility number behind
// "the format is explicit enough for LLMs to author reliably".
//
// Usage (needs an API key; one model call per task):
//   ANTHROPIC_API_KEY=... node scripts/eval-authoring.mjs
//   EVAL_MODEL=claude-opus-4-7 node scripts/eval-authoring.mjs
import { compile, formatDiagnostic } from "../packages/compiler/dist/index.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("eval-authoring: set ANTHROPIC_API_KEY to run this eval");
  process.exit(1);
}

const req = createRequire(
  new URL("../packages/runtime/package.json", import.meta.url),
);
const { default: Anthropic } = await import(req.resolve("@anthropic-ai/sdk"));
const client = new Anthropic();
const MODEL = process.env.EVAL_MODEL ?? "claude-opus-4-7";

// The same authoring prompt the docs publish (docs/authoring.md, "Now write a
// .agent file for this task:" suffix re-added per task below).
const authoringDoc = readFileSync(
  new URL("../docs/authoring.md", import.meta.url),
  "utf8",
);
const promptStart = authoringDoc.indexOf("You write TOAD agent files.");
const promptEnd = authoringDoc.indexOf(
  "Now write a .agent file for this task:",
);
const AUTHORING_PROMPT =
  promptStart >= 0 && promptEnd > promptStart
    ? authoringDoc.slice(promptStart, promptEnd)
    : authoringDoc;

const TASKS = [
  "Translate a given text into a given target language.",
  "Given a product name and a list of customer review strings, summarize overall sentiment and list the top complaints.",
  "Given a list of {city:string;tempC:number} readings, report the hottest city and whether any city is above 35C.",
  "Research a company using a web_search tool and a fetch_page tool, returning a profile summary and a list of source URLs.",
  "Given an email text and a boolean 'formal', draft a reply in the appropriate tone.",
  "Given a list of bug report strings and a 'critical_only' boolean, triage them into a prioritized list.",
  "Given a recipe name and number of servings, produce an ingredient list (array of strings) and step-by-step instructions.",
  "Given a list of {name:string;score:number} players, rank them and return the winner's name and a podium of top 3 names.",
  "Check a given text for spelling and grammar issues using no tools; return the corrected text and a list of changes.",
  "Given a topic and an audience description, write a tweet thread as an array of tweets, each under 280 characters.",
  "Given a SQL query string, explain what it does in plain English and flag any performance concerns as a list.",
  "Given a list of meeting note strings and a boolean 'action_items_only', produce minutes or just the action items.",
  "Given a stock ticker, use a get_price tool and a get_news tool to produce a one-paragraph briefing and a recommendation string.",
  "Given a list of {question:string;answer:string} flashcards, quiz the user by generating 5 new practice questions.",
  "Given a country name, use a wiki_lookup tool to return its capital, population (number), and a short history summary.",
  "Given a git diff string, write a conventional-commit message and a bullet-point changelog entry list.",
  "Given a list of expense records {label:string;amount:number} and a budget number, report total, over/under, and the biggest item.",
  "Given a job description and a resume text, score the match from 0-100 (number) and list missing skills.",
  "Given an article text and a reading level ('simple' as a boolean), rewrite it preserving the facts.",
  "Given a list of URLs, use a fetch_page tool to check each and return lists of working and broken URLs.",
];

const stripFences = (text) =>
  text
    .replace(/^\s*```[a-z]*\n/, "")
    .replace(/\n```\s*$/, "")
    .trim();

let valid = 0;
const failures = [];
for (const [i, task] of TASKS.entries()) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${AUTHORING_PROMPT}Now write a .agent file for this task:\n${task}`,
      },
    ],
  });
  const text = stripFences(
    res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(""),
  );
  const { code, diagnostics } = compile(text, `task-${i}.agent`);
  const ok = code !== undefined && diagnostics.length === 0;
  if (ok) valid++;
  else failures.push({ task, diagnostics: diagnostics.map(formatDiagnostic) });
  console.log(
    `${ok ? "✓" : "✗"} [${i + 1}/${TASKS.length}] ${task.slice(0, 70)}`,
  );
}

const pct = Math.round((valid / TASKS.length) * 100);
console.log(
  `\nFirst-try valid: ${valid}/${TASKS.length} (${pct}%) — model: ${MODEL}`,
);
for (const f of failures) {
  console.log(`\n✗ ${f.task}`);
  for (const d of f.diagnostics) console.log(`  ${d}`);
}
