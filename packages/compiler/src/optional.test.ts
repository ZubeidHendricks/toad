import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { generate } from "./codegen.js";
import { compile } from "./index.js";

describe("optional inputs (name?,type)", () => {
  it("parses a trailing ? as an optional field", () => {
    const { ast, diagnostics } = analyze(
      [
        "agent: a",
        "model: m",
        "inputs[2]{name,type}:",
        "  topic,string",
        "  detail?,string",
        "prompt: |",
        "  {inputs.topic}",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(ast!.inputs).toEqual([
      { name: "topic", type: { base: "string", array: false } },
      {
        name: "detail",
        type: { base: "string", array: false },
        optional: true,
      },
    ]);
  });

  it("emits an optional TS field and zod .optional()", () => {
    const { code, diagnostics } = compile(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        "  detail?,string",
        "prompt: |",
        "  hi",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(code).toContain("detail?: string;");
    expect(code).toContain("detail: z.string().optional(),");
  });

  it("interpolates an optional scalar as empty when omitted", () => {
    const { code } = compile(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        "  note?,string",
        "prompt: |",
        "  Note: {inputs.note}",
      ].join("\n"),
      "a.agent",
    );
    expect(code).toContain('${inputs.note ?? ""}');
  });

  it("guards field access through an optional object input with ?.", () => {
    const { code, diagnostics } = compile(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        '  user?,"{name:string}"',
        "prompt: |",
        "  Hello {user_name}!",
      ]
        .join("\n")
        .replace("{user_name}", "{inputs.user.name}"),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(code).toContain('${inputs.user?.name ?? ""}');
  });

  it("iterates an optional array input as empty when omitted", () => {
    const { code, diagnostics } = compile(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        "  notes?,string[]",
        "prompt: |",
        "  {#each inputs.notes as n}",
        "  - {n}",
        "  {:else}",
        "  none",
        "  {/each}",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(code).toContain("(inputs.notes ?? []).length > 0");
    expect(code).toContain("(inputs.notes ?? []).map((n)");
  });

  it("allows {#if} on an optional boolean (falsy when omitted)", () => {
    const { code, diagnostics } = compile(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        "  detailed?,boolean",
        "prompt: |",
        "  {#if inputs.detailed}",
        "  long",
        "  {:else}",
        "  short",
        "  {/if}",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(code).toContain("${inputs.detailed ?");
  });

  it("renders an optional non-scalar via toonValue (undefined -> empty)", () => {
    const { code, diagnostics } = compile(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        "  rows?,string[]",
        "prompt: |",
        "  {inputs.rows}",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(code).toContain("${toonValue(inputs.rows)}");
  });

  it("supports optional output fields", () => {
    const { code, diagnostics } = compile(
      [
        "agent: a",
        "model: m",
        "outputs[2]{name,type}:",
        "  summary,string",
        "  caveats?,string[]",
        "prompt: |",
        "  hi",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(code).toContain("caveats?: string[];");
    expect(code).toContain("caveats: z.array(z.string()).optional(),");
  });

  it("still rejects a bad identifier even with a ? (TOA211)", () => {
    const { diagnostics } = analyze(
      [
        "agent: a",
        "model: m",
        "inputs[1]{name,type}:",
        "  2bad?,string",
        "prompt: |",
        "  hi",
      ].join("\n"),
      "a.agent",
    );
    expect(diagnostics.map((d) => d.code)).toContain("TOA211");
  });

  it("generated code for required inputs is unchanged", () => {
    const src = [
      "agent: a",
      "model: m",
      "inputs[1]{name,type}:",
      "  topic,string",
      "prompt: |",
      "  {inputs.topic}",
    ].join("\n");
    const { ast } = analyze(src, "a.agent");
    const code = generate(ast!);
    expect(code).toContain("topic: string;");
    expect(code).toContain("topic: z.string(),");
    expect(code).toContain("${inputs.topic}");
    expect(code).not.toContain("?? ");
  });
});
