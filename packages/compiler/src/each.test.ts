import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { generate } from "./codegen.js";
import { parsePromptTemplate } from "./interpolate.js";

describe("{#each} parsing", () => {
  it("parses an each block into a nested segment", () => {
    const { segments, errors } = parsePromptTemplate(
      "Sources:\n{#each inputs.sources as s}\n- {s}\n{/each}\nDone.",
    );
    expect(errors).toEqual([]);
    expect(segments).toEqual([
      { kind: "text", value: "Sources:\n" },
      {
        kind: "each",
        source: ["inputs", "sources"],
        item: { kind: "name", name: "s" },
        body: [
          { kind: "text", value: "- " },
          { kind: "interp", path: ["s"] },
          { kind: "text", value: "\n" },
        ],
      },
      { kind: "text", value: "Done." },
    ]);
  });

  it("reports an unclosed each", () => {
    const { errors } = parsePromptTemplate("{#each inputs.xs as x}\n- {x}");
    expect(errors.some((e) => /unclosed/.test(e.message))).toBe(true);
  });

  it("reports an invalid each header", () => {
    const { errors } = parsePromptTemplate("{#each nope}\n{/each}");
    expect(errors.some((e) => /invalid \{#each\}/.test(e.message))).toBe(true);
  });
});

function digest(promptBody: string[]): string {
  return [
    "agent: digest",
    "model: m",
    "inputs[1]{name,type}:",
    "  sources,string[]",
    "prompt: |",
    ...promptBody.map((l) => `  ${l}`),
  ].join("\n");
}

describe("{#each} validation + codegen", () => {
  it("compiles an each over an array input to .map().join()", () => {
    const src = digest([
      "Sources:",
      "{#each inputs.sources as s}",
      "- {s}",
      "{/each}",
    ]);
    const { ast, diagnostics } = analyze(src, "digest.agent");
    expect(diagnostics).toEqual([]);
    const code = generate(ast!);
    expect(code).toContain("inputs.sources.map((s) => `");
    expect(code).toContain('.join("")');
  });

  it("rejects {#each} over a non-array input (TOA303)", () => {
    const src = [
      "agent: d",
      "model: m",
      "inputs[1]{name,type}:",
      "  topic,string",
      "prompt: |",
      "  {#each inputs.topic as t}",
      "  - {t}",
      "  {/each}",
    ].join("\n");
    const { diagnostics } = analyze(src, "d.agent");
    expect(diagnostics.map((d) => d.code)).toContain("TOA303");
  });

  it("rejects a loop variable used outside its block (TOA301)", () => {
    const src = digest([
      "{#each inputs.sources as s}",
      "- {s}",
      "{/each}",
      "tail {s}",
    ]);
    const { diagnostics } = analyze(src, "digest.agent");
    expect(diagnostics.map((d) => d.code)).toContain("TOA301");
  });
});
