import { describe, expect, it } from "vitest";
import { compile, COMPILER_VERSION } from "./index.js";

describe("toad-compiler", () => {
  it("exposes a version", () => {
    expect(COMPILER_VERSION).toBe("0.4.0");
  });

  it("returns diagnostics (and no code) for an invalid agent", () => {
    const result = compile("agent: demo");
    expect(result.code).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("emits code for a valid agent", () => {
    const result = compile("agent: demo\nmodel: m\nprompt: hi");
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain("createAgent({");
    expect(result.code).toContain("export default demo;");
  });
});
