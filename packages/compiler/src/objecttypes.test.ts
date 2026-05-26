import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { generate } from "./codegen.js";

describe("object types", () => {
  it("compiles an object[] input with field access in {#each}", () => {
    const src = [
      "agent: report",
      "model: m",
      "inputs[1]{name,type}:",
      '  rows,"{title:string;score:number}[]"',
      "prompt: |",
      "  {#each inputs.rows as r}",
      "  {r.title}: {r.score}",
      "  {/each}",
    ].join("\n");
    const { ast, diagnostics } = analyze(src, "report.agent");
    expect(diagnostics).toEqual([]);
    const code = generate(ast!);
    expect(code).toContain("rows: { title: string; score: number }[];");
    expect(code).toContain(
      "z.array(z.object({ title: z.string(), score: z.number() }))",
    );
    expect(code).toContain("inputs.rows.map((r) => `");
    expect(code).toContain("${r.title}");
  });

  it("supports field access on a scalar object input", () => {
    const src = [
      "agent: greet",
      "model: m",
      "inputs[1]{name,type}:",
      '  user,"{name:string;age:number}"',
      "prompt: |",
      "  Hello {inputs.user.name}",
    ].join("\n");
    const { ast, diagnostics } = analyze(src, "greet.agent");
    expect(diagnostics).toEqual([]);
    expect(generate(ast!)).toContain("${inputs.user.name}");
  });

  it("rejects access to a missing field (TOA301)", () => {
    const src = [
      "agent: a",
      "model: m",
      "inputs[1]{name,type}:",
      '  rows,"{title:string}[]"',
      "prompt: |",
      "  {#each inputs.rows as r}",
      "  {r.nope}",
      "  {/each}",
    ].join("\n");
    const { diagnostics } = analyze(src, "a.agent");
    expect(diagnostics.map((d) => d.code)).toContain("TOA301");
  });

  it("destructures object array elements in {#each}", () => {
    const src = [
      "agent: a",
      "model: m",
      "inputs[1]{name,type}:",
      '  rows,"{title:string;score:number}[]"',
      "prompt: |",
      "  {#each inputs.rows as { title, score }}",
      "  {title}: {score}",
      "  {/each}",
    ].join("\n");
    const { ast, diagnostics } = analyze(src, "a.agent");
    expect(diagnostics).toEqual([]);
    const code = generate(ast!);
    expect(code).toContain("inputs.rows.map(({ title, score }) => `");
    expect(code).toContain("${title}");
  });

  it("rejects destructuring a missing field (TOA306)", () => {
    const src = [
      "agent: a",
      "model: m",
      "inputs[1]{name,type}:",
      '  rows,"{title:string}[]"',
      "prompt: |",
      "  {#each inputs.rows as { title, nope }}",
      "  {title}",
      "  {/each}",
    ].join("\n");
    const { diagnostics } = analyze(src, "a.agent");
    expect(diagnostics.map((d) => d.code)).toContain("TOA306");
  });
});
