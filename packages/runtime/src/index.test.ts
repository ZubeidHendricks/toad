import { describe, expect, it } from "vitest";
import { notImplemented, RUNTIME_VERSION } from "./index.js";

describe("@toa/runtime scaffold", () => {
  it("exposes a version", () => {
    expect(RUNTIME_VERSION).toBe("0.0.0");
  });

  it("notImplemented throws naming the feature", () => {
    expect(() => notImplemented("createAgent")).toThrowError(/createAgent/);
  });
});
