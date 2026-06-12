# Prompt Templates

Inside `prompt:` (and `system:`) you get a small, **type-checked** template language. Every reference is validated against the agent's typed inputs, with located `file:line:col` diagnostics.

## At a glance

| Construct      | Example                                                       |
| -------------- | ------------------------------------------------------------- |
| Interpolation  | `{inputs.topic}`                                              |
| Environment    | `{env.API_BASE}`                                              |
| Object fields  | `{inputs.user.name}`                                          |
| Loops          | `{#each inputs.items as x, i}{i}. {x}{/each}`                 |
| Empty fallback | `{#each xs as x}…{:else}none{/each}`                          |
| Destructuring  | `{#each rows as {title, score}}…{/each}`                      |
| Conditionals   | `{#if inputs.verbose}…{:else if inputs.brief}…{:else}…{/if}`  |
| Literal braces | <code v-pre>{{</code> and <code v-pre>}}</code>               |

## Interpolation

`{inputs.<name>}` inserts a declared input and `{env.<NAME>}` inserts an environment variable (`process.env.<NAME>`, empty string if unset). <code v-pre>{{</code> and <code v-pre>}}</code> are literal braces.

::: tip Objects render as TOON
When an interpolated value is an object or array, the compiler emits `toonValue(...)` so it renders as compact TOON in the prompt — not `[object Object]`. Scalars stay byte-identical to plain `${...}`.
:::

## Loops

Iterate an array input with `{#each inputs.<name> as <item>}` … `{/each}`. Add a 0-based index with `{#each … as <item>, <i>}`, an empty-list fallback with `{:else}`, and destructure object elements with `{#each rows as {a, b}}`.

```agent
prompt: |
  Summarize these notes:
  {#each inputs.notes as note, i}
  {i}. {note}
  {:else}
  No notes provided.
  {/each}
```

Loops compile to `.map().join("")` in the emitted TypeScript.

## Conditionals

Include a section based on a boolean input with `{#if inputs.<flag>}` … `{:else if inputs.<other>}` … `{:else}` … `{/if}` (a leading `!` negates).

```agent
prompt: |
  {#if inputs.detailed}
  Write a thorough analysis.
  {:else}
  Keep it brief.
  {/if}
```

Conditionals compile to nested ternaries — all validated against the typed inputs.

## Everything together

```agent
agent: brief
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
```

[Open this in the playground →](/playground#a=YWdlbnQ6IGJyaWVmCm1vZGVsOiBjbGF1ZGUtb3B1cy00LTcKZGVzY3JpcHRpb246IFN1bW1hcml6ZSBzb3VyY2VzIGZvciBhbiBhdWRpZW5jZSwgb3B0aW9uYWxseSBpbiBkZXRhaWwuCmlucHV0c1szXXtuYW1lLHR5cGV9OgogIHNvdXJjZXMsInt0aXRsZTpzdHJpbmc7dXJsOnN0cmluZ31bXSIKICBkZXRhaWxlZCxib29sZWFuCiAgYXVkaWVuY2Usc3RyaW5nCnByb21wdDogfAogIFdyaXRlIGEgYnJpZWYgZm9yIHtpbnB1dHMuYXVkaWVuY2V9LgogIHsjZWFjaCBpbnB1dHMuc291cmNlcyBhcyB7dGl0bGUsIHVybH0sIGl9CiAge2l9LiB7dGl0bGV9IOKAlCB7dXJsfQogIHs6ZWxzZX0KICBObyBzb3VyY2VzIHByb3ZpZGVkLgogIHsvZWFjaH0KICB7I2lmIGlucHV0cy5kZXRhaWxlZH0KICBJbmNsdWRlIGEgdGhvcm91Z2ggYW5hbHlzaXMgc2VjdGlvbi4KICB7OmVsc2V9CiAgS2VlcCBpdCB0byBhIHNpbmdsZSBwYXJhZ3JhcGguCiAgey9pZn0Kb3V0cHV0c1sxXXtuYW1lLHR5cGV9OgogIGJyaWVmLHN0cmluZw)
