import { describe, expect, it } from "vitest";
import { decodeToon } from "./toon.js";

describe("decodeToon — TOON conformance (the subset .agent uses)", () => {
  const cases: ReadonlyArray<{ name: string; toon: string; json: unknown }> = [
    {
      name: "flat object",
      toon: "id: 1\nname: Ada",
      json: { id: 1, name: "Ada" },
    },
    {
      name: "nested object",
      toon: "user:\n  id: 1\n  name: Ada",
      json: { user: { id: 1, name: "Ada" } },
    },
    {
      name: "inline primitive array",
      toon: "tags[3]: a,b,c",
      json: { tags: ["a", "b", "c"] },
    },
    {
      name: "tabular array",
      toon: "rows[2]{id,name}:\n  1,Ada\n  2,Linus",
      json: {
        rows: [
          { id: 1, name: "Ada" },
          { id: 2, name: "Linus" },
        ],
      },
    },
    {
      name: "quoted string keeps braces + colon (interpolation survives decode)",
      toon: 'prompt: "Hi {inputs.name}: go"',
      json: { prompt: "Hi {inputs.name}: go" },
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = decodeToon(c.toon, "test.agent");
      expect(result.diagnostics).toEqual([]);
      expect(result.value).toEqual(c.json);
    });
  }

  it("malformed input → located TOA101 diagnostic, no value", () => {
    const result = decodeToon('name: "unterminated', "bad.agent");
    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("TOA101");
  });
});
