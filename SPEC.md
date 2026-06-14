# The `.agent` File Format Specification

**Version 0.3 · Status: Draft · June 2026**

This document specifies the `.agent` file format used by TOAD (Token-Oriented Agentic Development): a compact, token-oriented, declarative description of an LLM agent, designed to be authored by humans and language models and compiled to typed code.

The format is a **strict superset of [TOON](https://github.com/toon-format/toon)** (Token-Oriented Object Notation): every `.agent` document lowers deterministically to a valid TOON document, and structural parsing is defined by the TOON specification. This document specifies only the superset (the `prompt`/`system` block form), the schema of agent documents, the prompt template language, and validation rules.

The key words MUST, MUST NOT, SHOULD, and MAY are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 1. Encoding and layout

- A `.agent` file MUST be UTF-8 text.
- Indentation MUST be 2 spaces per level. Tabs MUST NOT be used for indentation.
- The file extension SHOULD be `.agent`.

## 2. Lowering to TOON

A `.agent` document is processed in two phases:

1. **Lower** — the block-scalar forms `prompt: |` and `system: |` (§4.6, §4.8) are rewritten into TOON string values, preserving line content and stripping the common 2-space indent. All other lines pass through unchanged.
2. **Decode** — the lowered text MUST be a valid TOON document, decoded per the TOON specification into a single top-level object.

Conforming implementations MUST NOT implement a bespoke structural parser for the non-superset portion; behaviour is defined by TOON.

## 3. Document schema

The decoded document MUST be an object. Its keys are:

| Key           | Required | Value                                  |
| ------------- | -------- | -------------------------------------- |
| `agent`       | yes      | identifier (§3.1)                      |
| `model`       | yes      | non-empty string (a model id)          |
| `description` | no       | string                                 |
| `inputs`      | no       | tabular array of `{name, type}` (§4.4) |
| `tools`       | no       | list of identifiers (§4.5)             |
| `prompt`      | yes      | string (§4.6)                          |
| `outputs`     | no       | tabular array of `{name, type}` (§4.7) |
| `system`      | no       | string (§4.8)                          |
| `uses`        | no       | list of identifiers (§4.9)             |
| `maxTurns`    | no       | positive integer                       |
| `retries`     | no       | non-negative integer                   |
| `temperature` | no       | number in [0, 1] (§4.10)               |

Unknown keys MUST produce an error diagnostic.

### 3.1 Identifiers

An identifier matches `[A-Za-z_][A-Za-z0-9_]*`.

## 4. Keys

### 4.1 `agent`

The agent's name. Conventionally also the exported symbol and output filename.

### 4.2 `model`

The model identifier passed to the runtime (e.g. `claude-opus-4-7`). Implementations MUST NOT validate the value against a model list at compile time.

### 4.3 `description`

One-line description. Runtimes SHOULD use it as the default system prompt and as the default tool description when the agent is exposed as a tool.

### 4.4 `inputs`

A TOON tabular array header `inputs[N]{name,type}:` followed by exactly `N` rows of `name,type`. Per TOON, a declared length that does not match the row count is an error. Each `name` MUST be a unique identifier; each `type` MUST conform to the type grammar (§5).

A trailing `?` on a name (`detail?,string`) marks the field **optional**: callers MAY omit it, and conforming compilers MUST type it as optional. Template behaviour for omitted optionals is defined in §6.

### 4.5 `tools`

Tools take one of two forms:

- **Bare names** — a TOON list `tools[N]: a,b,…` of exactly `N` unique identifiers. Each name binds to a complete tool implementation supplied at runtime (in TOAD, a co-located `<agent>.tools.ts`), which carries its own input schema.
- **Typed** — a TOON tabular array `tools[N]{name,input}:` (optionally `tools[N]{name,input,description}:`) of exactly `N` rows. Each `name` MUST be a unique identifier; `input` MUST be an **object type** (§5) describing the tool's arguments; `description`, when present, is the human-readable description offered to the model. In the typed form the document is the single source of truth for the tool's input schema: conforming compilers MUST emit that schema and a typed binding such that the runtime implementation supplies only the tool body, type-checked against the declared input.

A document MAY use either form; the two MUST NOT be mixed within one `tools` value (a TOON list is all names; a tabular array is all rows). Tool names MUST be unique across the `tools` value.

### 4.6 `prompt`

The instruction prompt. In the superset form, `prompt: |` introduces an indented block; the block's lines, dedented by 2 spaces and joined with `\n`, form the string value. The string is interpreted as a template (§6).

### 4.7 `outputs`

Same form as `inputs`, including the optional marker (`caveats?,string[]`). When present, the agent's result MUST be an object with these typed fields — optional fields MAY be omitted — and conforming runtimes MUST validate it.

### 4.8 `system`

Optional system prompt, same block form as `prompt`, also a template (§6). Defaults to `description` when absent.

### 4.9 `uses`

A list of sub-agent identifiers. Compilers MUST wire each named agent in as a tool whose input schema is the sub-agent's declared `inputs`.

### 4.10 `temperature`

Sampling temperature, a number in `[0, 1]`. When absent, the model provider's default applies. Values outside the range MUST produce an error diagnostic.

## 5. Types

```
type      = base [ "[]" ]
base      = "string" | "number" | "boolean" | enumType | objectType
enumType  = enumValue ( "|" enumValue )+
enumValue = [A-Za-z0-9_-]+
objectType = '"' "{" field ( ";" field )* "}" [ "[]" ] '"'
field     = identifier ":" type
```

Examples: `string`, `number`, `boolean`, `string[]`, `draft|final`, `"{title:string;url:string}"`, `"{title:string;status:open|closed}[]"`.

An enum type lists two or more distinct literal string values; the field's value MUST be one of them, and conforming compilers MUST emit the literal set into the generated schema (it reaches the model via the tool's JSON schema). Object types MUST be quoted (they contain TOON-significant characters). A trailing `[]` denotes an array of the preceding type.

## 6. The template language

`prompt` and `system` strings are templates over the declared `inputs` and the environment.

### 6.1 Interpolation

- `{inputs.<name>}` — inserts the named input. `<name>` MUST be a declared input. Field access on object types is permitted: `{inputs.user.name}`; each segment MUST exist in the declared type.
- `{env.<NAME>}` — inserts the environment variable `<NAME>` (empty string when unset).
- `{{` and `}}` — literal `{` and `}`.
- Within a loop body, `{<binding>}` and `{<binding>.<field>}` reference the loop binding (§6.2).
- Any other `{...}` sequence is an error diagnostic.

Non-scalar interpolated values (objects, arrays) MUST be rendered as TOON, not as a host-language default string conversion.

**Omitted optionals.** When an optional input (§4.4) is omitted: an interpolation of it (or a field path through it) renders as the empty string; an `{#each}` over it iterates as the empty array (so a `{:else}` branch renders); an `{#if}` on an optional boolean treats it as false.

### 6.2 Loops

```
{#each inputs.<name> as <item>}        … {/each}
{#each inputs.<name> as <item>, <i>}   … {/each}
{#each inputs.<name> as {a, b}}        … {/each}
{#each …} … {:else} … {/each}
```

- The iterated expression MUST be a declared array input.
- `<i>` binds the 0-based index.
- The destructuring form is permitted only over object-typed arrays, and each destructured name MUST be a field of the element type.
- The `{:else}` body renders when the array is empty.

### 6.3 Conditionals

```
{#if inputs.<flag>} … {:else if inputs.<other>} … {:else} … {/if}
```

- Conditions MUST be boolean inputs; a single leading `!` negates.
- Blocks MUST be properly nested with loops and other conditionals.

## 7. Validation and diagnostics

Conforming compilers MUST report, with source location (`file:line:col`):

- missing required keys; unknown keys; malformed values
- TOON structural errors (including `[N]` count mismatches)
- duplicate input/output/tool names
- type-grammar violations; a typed tool (§4.5) whose `input` is not an object type
- template errors: undeclared references, bad field access, unclosed or mismatched blocks, destructuring over non-object element types, non-boolean `#if` conditions, non-array `#each` subjects

A document with no error diagnostics is a **valid agent document**.

## 8. Conformance

- A **conforming compiler** accepts every valid agent document, rejects invalid ones with located diagnostics, and emits code whose behaviour matches §4–§6. The reference implementation is [`toad-compiler`](https://www.npmjs.com/package/toad-compiler) (`toac`).
- A **conforming runtime** executes the tool-use loop, validates declared `outputs`, exposes agents as tools (§4.9), and renders non-scalar values as TOON (§6.1). The reference implementation is [`toad-runtime`](https://www.npmjs.com/package/toad-runtime).

## 9. Versioning

This specification is versioned independently of the implementations. Backwards-incompatible changes bump the major version; additions bump the minor version. The version of this document is **0.3** (0.3 added the typed tabular `tools` form, §4.5).

## Appendix A — Complete example

```
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

## License

This specification is released under the MIT License.
