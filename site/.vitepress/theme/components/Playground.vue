<script setup lang="ts">
// The TOAD playground: the real `toac` compiler, bundled to a browser ESM by
// `pnpm build:site` (-> site/public/toad-compiler.js), recompiles on every
// keystroke. Token meters start on an estimate and upgrade to exact GPT counts
// once the (large) gpt-tokenizer bundle lazy-loads.
import { computed, onMounted, ref, watch } from "vue";
import { withBase } from "vitepress";
import { AGENT_SRC, PRESETS, estimateTokens } from "../playground-data";

type CompilerModule = {
  compile: (src: string, file: string) => { code?: string; diagnostics: any[] };
  formatDiagnostic?: (d: any) => string;
  preprocess?: (src: string, file: string) => { toon: string; diagnostics: any[] };
  decodeToon?: (toon: string, file: string) => { value?: unknown; diagnostics: any[] };
};

const source = ref(AGENT_SRC);
const output = ref("// loading the compiler…");
const outTitle = ref("output.ts");
const status = ref("");
const statusOk = ref(true);
const savings = ref("");
const presetKey = ref("researcher");
const baseline = ref<"ts" | "json">("ts");
const copyLabel = ref("Copy");
const shareLabel = ref("Share");
const compilerFailed = ref(false);

let compiler: CompilerModule | null = null;
let exactCount: ((text: string) => number) | null = null;

const countTokens = (text: string) =>
  exactCount ? exactCount(text) : estimateTokens(text);

const num = (n: number) => n.toLocaleString("en-US");
const inTok = ref("0");
const inChr = ref("0");
const outTok = ref("0");
const outChr = ref("0");

function compileText(src: string) {
  const { code, diagnostics } = compiler!.compile(src, "agent.agent");
  if (code !== undefined && diagnostics.length === 0) {
    return { text: code, ok: true, count: 0 };
  }
  const text = diagnostics
    .map((d) =>
      compiler!.formatDiagnostic
        ? compiler!.formatDiagnostic(d)
        : `${d.code}: ${d.message}`,
    )
    .join("\n");
  return { text: text || "// no output", ok: false, count: diagnostics.length };
}

// The "Equivalent JSON" baseline: lower the .agent superset to plain TOON,
// decode it with the reference decoder, and pretty-print — i.e. what the same
// agent costs written as JSON.
function toEquivalentJson(src: string): string | null {
  if (!compiler?.preprocess || !compiler?.decodeToon) return null;
  try {
    const { toon, diagnostics: pd } = compiler.preprocess(src, "agent.agent");
    if (pd && pd.some((d) => d.severity === "error")) return null;
    const { value, diagnostics: dd } = compiler.decodeToon(toon, "agent.agent");
    if (value === undefined || (dd && dd.length)) return null;
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
}

function run() {
  if (!compiler) return;
  const src = source.value;

  inTok.value = num(countTokens(src));
  inChr.value = num(src.length);

  let text: string;
  let ok = true;
  let count = 0;
  if (baseline.value === "json") {
    outTitle.value = "output.json";
    const json = toEquivalentJson(src);
    if (json !== null) {
      text = json;
    } else {
      const res = compileText(src);
      text = "// can't decode to JSON yet — fix the agent first\n" + res.text;
      ok = res.ok;
      count = res.count;
    }
  } else {
    outTitle.value = "output.ts";
    const res = compileText(src);
    text = res.text;
    ok = res.ok;
    count = res.count;
  }
  output.value = text;
  outTok.value = num(countTokens(text));
  outChr.value = num(text.length);
  status.value = ok ? "✓ compiled" : `✗ ${count} error(s)`;
  statusOk.value = ok;

  const json = toEquivalentJson(src);
  if (json !== null) {
    const a = countTokens(src);
    const j = countTokens(json);
    const pct = j > 0 ? Math.round((1 - a / j) * 100) : 0;
    savings.value =
      pct > 0
        ? `🐸 The .agent is ~${pct}% fewer tokens than the equivalent JSON (${num(a)} vs ${num(j)}).`
        : "";
  } else {
    savings.value = "";
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(source, () => {
  clearTimeout(timer);
  timer = setTimeout(run, 150);
});
watch(baseline, run);
watch(presetKey, (key) => {
  if (PRESETS[key]) {
    source.value = PRESETS[key];
    run();
  }
});

function fromHash(): string | null {
  const m = location.hash.match(/[#&]a=([^&]+)/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return null;
  }
}

async function share() {
  const b64 = btoa(unescape(encodeURIComponent(source.value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const url = `${location.origin}${location.pathname}#a=${b64}`;
  history.replaceState(null, "", url);
  try {
    await navigator.clipboard.writeText(url);
    shareLabel.value = "Link copied ✓";
  } catch {
    shareLabel.value = "Copy the URL";
  }
  setTimeout(() => (shareLabel.value = "Share"), 1500);
}

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(output.value);
    copyLabel.value = "Copied ✓";
  } catch {
    copyLabel.value = "Copy failed";
  }
  setTimeout(() => (copyLabel.value = "Copy"), 1500);
}

onMounted(async () => {
  try {
    const url = withBase("/toad-compiler.js");
    compiler = (await import(/* @vite-ignore */ url)) as CompilerModule;
  } catch (err) {
    console.error("TOAD: compiler bundle failed to load", err);
    compilerFailed.value = true;
    output.value = "// compiler bundle unavailable — run `pnpm build:site`";
    status.value = "Playground unavailable.";
    statusOk.value = false;
    return;
  }
  const shared = fromHash();
  if (shared) source.value = shared;
  run();
  // Upgrade the estimated meters to exact GPT counts once the tokenizer loads.
  try {
    const mod = await import(/* @vite-ignore */ withBase("/toad-tokenizer.js"));
    exactCount = mod.countTokens;
    run();
  } catch (err) {
    console.error("TOAD: tokenizer bundle failed to load", err);
  }
});
</script>

<template>
  <div class="pg-wrap">
    <div class="pg-toolbar">
      <label class="ctl">
        <span class="ctl-label">Example</span>
        <select v-model="presetKey" class="select" :disabled="compilerFailed">
          <option value="researcher">researcher</option>
          <option value="summarizer">summarizer</option>
          <option value="digest">digest · {#each}</option>
          <option value="report">report · {#if}</option>
          <option value="brief">brief · kitchen sink</option>
        </select>
      </label>
      <label class="ctl">
        <span class="ctl-label">Compare to</span>
        <select v-model="baseline" class="select" :disabled="compilerFailed">
          <option value="ts">Compiled TypeScript</option>
          <option value="json">Equivalent JSON</option>
        </select>
      </label>
      <span class="pg-spacer" />
      <button type="button" class="btn-ghost" @click="copyOutput">
        {{ copyLabel }}
      </button>
      <button type="button" class="btn-ghost" @click="share">
        {{ shareLabel }}
      </button>
    </div>

    <div class="pg">
      <div class="pane">
        <div class="pane-head">
          <span class="pane-title">input.agent</span>
          <span
            class="meter"
            title="GPT token count (gpt-tokenizer) — estimated until the tokenizer loads"
          >
            <b>{{ inTok }}</b> tokens <span class="meter-sep">·</span>
            <b>{{ inChr }}</b> chars
          </span>
        </div>
        <textarea
          v-model="source"
          spellcheck="false"
          autocapitalize="off"
          :disabled="compilerFailed"
        />
      </div>
      <div class="arrow" aria-hidden="true">→</div>
      <div class="pane">
        <div class="pane-head">
          <span class="pane-title">{{ outTitle }}</span>
          <span
            class="meter"
            title="GPT token count (gpt-tokenizer) — estimated until the tokenizer loads"
          >
            <b>{{ outTok }}</b> tokens <span class="meter-sep">·</span>
            <b>{{ outChr }}</b> chars
          </span>
        </div>
        <pre><code>{{ output }}</code></pre>
      </div>
    </div>

    <p class="pg-status" :class="statusOk ? 'ok' : 'err'">{{ status }}</p>
    <p class="pg-savings">{{ savings }}</p>
  </div>
</template>

<style scoped>
.pg-wrap {
  margin-top: 16px;
}
.pg-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.ctl {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.select {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  font-family: var(--vp-font-family-mono);
}
.pg-spacer {
  flex: 1;
}
.btn-ghost {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--vp-c-text-1);
  background: transparent;
  transition: border-color 0.2s, color 0.2s;
}
.btn-ghost:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
.pg {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 10px;
  align-items: stretch;
}
.arrow {
  align-self: center;
  color: var(--vp-c-brand-1);
  font-size: 20px;
}
.pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  overflow: hidden;
}
.pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vp-c-divider);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.meter b {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}
.meter-sep {
  opacity: 0.5;
  margin: 0 2px;
}
textarea,
.pane pre {
  margin: 0;
  padding: 12px;
  min-height: 440px;
  height: 440px;
  overflow: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.55;
  background: transparent;
  color: var(--vp-c-text-1);
  border: 0;
  resize: vertical;
  width: 100%;
}
textarea:focus {
  outline: none;
}
.pane pre code {
  display: block;
  white-space: pre;
  font-family: inherit;
  font-size: inherit;
  background: transparent;
  padding: 0;
}
.pg-status {
  margin: 10px 0 0;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
}
.pg-status.ok {
  color: var(--vp-c-brand-1);
}
.pg-status.err {
  color: var(--vp-c-danger-1);
}
.pg-savings {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
@media (max-width: 760px) {
  .pg {
    grid-template-columns: 1fr;
  }
  .arrow {
    transform: rotate(90deg);
    justify-self: center;
  }
  textarea,
  .pane pre {
    min-height: 300px;
    height: 300px;
  }
}
</style>
