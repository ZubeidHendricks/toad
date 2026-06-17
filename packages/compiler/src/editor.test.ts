import { describe, expect, it } from "vitest";
import { completionsAt, hoverAt, inputNames } from "./editor.js";

const AGENT = `agent: writer
model: claude-opus-4-7
inputs[2]{name,type}:
  topic,string
  tone,string
prompt: |
  Write about {inputs.topic}
`;

describe("hoverAt", () => {
  it("documents a top-level key under the cursor", () => {
    const h = hoverAt(AGENT, 0, 2); // on `agent`
    expect(h?.contents).toContain("**agent**");
  });

  it("documents a tabular key (inputs[N]{…}:)", () => {
    const h = hoverAt(AGENT, 2, 1); // on `inputs`
    expect(h?.contents).toContain("**inputs");
  });

  it("returns nothing past the key, or on a value line", () => {
    expect(hoverAt(AGENT, 1, 12)).toBeUndefined(); // inside the model value
    expect(hoverAt(AGENT, 6, 4)).toBeUndefined(); // inside the prompt body
  });
});

describe("completionsAt", () => {
  it("suggests declared input names after `{inputs.`", () => {
    // place the cursor right after `{inputs.` on a fresh line
    const src = AGENT + "  More on {inputs.";
    const line = src.split("\n").length - 1;
    const items = completionsAt(src, line, "  More on {inputs.".length);
    expect(items.map((i) => i.label).sort()).toEqual(["tone", "topic"]);
    expect(items.every((i) => i.kind === "variable")).toBe(true);
  });

  it("suggests template constructs after `{`", () => {
    const src = AGENT + "  {";
    const line = src.split("\n").length - 1;
    const items = completionsAt(src, line, "  {".length);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("#each");
    expect(labels).toContain("#if");
    const each = items.find((i) => i.label === "#each");
    expect(each?.snippet).toBe(true);
  });

  it("suggests top-level keys on a bare word at column 0", () => {
    const items = completionsAt("pro", 0, 3);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("prompt");
    expect(labels).toContain("outputs");
    expect(items.every((i) => i.kind === "property")).toBe(true);
  });

  it("returns nothing inside a value", () => {
    expect(completionsAt(AGENT, 1, 8)).toEqual([]); // mid model value
  });
});

describe("inputNames", () => {
  it("reads names from the AST", () => {
    expect(inputNames(AGENT)).toEqual(["topic", "tone"]);
  });

  it("falls back to a scan when the document does not parse", () => {
    const partial = "inputs[2]{name,type}:\n  topic,string\n  tone,string\n";
    expect(inputNames(partial)).toEqual(["topic", "tone"]);
  });
});
