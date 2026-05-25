import { describe, expect, it } from "vitest";
import type { JsonValue } from "@toon-format/toon";
import { validate } from "./validate.js";

const VALID: JsonValue = {
  agent: "researcher",
  model: "claude-opus-4-7",
  description: "desc",
  inputs: [{ name: "topic", type: "string" }],
  tools: ["web_search", "fetch_page"],
  prompt: "Research: {inputs.topic}",
  outputs: [
    { name: "summary", type: "string" },
    { name: "sources", type: "string[]" },
  ],
};

const codes = (value: JsonValue): string[] =>
  validate(value, "x.agent", new Map()).diagnostics.map((d) => d.code);

describe("validate", () => {
  it("lifts a valid object into a typed AgentAst", () => {
    const { ast, diagnostics } = validate(VALID, "x.agent", new Map());
    expect(diagnostics).toEqual([]);
    expect(ast).toEqual({
      name: "researcher",
      model: "claude-opus-4-7",
      description: "desc",
      inputs: [{ name: "topic", type: { base: "string", array: false } }],
      outputs: [
        { name: "summary", type: { base: "string", array: false } },
        { name: "sources", type: { base: "string", array: true } },
      ],
      tools: ["web_search", "fetch_page"],
      prompt: [
        { kind: "text", value: "Research: " },
        { kind: "interp", path: ["inputs", "topic"] },
      ],
    });
  });

  it("requires agent, model, and prompt", () => {
    expect(codes({ agent: "a", model: "m" })).toContain("TOA203");
  });

  it("rejects unknown top-level keys", () => {
    expect(
      codes({ ...(VALID as object), modle: "typo" } as JsonValue),
    ).toContain("TOA202");
  });

  it("rejects a non-identifier agent name", () => {
    expect(
      codes({ ...(VALID as object), agent: "no spaces" } as JsonValue),
    ).toContain("TOA205");
  });

  it("rejects an unsupported field type", () => {
    expect(
      codes({
        ...(VALID as object),
        inputs: [{ name: "x", type: "date" }],
      } as JsonValue),
    ).toContain("TOA212");
  });

  it("rejects an interpolation referencing an undeclared input", () => {
    expect(
      codes({
        ...(VALID as object),
        prompt: "see {inputs.missing}",
      } as JsonValue),
    ).toContain("TOA301");
  });

  it("uses keyLines to locate diagnostics", () => {
    const { diagnostics } = validate(
      { agent: "a", model: "m", prompt: "p", oops: 1 } as JsonValue,
      "x.agent",
      new Map([["oops", 4]]),
    );
    const unknown = diagnostics.find((d) => d.code === "TOA202");
    expect(unknown?.line).toBe(4);
  });
});
