import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { generate } from "./codegen.js";

function agent(extra: string[]): string {
  return ["agent: a", "model: m", ...extra, "prompt: |", "  hi"].join("\n");
}

describe("temperature", () => {
  it("emits temperature into createAgent", () => {
    const { ast, diagnostics } = analyze(
      agent(["temperature: 0.2"]),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(ast!.temperature).toBe(0.2);
    expect(generate(ast!)).toContain("temperature: 0.2,");
  });

  it("omits it when not declared", () => {
    const { ast } = analyze(agent([]), "a.agent");
    expect(generate(ast!)).not.toContain("temperature:");
  });

  it("accepts the boundaries 0 and 1", () => {
    expect(analyze(agent(["temperature: 0"]), "a.agent").diagnostics).toEqual(
      [],
    );
    expect(analyze(agent(["temperature: 1"]), "a.agent").diagnostics).toEqual(
      [],
    );
  });

  it("rejects an out-of-range temperature (TOA207)", () => {
    const { diagnostics } = analyze(agent(["temperature: 1.5"]), "a.agent");
    expect(diagnostics.map((d) => d.code)).toContain("TOA207");
  });

  it("rejects a non-numeric temperature (TOA207)", () => {
    const { diagnostics } = analyze(agent(["temperature: warm"]), "a.agent");
    expect(diagnostics.map((d) => d.code)).toContain("TOA207");
  });
});
