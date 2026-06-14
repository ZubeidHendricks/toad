import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { estimateAgentCost, estimateTokens } from "./cost.js";

function costOf(lines: string[]) {
  const { ast, diagnostics } = analyze(lines.join("\n"), "x.agent");
  expect(diagnostics).toEqual([]);
  return estimateAgentCost(ast!);
}

describe("estimateAgentCost", () => {
  it("sizes system, prompt, and output schema; fixedTotal is their sum (no tools)", () => {
    const r = costOf([
      "agent: a",
      "model: m",
      "description: Summarize text into bullet points.",
      "inputs[1]{name,type}:",
      "  text,string",
      "prompt: |",
      "  Summarize {inputs.text} into bullets.",
      "outputs[1]{name,type}:",
      "  bullets,string[]",
    ]);
    expect(r.system).toBeGreaterThan(0);
    expect(r.prompt).toBeGreaterThan(0);
    expect(r.outputSchema).toBeGreaterThan(0);
    expect(r.typedTools).toBe(0);
    expect(r.fixedTotal).toBe(r.system + r.typedTools + r.outputSchema);
  });

  it("reports zero output schema when no outputs are declared", () => {
    const r = costOf(["agent: a", "model: m", "prompt: |", "  hi"]);
    expect(r.outputSchema).toBe(0);
  });

  it("sizes typed-tool schemas and counts them", () => {
    const r = costOf([
      "agent: a",
      "model: m",
      "tools[2]{name,input}:",
      '  geo,"{city:string}"',
      '  fc,"{lat:number;lon:number}"',
      "prompt: |",
      "  hi",
    ]);
    expect(r.typedToolCount).toBe(2);
    expect(r.typedTools).toBeGreaterThan(0);
    expect(r.bareTools).toEqual([]);
    expect(r.fixedTotal).toBe(r.system + r.typedTools + r.outputSchema);
  });

  it("lists bare tools (schema not visible) without sizing them", () => {
    const r = costOf([
      "agent: a",
      "model: m",
      "tools[2]: web_search,fetch_page",
      "prompt: |",
      "  hi",
    ]);
    expect(r.bareTools).toEqual(["web_search", "fetch_page"]);
    expect(r.typedTools).toBe(0);
  });

  it("excludes interpolated values from the prompt estimate", () => {
    const withInterp = costOf([
      "agent: a",
      "model: m",
      "inputs[1]{name,type}:",
      "  text,string",
      "prompt: |",
      "  Summarize: {inputs.text}",
    ]);
    const plain = costOf([
      "agent: a",
      "model: m",
      "prompt: |",
      "  Summarize: ",
    ]);
    // The interpolation contributes nothing, so the two prompt estimates match.
    expect(withInterp.prompt).toBe(plain.prompt);
  });
});

describe("estimateTokens", () => {
  it("is zero for empty and grows with text", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("hello world")).toBeGreaterThan(0);
    expect(
      estimateTokens("a much longer sentence with several words"),
    ).toBeGreaterThan(estimateTokens("short"));
  });
});
