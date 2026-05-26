import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { generate } from "./codegen.js";

function agent(promptBody: string[]): string {
  return [
    "agent: a",
    "model: m",
    "prompt: |",
    ...promptBody.map((l) => `  ${l}`),
  ].join("\n");
}

describe("{env.X} interpolation", () => {
  it("compiles {env.VAR} to process.env.VAR with a default", () => {
    const { ast, diagnostics } = analyze(
      agent(["Base: {env.API_BASE}"]),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(generate(ast!)).toContain('process.env.API_BASE ?? ""');
  });

  it("does not require env vars to be declared", () => {
    const { diagnostics } = analyze(agent(["{env.ANYTHING}"]), "a.agent");
    expect(diagnostics).toEqual([]);
  });

  it("rejects a bare {env} (TOA301)", () => {
    const { diagnostics } = analyze(agent(["{env}"]), "a.agent");
    expect(diagnostics.map((d) => d.code)).toContain("TOA301");
  });
});
