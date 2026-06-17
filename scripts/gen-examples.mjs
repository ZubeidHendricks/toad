// Generates site/examples.md — the examples gallery. Each entry pairs a real
// `.agent` source with the *exact* `toac` output (compiled here, never
// hand-written) and an "open in playground" link whose hash is the base64url of
// the source, matching Playground.vue's share()/fromHash() encoding. Owning the
// whole page from source means the generated TypeScript and the share links can
// never drift from the compiler.
//
//   pnpm build && node scripts/gen-examples.mjs            # writes the file
//   pnpm build && node scripts/gen-examples.mjs --check    # CI: fail if stale
//
// Run after `pnpm build` (it imports the built compiler). No API, no network.
import { readFile, writeFile } from "node:fs/promises";
import { compile } from "../packages/compiler/dist/index.js";

const INTRO = `# Examples

Each example below is the real \`.agent\` source and the exact \`toac\` output. Every one has an "open in playground" link — edit it there and watch it recompile live.`;

const OUTRO = `---

There's also a complete, type-checked project in the repo: [\`examples/researcher\`](https://github.com/ZubeidHendricks/toad/tree/main/examples/researcher) — \`.agent\` source, generated \`.ts\`, tool implementations, and a live integration test.`;

/**
 * The gallery, in order. `title` is the H2 (name — what it shows off); `source`
 * is the verbatim `.agent` file. The first five match the original hand-written
 * gallery; the rest are real-use-case agents that, together, cover every
 * language feature: enums, numbers, object/array types, multiple tools,
 * `system:`, `{env}`, `{#each}`/`{#if}`, and `uses:` composition.
 */
const EXAMPLES = [
  {
    title: "researcher — tools + structured output",
    source: `agent: researcher
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
  sources,string[]
`,
  },
  {
    title: "summarizer — typed array output",
    source: `agent: summarizer
model: claude-opus-4-7
description: Summarize text into key bullet points.
inputs[1]{name,type}:
  text,string
prompt: |
  Summarize the following into 3-5 concise bullet points:
  {inputs.text}
outputs[1]{name,type}:
  bullets,string[]
`,
  },
  {
    title: "digest — `{#each}` loop with index",
    source: `agent: digest
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
  summary,string
`,
  },
  {
    title: "report — `{#each}` + `{#if}` conditional",
    source: `agent: report
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
  report,string
`,
  },
  {
    title: "brief — object types, destructuring, kitchen sink",
    source: `agent: brief
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
  brief,string
`,
  },
  {
    title: "classifier — enum output (a closed set of labels)",
    source: `agent: classifier
model: claude-opus-4-7
description: Classify a support message by intent.
inputs[1]{name,type}:
  message,string
prompt: |
  Classify this customer message by intent:
  {inputs.message}
outputs[2]{name,type}:
  intent,billing|technical|sales|other
  confidence,number
`,
  },
  {
    title: "translator — minimal interpolation",
    source: `agent: translator
model: claude-opus-4-7
description: Translate text into a target language.
inputs[2]{name,type}:
  text,string
  target,string
prompt: |
  Translate the following into {inputs.target}. Return only the translation.
  {inputs.text}
outputs[1]{name,type}:
  translation,string
`,
  },
  {
    title: "sql-generator — schema in, query + explanation out",
    source: `agent: sql_generator
model: claude-opus-4-7
description: Turn a question into SQL against a given schema.
inputs[2]{name,type}:
  question,string
  schema,string
prompt: |
  Given this database schema:
  {inputs.schema}

  Write a single SQL query that answers: {inputs.question}
outputs[2]{name,type}:
  sql,string
  explanation,string
`,
  },
  {
    title: "code-reviewer — array of objects with an enum field",
    source: `agent: code_reviewer
model: claude-opus-4-7
description: Review a diff and return structured findings.
inputs[2]{name,type}:
  diff,string
  language,string
prompt: |
  Review this {inputs.language} diff for bugs, style, and clarity:
  {inputs.diff}

  Return one finding per issue.
outputs[1]{name,type}:
  findings,"{line:number;severity:low|medium|high;message:string}[]"
`,
  },
  {
    title: "email-writer — enum input (tone)",
    source: `agent: email_writer
model: claude-opus-4-7
description: Draft an email in a chosen tone.
inputs[3]{name,type}:
  recipient,string
  topic,string
  tone,formal|casual|friendly
prompt: |
  Write an email to {inputs.recipient} about {inputs.topic}.
  Use a {inputs.tone} tone.
outputs[2]{name,type}:
  subject,string
  body,string
`,
  },
  {
    title: "support-agent — multiple tools + escalation",
    source: `agent: support_agent
model: claude-opus-4-7
description: Answer a customer question from the knowledge base, escalating if needed.
inputs[1]{name,type}:
  question,string
tools[2]: search_kb,create_ticket
prompt: |
  Answer the customer's question: {inputs.question}
  Search the knowledge base first with search_kb. If you can't resolve it,
  open a ticket with create_ticket and tell the customer.
outputs[2]{name,type}:
  answer,string
  escalated,boolean
`,
  },
  {
    title: "contact-extractor — structured extraction",
    source: `agent: contact_extractor
model: claude-opus-4-7
description: Pull contact fields out of unstructured text.
inputs[1]{name,type}:
  text,string
prompt: |
  Extract the contact details from this text. Use an empty string for any
  field that is not present.
  {inputs.text}
outputs[4]{name,type}:
  name,string
  email,string
  phone,string
  company,string
`,
  },
  {
    title: "meeting-notes — several array outputs at once",
    source: `agent: meeting_notes
model: claude-opus-4-7
description: Turn a transcript into notes, actions, and decisions.
inputs[1]{name,type}:
  transcript,string
prompt: |
  From this meeting transcript, produce a short summary, the action items,
  and the decisions made:
  {inputs.transcript}
outputs[3]{name,type}:
  summary,string
  action_items,string[]
  decisions,string[]
`,
  },
  {
    title: "product-namer — number input + array output",
    source: `agent: product_namer
model: claude-opus-4-7
description: Brainstorm product names in a given style.
inputs[3]{name,type}:
  description,string
  count,number
  style,playful|professional|techy
prompt: |
  Suggest {inputs.count} {inputs.style} names for this product:
  {inputs.description}
outputs[1]{name,type}:
  names,string[]
`,
  },
  {
    title: "changelog-writer — `{#each}` over commit messages",
    source: `agent: changelog_writer
model: claude-opus-4-7
description: Turn raw commit messages into a readable changelog.
inputs[2]{name,type}:
  version,string
  commits,string[]
prompt: |
  Write a changelog for {inputs.version}, grouping these commits by type
  (features, fixes, docs):
  {#each inputs.commits as c}
  - {c}
  {/each}
outputs[1]{name,type}:
  changelog,string
`,
  },
  {
    title: "faq-bot — object-array input + `{#each}`/`{#if}`",
    source: `agent: faq_bot
model: claude-opus-4-7
description: Answer a question from a provided FAQ, optionally strict.
inputs[3]{name,type}:
  question,string
  faqs,"{q:string;a:string}[]"
  strict,boolean
prompt: |
  Answer the question using this FAQ:
  {#each inputs.faqs as {q, a}}
  Q: {q}
  A: {a}
  {:else}
  (no FAQ entries provided)
  {/each}
  Question: {inputs.question}
  {#if inputs.strict}
  If none of the entries apply, reply that you don't know.
  {:else}
  If none apply, answer from general knowledge and say so.
  {/if}
outputs[2]{name,type}:
  answer,string
  matched,boolean
`,
  },
  {
    title: "persona-bot — a `system:` prompt block",
    source: `agent: persona_bot
model: claude-opus-4-7
description: Answer as a specific persona.
system: |
  You are a terse senior engineer. Prefer concrete examples over theory and
  never use more words than necessary.
inputs[1]{name,type}:
  question,string
prompt: |
  {inputs.question}
outputs[1]{name,type}:
  answer,string
`,
  },
  {
    title: "research-director — `uses:` composition (multi-agent)",
    source: `agent: research_director
model: claude-opus-4-7
description: Research a topic, then condense it for an executive.
inputs[1]{name,type}:
  topic,string
uses[2]: researcher,summarizer
prompt: |
  Research {inputs.topic} with the researcher sub-agent, then run the result
  through the summarizer to produce an executive-ready brief.
outputs[1]{name,type}:
  brief,string
`,
  },
];

/** base64url of a UTF-8 string — matches Playground.vue's share() encoding. */
function playgroundHash(source) {
  return Buffer.from(source, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Render one gallery section, compiling the source for the exact `.ts`. */
function section({ title, source }) {
  const slug = title.split(" ")[0];
  const { code, diagnostics } = compile(source, `${slug}.agent`);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (code === undefined || errors.length > 0) {
    throw new Error(
      `example "${slug}" did not compile: ${errors.map((d) => `${d.code} ${d.message}`).join("; ")}`,
    );
  }
  const ts = code.replace(/\n+$/, "");
  const hash = playgroundHash(source);
  return `## ${title}

::: code-group

\`\`\`agent [${slug}.agent]
${source}\`\`\`

\`\`\`ts [${slug}.ts (generated)]
${ts}
\`\`\`

:::

[Open in playground →](/playground#a=${hash})`;
}

const body = [INTRO, ...EXAMPLES.map(section), OUTRO].join("\n\n") + "\n";

const target = new URL("../site/examples.md", import.meta.url);
const check = process.argv.includes("--check");
if (check) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== body) {
    console.error(
      "examples.md is stale — run `pnpm build && node scripts/gen-examples.mjs`",
    );
    process.exit(1);
  }
  console.log(`examples.md up to date (${EXAMPLES.length} examples)`);
} else {
  await writeFile(target, body, "utf8");
  console.log(`wrote site/examples.md (${EXAMPLES.length} examples)`);
}
