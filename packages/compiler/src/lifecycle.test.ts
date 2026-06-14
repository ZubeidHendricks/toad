import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { generate } from "./codegen.js";

function agent(extra: string[]): string {
  return ["agent: a", "model: m", ...extra, "prompt: |", "  hi"].join("\n");
}

describe("lifecycle knobs (maxTurns / retries)", () => {
  it("emits maxTurns and retries into createAgent", () => {
    const { ast, diagnostics } = analyze(
      agent(["maxTurns: 3", "retries: 2"]),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    const code = generate(ast!);
    expect(code).toContain("maxTurns: 3,");
    expect(code).toContain("retries: 2,");
  });

  it("omits them when not declared", () => {
    const { ast } = analyze(agent([]), "a.agent");
    const code = generate(ast!);
    expect(code).not.toContain("maxTurns:");
    expect(code).not.toContain("retries:");
    expect(code).not.toContain("maxContextTokens:");
  });

  it("emits maxContextTokens into createAgent", () => {
    const { ast, diagnostics } = analyze(
      agent(["maxContextTokens: 8000"]),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(generate(ast!)).toContain("maxContextTokens: 8000,");
  });

  it("rejects a negative retries (TOA206)", () => {
    const { diagnostics } = analyze(agent(["retries: -1"]), "a.agent");
    expect(diagnostics.map((d) => d.code)).toContain("TOA206");
  });
});
