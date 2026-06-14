import { describe, expect, it } from "vitest";
import {
  closest,
  errorDiagnostic,
  renderDiagnostic,
  type Diagnostic,
} from "./diagnostics.js";
import { analyze } from "./analyze.js";

describe("renderDiagnostic — code frames", () => {
  const source = ["agent: a", "model: m", "promt: |", "  hi"].join("\n");

  it("renders a caret frame aligned under the span", () => {
    const d = errorDiagnostic("TOA202", `unknown key "promt"`, "x.agent", {
      line: 3,
      col: 1,
      length: 5,
      help: "did you mean `prompt`?",
    });
    expect(renderDiagnostic(d, source)).toBe(
      [
        'error[TOA202]: unknown key "promt"',
        "  --> x.agent:3:1",
        "   |",
        " 3 | promt: |",
        "   | ^^^^^ did you mean `prompt`?",
        "   |",
      ].join("\n"),
    );
  });

  it("positions the caret at a non-zero column", () => {
    const d = errorDiagnostic("TOA999", "bad", "x.agent", {
      line: 4,
      col: 3,
      length: 2,
    });
    expect(renderDiagnostic(d, source)).toBe(
      [
        "error[TOA999]: bad",
        "  --> x.agent:4:3",
        "   |",
        " 4 |   hi",
        "   |   ^^",
        "   |",
      ].join("\n"),
    );
  });

  it("keeps the gutter aligned for multi-digit line numbers", () => {
    const many = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join(
      "\n",
    );
    const d = errorDiagnostic("TOA999", "x", "x.agent", {
      line: 12,
      col: 1,
      length: 4,
    });
    const out = renderDiagnostic(d, many);
    expect(out).toContain("   --> x.agent:12:1");
    expect(out).toContain(" 12 | line 12");
    expect(out).toContain("    | ^^^^");
  });

  it("renders help as a note when there is no caret span", () => {
    const d = errorDiagnostic("TOA301", "bad ref", "x.agent", {
      line: 3,
      help: "did you mean `inputs.topic`?",
    });
    expect(renderDiagnostic(d, source)).toBe(
      [
        "error[TOA301]: bad ref",
        "  --> x.agent:3",
        "   |",
        " 3 | promt: |",
        "   |",
        "   = help: did you mean `inputs.topic`?",
      ].join("\n"),
    );
  });

  it("falls back to a header + pointer when there is no source", () => {
    const d = errorDiagnostic("TOA203", "missing key", "x.agent", { line: 2 });
    expect(renderDiagnostic(d)).toBe(
      "error[TOA203]: missing key\n  --> x.agent:2",
    );
  });

  it("falls back with no location at all", () => {
    const d: Diagnostic = {
      severity: "error",
      code: "TOA201",
      message: "not an object",
      file: "x.agent",
    };
    expect(renderDiagnostic(d)).toBe(
      "error[TOA201]: not an object\n  --> x.agent",
    );
  });
});

describe("closest — did-you-mean", () => {
  const keys = ["agent", "model", "prompt", "inputs", "outputs", "tools"];

  it("finds a near match (one edit)", () => {
    expect(closest("promt", keys)).toBe("prompt");
    expect(closest("inputz", keys)).toBe("inputs");
  });

  it("finds a transposition (Damerau distance 1)", () => {
    expect(closest("tpoic", ["topic", "audience"])).toBe("topic");
    expect(closest("otuputs", keys)).toBe("outputs"); // swapped 'u' and 't'
  });

  it("returns undefined when nothing is close", () => {
    expect(closest("xyzzy", keys)).toBeUndefined();
    expect(closest("description!!", keys)).toBeUndefined();
  });
});

describe("suggestions wired into validation", () => {
  it("suggests the right key for a typo'd unknown key (TOA202)", () => {
    const src = ["agent: a", "model: m", "promt: |", "  hi"].join("\n");
    const { diagnostics } = analyze(src, "x.agent");
    const d = diagnostics.find((x) => x.code === "TOA202");
    expect(d?.help).toBe("did you mean `prompt`?");
    expect(d).toMatchObject({ line: 3, col: 1, length: 5 });
  });

  it("suggests the right input for a typo'd interpolation (TOA301)", () => {
    const src = [
      "agent: a",
      "model: m",
      "inputs[1]{name,type}:",
      "  topic,string",
      "prompt: |",
      "  Research {inputs.tpoic}.",
    ].join("\n");
    const { diagnostics } = analyze(src, "x.agent");
    const d = diagnostics.find((x) => x.code === "TOA301");
    expect(d?.help).toBe("did you mean `inputs.topic`?");
  });
});

describe("row-level locations for tabular fields", () => {
  it("points a bad type at its row, not the header (TOA212)", () => {
    const src = [
      "agent: a",
      "model: m",
      "inputs[2]{name,type}:",
      "  topic,string",
      "  count,wholenumber",
      "prompt: |",
      "  hi",
    ].join("\n");
    const d = analyze(src, "x.agent").diagnostics.find(
      (x) => x.code === "TOA212",
    );
    expect(d).toMatchObject({ line: 5, col: 3 });
    expect(d?.length).toBe("count,wholenumber".length);
  });

  it("locates a bad field name at its row (TOA211)", () => {
    const src = [
      "agent: a",
      "model: m",
      "inputs[1]{name,type}:",
      "  2bad,string",
      "prompt: |",
      "  hi",
    ].join("\n");
    const d = analyze(src, "x.agent").diagnostics.find(
      (x) => x.code === "TOA211",
    );
    expect(d).toMatchObject({ line: 4, col: 3 });
  });

  it("points a typed-tool row error at its row (TOA223)", () => {
    const src = [
      "agent: a",
      "model: m",
      "tools[2]{name,input}:",
      '  geo,"{city:string}"',
      "  forecast,notobject",
      "prompt: |",
      "  hi",
    ].join("\n");
    const d = analyze(src, "x.agent").diagnostics.find(
      (x) => x.code === "TOA223",
    );
    expect(d).toMatchObject({ line: 5, col: 3 });
  });

  it("locates an unclosed block at its line inside the prompt (TOA302)", () => {
    const src = [
      "agent: a",
      "model: m",
      "inputs[1]{name,type}:",
      "  xs,string[]",
      "prompt: |",
      "  {#each inputs.xs as x}",
      "  - {x}",
    ].join("\n");
    const d = analyze(src, "x.agent").diagnostics.find(
      (x) => x.code === "TOA302",
    );
    expect(d).toMatchObject({ line: 6, col: 3 });
  });

  it("locates a malformed interpolation at its prompt line (TOA302)", () => {
    const src = [
      "agent: a",
      "model: m",
      "prompt: |",
      "  Line one.",
      "  Then {bad..path} here.",
    ].join("\n");
    const d = analyze(src, "x.agent").diagnostics.find(
      (x) => x.code === "TOA302",
    );
    expect(d?.line).toBe(5);
  });

  it("locates errors in a system block, not the prompt block", () => {
    const src = [
      "agent: a",
      "model: m",
      "prompt: |",
      "  hi",
      "system: |",
      "  {#if inputs.x}",
      "  on",
    ].join("\n");
    const d = analyze(src, "x.agent").diagnostics.find(
      (x) => x.code === "TOA302",
    );
    expect(d?.line).toBe(6); // the {#if} line in the system block
  });

  it("records tabular-header key lines (so their diagnostics are located)", () => {
    // `inputs[N]{...}:` is a top-level key; its line must be tracked.
    const src = [
      "agent: a",
      "model: m",
      "outputs[1]{name,type}:",
      "  result,notatype",
      "prompt: |",
      "  hi",
    ].join("\n");
    const d = analyze(src, "x.agent").diagnostics.find(
      (x) => x.code === "TOA212",
    );
    expect(d?.line).toBe(4);
  });
});
