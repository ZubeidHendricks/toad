// Preset .agent sources shared by the playground. These mirror the examples
// page and the original site's app.js.

export const AGENT_SRC = `agent: researcher
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

export const PRESETS: Record<string, string> = {
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

// Approximate GPT-style token count, used until the exact tokenizer bundle
// loads. Words ≈ 4 chars/token, numbers denser, symbol runs sparser.
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const pieces =
    text.match(
      /'(?:s|t|re|ve|m|ll|d)|[^\s\p{L}\p{N}]+|\s*\p{L}+|\s*\p{N}+|\s+/gu,
    ) || [];
  let tokens = 0;
  for (const piece of pieces) {
    const t = piece.trim();
    if (!t) {
      tokens += Math.max(1, Math.ceil(piece.length / 6));
    } else if (/\p{L}/u.test(t)) {
      tokens += Math.max(1, Math.round(t.length / 4));
    } else if (/\p{N}/u.test(t)) {
      tokens += Math.max(1, Math.ceil(t.length / 3));
    } else {
      tokens += Math.max(1, Math.ceil(t.length / 2));
    }
  }
  return tokens;
}
