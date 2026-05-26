import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { generate } from "./codegen.js";

describe("system prompt", () => {
  it("emits a system function with interpolation", () => {
    const src = [
      "agent: a",
      "model: m",
      "inputs[1]{name,type}:",
      "  role,string",
      "system: |",
      "  You are a {inputs.role}.",
      "prompt: |",
      "  Help the user.",
    ].join("\n");
    const { ast, diagnostics } = analyze(src, "a.agent");
    expect(diagnostics).toEqual([]);
    const code = generate(ast!);
    expect(code).toContain("system: (inputs: AInput) =>");
    expect(code).toContain("You are a ${inputs.role}.");
  });

  it("validates system interpolations (TOA301)", () => {
    const src = [
      "agent: a",
      "model: m",
      "system: |",
      "  You are {inputs.missing}.",
      "prompt: |",
      "  hi",
    ].join("\n");
    const { diagnostics } = analyze(src, "a.agent");
    expect(diagnostics.map((d) => d.code)).toContain("TOA301");
  });
});
