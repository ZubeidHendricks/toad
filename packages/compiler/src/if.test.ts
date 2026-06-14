import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { generate } from "./codegen.js";
import { parsePromptTemplate } from "./interpolate.js";

describe("{#if} parsing", () => {
  it("parses if/else into a segment", () => {
    const { segments, errors } = parsePromptTemplate(
      "{#if inputs.verbose}\ndetailed\n{:else}\nbrief\n{/if}",
    );
    expect(errors).toEqual([]);
    expect(segments).toEqual([
      {
        kind: "if",
        cond: ["inputs", "verbose"],
        negate: false,
        then: [{ kind: "text", value: "detailed\n" }],
        else: [{ kind: "text", value: "brief\n" }],
      },
    ]);
  });

  it("parses negation and an absent else", () => {
    const { segments, errors } = parsePromptTemplate(
      "{#if !inputs.x}\nhi\n{/if}",
    );
    expect(errors).toEqual([]);
    expect(segments[0]).toMatchObject({
      kind: "if",
      cond: ["inputs", "x"],
      negate: true,
      else: [],
    });
  });

  it("reports an unclosed if", () => {
    const { errors } = parsePromptTemplate("{#if inputs.x}\nhi");
    expect(errors.some((e) => /unclosed/.test(e.message))).toBe(true);
  });
});

function agent(promptBody: string[], inputRow = "  verbose,boolean"): string {
  return [
    "agent: a",
    "model: m",
    "inputs[1]{name,type}:",
    inputRow,
    "prompt: |",
    ...promptBody.map((l) => `  ${l}`),
  ].join("\n");
}

describe("{#if} validation + codegen", () => {
  it("compiles an if over a boolean input to a ternary", () => {
    const src = agent([
      "{#if inputs.verbose}",
      "be detailed",
      "{:else}",
      "be brief",
      "{/if}",
    ]);
    const { ast, diagnostics } = analyze(src, "a.agent");
    expect(diagnostics).toEqual([]);
    const code = generate(ast!);
    expect(code).toContain("inputs.verbose ?");
    expect(code).toContain("be detailed");
    expect(code).toContain("be brief");
  });

  it("compiles a negated if", () => {
    const src = agent(["{#if !inputs.verbose}", "short", "{/if}"]);
    const { ast, diagnostics } = analyze(src, "a.agent");
    expect(diagnostics).toEqual([]);
    expect(generate(ast!)).toContain("!inputs.verbose ?");
  });

  it("rejects {#if} over a non-boolean input (TOA305)", () => {
    const src = agent(["{#if inputs.topic}", "x", "{/if}"], "  topic,string");
    const { diagnostics } = analyze(src, "a.agent");
    expect(diagnostics.map((d) => d.code)).toContain("TOA305");
  });
});
