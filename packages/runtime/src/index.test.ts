import { describe, expect, it } from "vitest";
import * as runtime from "./index.js";

describe("toad-runtime exports", () => {
  it("exposes the public API", () => {
    expect(runtime.RUNTIME_VERSION).toBe("0.2.0");
    expect(typeof runtime.createAgent).toBe("function");
    expect(typeof runtime.defineTool).toBe("function");
    expect(typeof runtime.anthropicClient).toBe("function");
  });
});
