import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { compile } from "./index.js";

describe("enum types (a|b|c)", () => {
  it("parses pipe-separated literals into an enum type", () => {
    const { ast, diagnostics } = analyze(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        "  mode,draft|final",
        "prompt: |",
        "  Mode: {inputs.mode}",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(ast!.inputs[0]!.type).toEqual({
      base: "enum",
      array: false,
      values: ["draft", "final"],
    });
  });

  it("emits a TS string-literal union and z.enum", () => {
    const { code, diagnostics } = compile(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        "  mode,draft|final",
        "prompt: |",
        "  Mode: {inputs.mode}",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(code).toContain('mode: "draft" | "final";');
    expect(code).toContain('mode: z.enum(["draft", "final"]),');
    // Enums are scalars: interpolation stays plain.
    expect(code).toContain("${inputs.mode}");
  });

  it("supports enum arrays with parenthesized unions", () => {
    const { code, diagnostics } = compile(
      [
        "agent: a",
        "model: m",
        "outputs[1]{name,type}:",
        "  tags,red|green|blue[]",
        "prompt: |",
        "  hi",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(code).toContain('tags: ("red" | "green" | "blue")[];');
    expect(code).toContain('tags: z.array(z.enum(["red", "green", "blue"])),');
  });

  it("supports enums as object-type fields", () => {
    const { code, diagnostics } = compile(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        '  task,"{title:string;status:open|closed}"',
        "prompt: |",
        "  {inputs.task.title}",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(code).toContain('status: "open" | "closed"');
    expect(code).toContain('status: z.enum(["open", "closed"])');
  });

  it("rejects duplicate values (TOA212)", () => {
    const { diagnostics } = analyze(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        "  mode,draft|draft",
        "prompt: |",
        "  hi",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics.map((d) => d.code)).toContain("TOA212");
  });

  it("rejects malformed values (TOA212)", () => {
    const { diagnostics } = analyze(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        '  mode,"draft||final"',
        "prompt: |",
        "  hi",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics.map((d) => d.code)).toContain("TOA212");
  });

  it("an optional enum interpolates as empty when omitted", () => {
    const { code, diagnostics } = compile(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        "  mode?,draft|final",
        "prompt: |",
        "  Mode: {inputs.mode}",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(code).toContain('mode?: "draft" | "final";');
    expect(code).toContain('mode: z.enum(["draft", "final"]).optional(),');
    expect(code).toContain('${inputs.mode ?? ""}');
  });
});
