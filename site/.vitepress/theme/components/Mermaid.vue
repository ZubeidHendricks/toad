<script setup lang="ts">
// Client-side Mermaid renderer with TOAD theming that tracks light/dark mode.
// Diagrams are keyed by name so markdown pages stay clean: <Mermaid name="pipeline" />
import { onMounted, ref, watch } from "vue";
import { useData } from "vitepress";

const DIAGRAMS: Record<string, string> = {
  pipeline: `flowchart TD
  A["your.agent"]:::file --> S1["1 · lower<br/>prompt: | blocks become valid TOON"]
  S1 --> S2["2 · decode<br/>parsed by the real @toon-format/toon decoder"]
  S2 --> S3["3 · validate<br/>keys, types, tools, inputs.x refs → a typed agent model"]
  S3 --> S4["4 · emit"]
  S4 --> B["your.ts<br/>readable, typed TypeScript on toad-runtime, over Claude"]:::file
  classDef file fill:#0c1411,stroke:#4ade80,color:#b8f3cf,stroke-width:1.5px;`,
  "tool-loop": `flowchart TD
  I["inputs (typed)"]:::file --> M["call Claude<br/>system + prompt"]
  M --> Q{"wants a tool?"}
  Q -->|yes| T["run the tool<br/>your .tools.ts"]
  T --> M
  Q -->|no| O["validate against outputs<br/>→ typed result"]:::file
  classDef file fill:#0c1411,stroke:#4ade80,color:#b8f3cf,stroke-width:1.5px;`,
  composition: `flowchart TD
  P["planner agent"]:::file -->|"uses: researcher"| R["researcher.asTool()<br/>typed inputSchema"]
  R --> L["researcher runs its<br/>own tool-use loop"]
  L --> O["typed result<br/>returned to planner"]
  O --> P
  classDef file fill:#0c1411,stroke:#4ade80,color:#b8f3cf,stroke-width:1.5px;`,
};

const props = defineProps<{ name: string }>();
const el = ref<HTMLElement | null>(null);
const { isDark } = useData();
let seq = 0;

async function render() {
  const code = DIAGRAMS[props.name];
  if (!el.value || !code) return;
  try {
    const { default: mermaid } = await import(
      /* @vite-ignore */ "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs"
    );
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "base",
      themeVariables: isDark.value
        ? {
            background: "#0f1714",
            primaryColor: "#0f1714",
            secondaryColor: "#0c1411",
            tertiaryColor: "#0c1411",
            primaryBorderColor: "#2c4a3b",
            primaryTextColor: "#dce5e0",
            lineColor: "#4ade80",
            fontFamily:
              "ui-monospace, SF Mono, JetBrains Mono, Menlo, Consolas, monospace",
            fontSize: "14px",
          }
        : {
            background: "#ffffff",
            primaryColor: "#f0fdf4",
            secondaryColor: "#f8fafc",
            tertiaryColor: "#f8fafc",
            primaryBorderColor: "#86efac",
            primaryTextColor: "#1f2937",
            lineColor: "#16a34a",
            fontFamily:
              "ui-monospace, SF Mono, JetBrains Mono, Menlo, Consolas, monospace",
            fontSize: "14px",
          },
    });
    const { svg } = await mermaid.render(
      `toad-mmd-${props.name}-${seq++}`,
      code,
    );
    el.value.innerHTML = svg;
  } catch (err) {
    console.error("mermaid render failed", err);
  }
}

onMounted(render);
watch(isDark, render);
</script>

<template>
  <div ref="el" class="toad-mermaid" />
</template>

<style scoped>
.toad-mermaid {
  margin: 16px 0;
  display: flex;
  justify-content: center;
}
.toad-mermaid :deep(svg) {
  max-width: 100%;
  height: auto;
}
</style>
