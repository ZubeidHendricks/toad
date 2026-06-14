import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";
import { generate } from "./codegen.js";

function agent(toolsBlock: string[]): string {
  return [
    "agent: weather",
    "model: m",
    "inputs[1]{name,type}:",
    "  city,string",
    ...toolsBlock,
    "prompt: |",
    "  Look up {inputs.city}.",
  ].join("\n");
}

const TYPED = [
  "tools[2]{name,input}:",
  '  geocode,"{city:string}"',
  '  forecast,"{lat:number;lon:number}"',
];

describe("typed tools — parsing", () => {
  it("lifts {name,input} rows into ToolDecl with a parsed object type", () => {
    const { ast, diagnostics } = analyze(agent(TYPED), "weather.agent");
    expect(diagnostics).toEqual([]);
    expect(ast!.tools).toEqual([
      {
        name: "geocode",
        input: {
          base: "object",
          array: false,
          fields: [{ name: "city", type: { base: "string", array: false } }],
        },
      },
      {
        name: "forecast",
        input: {
          base: "object",
          array: false,
          fields: [
            { name: "lat", type: { base: "number", array: false } },
            { name: "lon", type: { base: "number", array: false } },
          ],
        },
      },
    ]);
  });

  it("keeps the bare-name form as plain names (no input)", () => {
    const { ast, diagnostics } = analyze(
      agent(["tools[2]: geocode,forecast"]),
      "weather.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(ast!.tools).toEqual([{ name: "geocode" }, { name: "forecast" }]);
  });

  it("carries an optional description column", () => {
    const { ast, diagnostics } = analyze(
      agent([
        "tools[1]{name,input,description}:",
        '  geocode,"{city:string}",Resolve a city to coordinates',
      ]),
      "weather.agent",
    );
    expect(diagnostics).toEqual([]);
    expect(ast!.tools[0]!.description).toBe("Resolve a city to coordinates");
  });
});

describe("typed tools — validation", () => {
  it("rejects a non-object input type (TOA223)", () => {
    const { diagnostics } = analyze(
      agent(["tools[1]{name,input}:", "  geocode,string"]),
      "weather.agent",
    );
    expect(diagnostics.map((d) => d.code)).toContain("TOA223");
  });

  it("rejects an array-of-object input type (TOA223)", () => {
    const { diagnostics } = analyze(
      agent(["tools[1]{name,input}:", '  geocode,"{city:string}[]"']),
      "weather.agent",
    );
    expect(diagnostics.map((d) => d.code)).toContain("TOA223");
  });

  it("rejects a non-identifier tool name (TOA221)", () => {
    const { diagnostics } = analyze(
      agent(["tools[1]{name,input}:", '  "geo code","{city:string}"']),
      "weather.agent",
    );
    expect(diagnostics.map((d) => d.code)).toContain("TOA221");
  });

  it("rejects a duplicate tool name (TOA224)", () => {
    const { diagnostics } = analyze(
      agent(["tools[2]: geocode,geocode"]),
      "weather.agent",
    );
    expect(diagnostics.map((d) => d.code)).toContain("TOA224");
  });
});

describe("typed tools — codegen", () => {
  it("emits an input interface and a schema-owning defineTool wrapper", () => {
    const { ast } = analyze(agent(TYPED), "weather.agent");
    const code = generate(ast!);
    // defineTool is imported and the type argument pins the schema.
    expect(code).toContain(
      'import { createAgent, defineTool, type Agent } from "toad-runtime";',
    );
    expect(code).toContain("export interface GeocodeInput {");
    expect(code).toContain("const geocodeTool = defineTool<GeocodeInput>({");
    expect(code).toContain("input: z.object({ city: z.string() }),");
    expect(code).toContain("run: geocode,");
    // The run bodies are imported from the co-located tools file.
    expect(code).toContain(
      'import { geocode, forecast } from "./weather.tools";',
    );
    // The registry wires the wrapped consts.
    expect(code).toContain(
      "tools: { geocode: geocodeTool, forecast: forecastTool },",
    );
  });

  it("defaults a tool's description to its name when none is declared", () => {
    const { ast } = analyze(agent(TYPED), "weather.agent");
    expect(generate(ast!)).toContain('description: "geocode",');
  });

  it("uses a declared description when present", () => {
    const { ast } = analyze(
      agent([
        "tools[1]{name,input,description}:",
        '  geocode,"{city:string}",Resolve a city',
      ]),
      "weather.agent",
    );
    expect(generate(ast!)).toContain('description: "Resolve a city",');
  });

  it("does not import defineTool for the bare-name form", () => {
    const { ast } = analyze(
      agent(["tools[2]: geocode,forecast"]),
      "weather.agent",
    );
    const code = generate(ast!);
    expect(code).toContain("import { createAgent, type Agent }");
    expect(code).not.toContain("defineTool");
    expect(code).toContain("tools: { geocode, forecast },");
  });
});
