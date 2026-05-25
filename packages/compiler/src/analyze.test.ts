import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";

describe("analyze — full front-end (.agent -> AgentAst)", () => {
  it("analyzes a researcher agent end to end", () => {
    const src = [
      "agent: researcher",
      "model: claude-opus-4-7",
      "description: Research a topic and return a sourced summary.",
      "inputs[1]{name,type}:",
      "  topic,string",
      "tools[2]: web_search,fetch_page",
      "prompt: |",
      "  You are a research analyst. Research: {inputs.topic}",
      "  Return a cited summary.",
      "outputs[2]{name,type}:",
      "  summary,string",
      "  sources,string[]",
    ].join("\n");

    const { ast, diagnostics } = analyze(src, "researcher.agent");
    expect(diagnostics).toEqual([]);
    expect(ast).toEqual({
      name: "researcher",
      model: "claude-opus-4-7",
      description: "Research a topic and return a sourced summary.",
      inputs: [{ name: "topic", type: { base: "string", array: false } }],
      outputs: [
        { name: "summary", type: { base: "string", array: false } },
        { name: "sources", type: { base: "string", array: true } },
      ],
      tools: ["web_search", "fetch_page"],
      prompt: [
        { kind: "text", value: "You are a research analyst. Research: " },
        { kind: "interp", path: ["inputs", "topic"] },
        { kind: "text", value: "\nReturn a cited summary." },
      ],
    });
  });

  it("surfaces validation errors with no AST", () => {
    const { ast, diagnostics } = analyze("model: m\nprompt: p", "bad.agent");
    expect(ast).toBeUndefined();
    expect(diagnostics.map((d) => d.code)).toContain("TOA203");
  });
});
