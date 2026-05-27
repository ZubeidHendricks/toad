// TOAD site (multi-page). One module shared by every page; it fills whichever
// hooks are present on the current page and no-ops for the rest. The showcase,
// examples, and playground all run the real `toac` compiler, bundled to a
// browser ESM (`toad-compiler.js`) by `pnpm build:site`.

const AGENT_SRC = `agent: researcher
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
  sources,string[]`;

const PRESETS = {
  researcher: AGENT_SRC,
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

const $ = (id) => document.getElementById(id);
const setText = (id, text) => {
  const el = $(id);
  if (el) el.textContent = text;
};

// Static (no-compiler) hooks, safe to set on any page.
setText("src-agent", AGENT_SRC);
setText("lang-example", PRESETS.brief);

// Load the in-browser compiler. If it fails, the page still works — only the
// generated-output panes degrade.
let compile = null;
let formatDiagnostic = null;
try {
  // app.js always lives at the site root, so this specifier (resolved relative
  // to app.js, not the page) points at the bundle from every page.
  const mod = await import("./toad-compiler.js");
  compile = mod.compile;
  formatDiagnostic = mod.formatDiagnostic;
} catch (err) {
  console.error("TOAD: compiler bundle failed to load", err);
}

function compileText(source) {
  const { code, diagnostics } = compile(source, "agent.agent");
  if (code !== undefined && diagnostics.length === 0) {
    return { text: code, ok: true, count: 0 };
  }
  const text = diagnostics
    .map((d) => (formatDiagnostic ? formatDiagnostic(d) : `${d.code}: ${d.message}`))
    .join("\n");
  return { text: text || "// no output", ok: false, count: diagnostics.length };
}

function renderInto(el, source) {
  const res = compileText(source);
  el.textContent = res.text;
  return res;
}

const UNAVAILABLE = "// compiler bundle unavailable — run `pnpm build:site`";

// Showcase (home): compile the canonical example into #src-ts.
const srcTs = $("src-ts");
if (srcTs) srcTs.textContent = compile ? compileText(AGENT_SRC).text : UNAVAILABLE;

// Examples page: <code data-ex="researcher" data-part="src|ts">.
document.querySelectorAll("[data-ex]").forEach((el) => {
  const key = el.getAttribute("data-ex");
  const part = el.getAttribute("data-part");
  const src = PRESETS[key];
  if (!src) return;
  if (part === "ts") {
    el.textContent = compile ? compileText(src).text : UNAVAILABLE;
  } else {
    el.textContent = src;
  }
});

// Playground: live recompile on input.
const input = $("pg-input");
if (input) {
  const status = $("pg-status");
  if (compile) {
    input.value = AGENT_SRC;
    const run = () => {
      const out = $("pg-output");
      if (!out) return;
      const res = renderInto(out, input.value);
      if (status) {
        status.textContent = res.ok ? "✓ compiled" : `✗ ${res.count} error(s)`;
        status.className = "pg-status " + (res.ok ? "ok" : "err");
      }
    };
    let timer;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(run, 150);
    });
    run();

    document.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-preset");
        if (key && PRESETS[key]) {
          input.value = PRESETS[key];
          run();
        }
      });
    });
  } else {
    input.value = AGENT_SRC;
    input.setAttribute("disabled", "true");
    setText("pg-output", UNAVAILABLE);
    if (status) status.textContent = "Playground unavailable.";
  }
}

// "Write agents with AI": the copy-paste authoring prompt (docs page).
const PROMPT = `You write TOAD agent files. TOAD is a compile-first framework: an agent is a
declarative .agent file that a compiler turns into typed TypeScript. Given a
task, output ONE valid .agent file and nothing else — no prose, no code fences.

THE .agent FORMAT (indentation is 2 spaces, never tabs):

  agent: <identifier>      required. name; letters/digits/_, starts with a letter or _
  model: <string>          required. a Claude model id, e.g. claude-opus-4-7
  description: <string>    optional. one line on what it does
  inputs[N]{name,type}:    optional. N typed inputs, one per indented row:
    <name>,<type>            e.g.  topic,string
  tools[N]: <a>,<b>        optional. N tool names (identifiers), comma-separated
  prompt: |                required. the instruction prompt as an indented block:
    line one of the prompt...
  outputs[N]{name,type}:   optional. N typed result fields, one per indented row
  system: |                optional. a system prompt (else uses the description)
  uses[N]: <a>,<b>         optional. sub-agents used as tools

TYPES: string | number | boolean, or a quoted object type "{a:string;b:number}".
Append [] for an array (string[], "{...}[]"). Read object fields with x.field.

INTERPOLATION: in the prompt, {inputs.<name>} inserts a declared input's value.
The name must be one you declared in inputs. Use {{ and }} for literal braces.
{env.<NAME>} inserts an environment variable (process.env.<NAME>).

LOOPS: iterate an array input with {#each inputs.<name> as <item>} ... {/each};
reference the element with {<item>}. Optional 0-based index: {#each ... as <item>, <i>}.
Empty-list fallback: {#each ...} ... {:else} ... {/each}. Destructure object
elements: {#each inputs.rows as {a, b}} ... {a} ... {/each}.

CONDITIONALS: {#if inputs.<flag>} ... {:else if inputs.<other>} ... {:else} ... {/if}
on boolean inputs; a leading ! negates.

RULES:
- Output only the .agent file.
- A header's count must match its rows: inputs[2]{...} has exactly 2 rows;
  tools[2]: a,b lists exactly 2 names.
- Every {inputs.x} must reference a declared input.
- Keep logic out of the prompt; name tools here and implement them in TypeScript.

EXAMPLE 1 — a tool-using agent:

agent: researcher
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

EXAMPLE 2 — no tools, structured output:

agent: summarizer
model: claude-opus-4-7
description: Summarize text into key bullet points.
inputs[1]{name,type}:
  text,string
prompt: |
  Summarize the following into 3-5 concise bullet points:
  {inputs.text}
outputs[1]{name,type}:
  bullets,string[]

EXAMPLE 3 — a loop over an array input:

agent: digest
model: claude-opus-4-7
description: Turn a list of notes into a short summary.
inputs[1]{name,type}:
  notes,string[]
prompt: |
  Summarize these notes into a short paragraph:
  {#each inputs.notes as note}
  - {note}
  {/each}
outputs[1]{name,type}:
  summary,string

Now write a .agent file for this task:
<describe your agent here>`;

setText("ai-prompt", PROMPT);
const copyBtn = $("copy-prompt");
if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    const original = copyBtn.textContent;
    try {
      await navigator.clipboard.writeText(PROMPT);
      copyBtn.textContent = "Copied ✓";
    } catch {
      copyBtn.textContent = "Copy failed";
    }
    setTimeout(() => {
      copyBtn.textContent = original;
    }, 1500);
  });
}
