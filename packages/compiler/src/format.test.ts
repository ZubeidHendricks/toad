import { describe, expect, it } from "vitest";
import { formatAgent } from "./format.js";

describe("formatAgent", () => {
  it("reorders keys, normalizes spacing/indent, trims blank lines", () => {
    const ugly = [
      "model:   m",
      "agent: a",
      "prompt: |",
      "      hi {inputs.x}",
      "inputs[1]{name,type}:",
      "  x,string",
      "",
      "",
    ].join("\n");
    const { code, changed, diagnostics } = formatAgent(ugly, "a.agent");
    expect(diagnostics).toEqual([]);
    expect(changed).toBe(true);
    expect(code).toBe(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        "  x,string",
        "prompt: |",
        "  hi {inputs.x}",
        "",
      ].join("\n"),
    );
  });

  it("is idempotent — formatting twice changes nothing", () => {
    const ugly = ["model: m", "agent: a", "prompt: hi"].join("\n");
    const once = formatAgent(ugly, "a.agent").code!;
    const twice = formatAgent(once, "a.agent");
    expect(twice.code).toBe(once);
    expect(twice.changed).toBe(false);
  });

  it("reports an already-canonical file as unchanged", () => {
    const canonical = "agent: a\nmodel: m\nprompt: hi\n";
    expect(formatAgent(canonical, "a.agent").changed).toBe(false);
  });

  it("preserves trailing whitespace inside a prompt block (never alters meaning)", () => {
    const src = [
      "agent: a",
      "model: m",
      "prompt: |",
      "  keep these   ",
      "",
    ].join("\n");
    const { code, diagnostics } = formatAgent(src, "a.agent");
    expect(diagnostics).toEqual([]);
    expect(code).toContain("  keep these   ");
  });

  it("re-indents a deep prompt block to two spaces, content intact", () => {
    const src = [
      "agent: a",
      "model: m",
      "prompt: |",
      "        line one",
      "          nested",
      "",
    ].join("\n");
    const { code } = formatAgent(src, "a.agent");
    expect(code).toContain("prompt: |\n  line one\n    nested\n");
  });

  it("leaves quoted object types in tabular rows untouched", () => {
    const src = [
      "agent: a",
      "model: m",
      "tools[1]{name,input}:",
      '  geo,"{city:string}"',
      "prompt: |",
      "  hi",
    ].join("\n");
    const { code, diagnostics } = formatAgent(src, "a.agent");
    expect(diagnostics).toEqual([]);
    expect(code).toContain('  geo,"{city:string}"');
  });

  it("refuses to format an invalid file and returns its diagnostics", () => {
    const { code, changed, diagnostics } = formatAgent("agent: a\n", "a.agent");
    expect(code).toBeUndefined();
    expect(changed).toBe(false);
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});
