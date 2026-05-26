// TOAD site. The showcase and playground both run the real `toac` compiler,
// bundled to a browser ESM (`toad-compiler.js`) by `pnpm build:site`.

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
};

const $ = (id) => document.getElementById(id);
const setText = (id, text) => {
  const el = $(id);
  if (el) el.textContent = text;
};

setText("src-agent", AGENT_SRC);

// Load the in-browser compiler. If it fails, the page still works — only the
// generated-output panes degrade.
let compile = null;
let formatDiagnostic = null;
try {
  const mod = await import("./toad-compiler.js");
  compile = mod.compile;
  formatDiagnostic = mod.formatDiagnostic;
} catch (err) {
  console.error("TOAD: compiler bundle failed to load", err);
}

function renderResult(targetId, source) {
  const { code, diagnostics } = compile(source, "agent.agent");
  if (code !== undefined && diagnostics.length === 0) {
    setText(targetId, code);
    return { ok: true, count: 0 };
  }
  const text = diagnostics
    .map((d) => (formatDiagnostic ? formatDiagnostic(d) : `${d.code}: ${d.message}`))
    .join("\n");
  setText(targetId, text || "// no output");
  return { ok: false, count: diagnostics.length };
}

if (compile) {
  // Showcase: compile the canonical example.
  renderResult("src-ts", AGENT_SRC);

  // Playground: live recompile on input.
  const input = $("pg-input");
  const status = $("pg-status");
  if (input) {
    input.value = AGENT_SRC;
    const run = () => {
      const res = renderResult("pg-output", input.value);
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
  }
} else {
  const note = "// compiler bundle unavailable — run `pnpm build:site`";
  setText("src-ts", note);
  setText("pg-output", note);
  const input = $("pg-input");
  if (input) {
    input.value = AGENT_SRC;
    input.setAttribute("disabled", "true");
  }
  const status = $("pg-status");
  if (status) status.textContent = "Playground unavailable.";
}

// "Write agents with AI": the copy-paste authoring prompt.
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

TYPES: string | number | boolean. Append [] for an array, e.g. string[].

INTERPOLATION: in the prompt, {inputs.<name>} inserts a declared input's value.
The name must be one you declared in inputs. Use {{ and }} for literal braces.
{env.<NAME>} inserts an environment variable (process.env.<NAME>).

LOOPS: iterate an array input with {#each inputs.<name> as <item>} ... {/each};
reference the element with {<item>}. Optional 0-based index: {#each ... as <item>, <i>}.
Empty-list fallback: {#each ...} ... {:else} ... {/each}.

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
