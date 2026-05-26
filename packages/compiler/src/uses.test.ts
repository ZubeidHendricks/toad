import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { generate } from "./codegen.js";

describe("declarative sub-agents (uses)", () => {
  it("imports the sub-agent and wires it via asTool()", () => {
    const src = [
      "agent: planner",
      "model: claude-opus-4-7",
      "uses[1]: researcher",
      "prompt: |",
      "  Use the researcher tool to gather sources, then outline.",
    ].join("\n");
    const { ast, diagnostics } = analyze(src, "planner.agent");
    expect(diagnostics).toEqual([]);
    expect(ast?.uses).toEqual(["researcher"]);
    const code = generate(ast!);
    expect(code).toContain('import { researcher } from "./researcher";');
    expect(code).toContain("tools: { researcher: researcher.asTool() }");
  });

  it("rejects a non-identifier uses entry (TOA231)", () => {
    const src = [
      "agent: p",
      "model: m",
      'uses[1]: "not an ident"',
      "prompt: |",
      "  hi",
    ].join("\n");
    const { diagnostics } = analyze(src, "p.agent");
    expect(diagnostics.map((d) => d.code)).toContain("TOA231");
  });
});
