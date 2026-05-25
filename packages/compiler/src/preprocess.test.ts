import { describe, expect, it } from "vitest";
import { preprocess } from "./preprocess.js";
import { decodeToon } from "./toon.js";

/** Lower the Toa superset, then decode the resulting TOON — the front-end so far. */
function lowerAndDecode(src: string): unknown {
  const pre = preprocess(src, "t.agent");
  expect(pre.diagnostics).toEqual([]);
  const dec = decodeToon(pre.toon, "t.agent");
  expect(dec.diagnostics).toEqual([]);
  return dec.value;
}

describe("preprocess — block-scalar lowering", () => {
  it("passes through source with no block scalars unchanged", () => {
    const src = "agent: x\nmodel: y";
    expect(preprocess(src, "t.agent").toon).toBe(src);
  });

  it("lowers a prompt block and decodes to the multi-line string", () => {
    const src = [
      "agent: researcher",
      "prompt: |",
      "  Research: {inputs.topic}",
      "  Return a summary.",
      "model: claude-opus-4-7",
    ].join("\n");
    expect(lowerAndDecode(src)).toEqual({
      agent: "researcher",
      prompt: "Research: {inputs.topic}\nReturn a summary.",
      model: "claude-opus-4-7",
    });
  });

  it("preserves quotes and colons inside the block (escaped, round-trips)", () => {
    const src = ["prompt: |", '  He said "hi": go'].join("\n");
    expect(lowerAndDecode(src)).toEqual({ prompt: 'He said "hi": go' });
  });

  it("keeps internal blank lines and strips trailing ones", () => {
    const src = ["prompt: |", "  line1", "", "  line3", ""].join("\n");
    expect(lowerAndDecode(src)).toEqual({ prompt: "line1\n\nline3" });
  });

  it("dedents by the block's minimum indentation, preserving relative indent", () => {
    const src = ["prompt: |", "  - a", "    - b"].join("\n");
    expect(lowerAndDecode(src)).toEqual({ prompt: "- a\n  - b" });
  });

  it("treats an empty block as an empty string", () => {
    expect(lowerAndDecode("prompt: |")).toEqual({ prompt: "" });
  });

  it("does not misfire on a value that merely contains a pipe", () => {
    const src = 'sep: "|"';
    expect(preprocess(src, "t.agent").toon).toBe(src);
    expect(decodeToon(src, "t.agent").value).toEqual({ sep: "|" });
  });

  it("records 1-based line numbers for top-level keys", () => {
    const pre = preprocess("agent: a\nmodel: m\nprompt: |\n  hi", "t.agent");
    expect(pre.keyLines.get("agent")).toBe(1);
    expect(pre.keyLines.get("model")).toBe(2);
    expect(pre.keyLines.get("prompt")).toBe(3);
  });
});
