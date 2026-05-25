import { describe, expect, it } from "vitest";
import { compile, COMPILER_VERSION } from "./index.js";

describe("@toa/compiler scaffold", () => {
  it("exposes a version", () => {
    expect(COMPILER_VERSION).toBe("0.0.0");
  });

  it("compile() returns a not-implemented diagnostic for now", () => {
    const result = compile("agent: demo");
    expect(result.code).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("TOA000");
  });
});
