import { describe, expect, it } from "vitest";
import { parsePromptTemplate } from "./interpolate.js";

describe("parsePromptTemplate", () => {
  it("splits text and interpolations", () => {
    expect(parsePromptTemplate("Research: {inputs.topic} now")).toEqual({
      segments: [
        { kind: "text", value: "Research: " },
        { kind: "interp", path: ["inputs", "topic"] },
        { kind: "text", value: " now" },
      ],
      errors: [],
    });
  });

  it("treats {{ and }} as literal braces", () => {
    expect(parsePromptTemplate("use {{braces}} please")).toEqual({
      segments: [{ kind: "text", value: "use {braces} please" }],
      errors: [],
    });
  });

  it("trims whitespace inside an interpolation", () => {
    expect(parsePromptTemplate("{ inputs.topic }").segments).toEqual([
      { kind: "interp", path: ["inputs", "topic"] },
    ]);
  });

  it("reports an unterminated interpolation", () => {
    const { errors } = parsePromptTemplate("hello {inputs.topic");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/unterminated/);
  });

  it("reports an empty/invalid interpolation", () => {
    expect(parsePromptTemplate("{}").errors).toHaveLength(1);
    expect(parsePromptTemplate("{1bad}").errors).toHaveLength(1);
  });
});
