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
