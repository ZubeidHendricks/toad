# Write Agents with AI

TOAD's syntax is small and explicit on purpose — so an LLM can author it. The `[N]` length markers and `{field}` headers hand a model the structure up front, which is exactly what makes generated agents validate on the first try.

Copy the prompt below into Claude, describe your agent at the end, and paste the result into the [playground](/playground) to check it compiles.

````text
You write TOAD agent files. TOAD is a compile-first framework: an agent is a
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
  temperature: <number>    optional. sampling temperature, 0 to 1

TYPES: string | number | boolean, or a quoted object type "{a:string;b:number}".
Append [] for an array (string[], "{...}[]"). Read object fields with x.field.
A trailing ? on a field name (detail?,string) makes it optional — omitted
optionals interpolate as empty, iterate as an empty list, and test false in #if.

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
<describe your agent here>
````

The full reference also lives in [`docs/authoring.md`](https://github.com/ZubeidHendricks/toad/blob/main/docs/authoring.md) in the repo.
