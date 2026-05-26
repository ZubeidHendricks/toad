import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { generate } from "./codegen.js";
import { parsePromptTemplate } from "./interpolate.js";

function agent(promptBody: string[], rows: string[]): string {
  return [
    "agent: a",
    "model: m",
    `inputs[${rows.length}]{name,type}:`,
    ...rows.map((r) => `  ${r}`),
    "prompt: |",
    ...promptBody.map((l) => `  ${l}`),
  ].join("\n");
}

describe("{#each} index + {:else}", () => {
  it("parses an index variable", () => {
    const { segments } = parsePromptTemplate(
      "{#each inputs.xs as x, i}\n{i}. {x}\n{/each}",
    );
    expect(segments[0]).toMatchObject({
      kind: "each",
      item: { kind: "name", name: "x" },
      index: "i",
    });
  });

  it("compiles the index to .map((it, i) =>", () => {
    const src = agent(
      ["{#each inputs.items as it, i}", "{i}. {it}", "{/each}"],
      ["items,string[]"],
    );
    const { ast, diagnostics } = analyze(src, "a.agent");
    expect(diagnostics).toEqual([]);
    expect(generate(ast!)).toContain("inputs.items.map((it, i) => `");
  });

  it("compiles an each-{:else} to a length guard", () => {
    const src = agent(
      ["{#each inputs.items as it}", "- {it}", "{:else}", "(none)", "{/each}"],
      ["items,string[]"],
    );
    const { ast, diagnostics } = analyze(src, "a.agent");
    expect(diagnostics).toEqual([]);
    const code = generate(ast!);
    expect(code).toContain("inputs.items.length > 0 ?");
    expect(code).toContain("(none)");
  });
});

describe("{#if} {:else if} chains", () => {
  it("parses else-if into nested ifs", () => {
    const { segments, errors } = parsePromptTemplate(
      "{#if inputs.a}\nA\n{:else if inputs.b}\nB\n{:else}\nC\n{/if}",
    );
    expect(errors).toEqual([]);
    expect(segments[0]).toMatchObject({
      kind: "if",
      cond: ["inputs", "a"],
      then: [{ kind: "text", value: "A\n" }],
      else: [
        {
          kind: "if",
          cond: ["inputs", "b"],
          then: [{ kind: "text", value: "B\n" }],
          else: [{ kind: "text", value: "C\n" }],
        },
      ],
    });
  });

  it("compiles else-if to nested ternaries", () => {
    const src = agent(
      [
        "{#if inputs.a}",
        "alpha",
        "{:else if inputs.b}",
        "beta",
        "{:else}",
        "gamma",
        "{/if}",
      ],
      ["a,boolean", "b,boolean"],
    );
    const { ast, diagnostics } = analyze(src, "a.agent");
    expect(diagnostics).toEqual([]);
    const code = generate(ast!);
    expect(code).toContain("inputs.a ?");
    expect(code).toContain("inputs.b ?");
    expect(code).toContain("gamma");
  });
});
