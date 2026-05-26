import type { JsonObject, JsonValue } from "@toon-format/toon";
import type { AgentAst, FieldDecl, PromptSegment, ToaType } from "./ast.js";
import { errorDiagnostic, type Diagnostic } from "./diagnostics.js";
import { parsePromptTemplate } from "./interpolate.js";

export interface ValidateResult {
  ast?: AgentAst;
  diagnostics: Diagnostic[];
}

const ALLOWED_KEYS = new Set([
  "agent",
  "model",
  "description",
  "inputs",
  "tools",
  "prompt",
  "outputs",
]);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Locator = (key: string) => { line?: number };

/**
 * Validate a decoded `.agent` object and lift it into a typed `AgentAst`. All
 * user errors are collected as diagnostics; the AST is returned only when there
 * are none. See `_bmad-output/architecture.md` §3.③–④.
 */
export function validate(
  value: JsonValue,
  file: string,
  keyLines: Map<string, number>,
): ValidateResult {
  const diagnostics: Diagnostic[] = [];
  const at: Locator = (key) => ({ line: keyLines.get(key) });

  if (!isObject(value)) {
    diagnostics.push(
      errorDiagnostic("TOA201", "an .agent file must be a TOON object", file),
    );
    return { diagnostics };
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) {
      diagnostics.push(
        errorDiagnostic("TOA202", `unknown key "${key}"`, file, at(key)),
      );
    }
  }

  const name = requireString(value, "agent", file, diagnostics, at);
  if (name !== undefined && !IDENT.test(name)) {
    diagnostics.push(
      errorDiagnostic(
        "TOA205",
        `"agent" must be an identifier, got "${name}"`,
        file,
        at("agent"),
      ),
    );
  }
  const model = requireString(value, "model", file, diagnostics, at);
  const promptText = requireString(value, "prompt", file, diagnostics, at);

  let description: string | undefined;
  if (value.description !== undefined) {
    if (typeof value.description === "string") {
      description = value.description;
    } else {
      diagnostics.push(
        errorDiagnostic(
          "TOA204",
          `"description" must be a string`,
          file,
          at("description"),
        ),
      );
    }
  }

  const inputs = parseFields(value, "inputs", file, diagnostics, at);
  const outputs = parseFields(value, "outputs", file, diagnostics, at);
  const tools = parseTools(value, file, diagnostics, at);
  const prompt =
    typeof promptText === "string"
      ? parsePrompt(promptText, inputs, file, diagnostics, at)
      : [];

  if (diagnostics.some((d) => d.severity === "error")) {
    return { diagnostics };
  }

  const ast: AgentAst = {
    name: name!,
    model: model!,
    inputs,
    outputs,
    tools,
    prompt,
  };
  if (description !== undefined) {
    ast.description = description;
  }
  return { ast, diagnostics };
}

function requireString(
  obj: JsonObject,
  key: string,
  file: string,
  diagnostics: Diagnostic[],
  at: Locator,
): string | undefined {
  const v = obj[key];
  if (v === undefined) {
    diagnostics.push(
      errorDiagnostic("TOA203", `missing required key "${key}"`, file),
    );
    return undefined;
  }
  if (typeof v !== "string") {
    diagnostics.push(
      errorDiagnostic("TOA204", `"${key}" must be a string`, file, at(key)),
    );
    return undefined;
  }
  return v;
}

function parseFields(
  obj: JsonObject,
  key: "inputs" | "outputs",
  file: string,
  diagnostics: Diagnostic[],
  at: Locator,
): FieldDecl[] {
  const arr = obj[key];
  if (arr === undefined) {
    return [];
  }
  if (!Array.isArray(arr)) {
    diagnostics.push(
      errorDiagnostic(
        "TOA210",
        `"${key}" must be a tabular array of {name,type}`,
        file,
        at(key),
      ),
    );
    return [];
  }
  const fields: FieldDecl[] = [];
  for (const item of arr) {
    if (
      !isObject(item) ||
      typeof item.name !== "string" ||
      typeof item.type !== "string"
    ) {
      diagnostics.push(
        errorDiagnostic(
          "TOA210",
          `each "${key}" row needs a string name and type`,
          file,
          at(key),
        ),
      );
      continue;
    }
    if (!IDENT.test(item.name)) {
      diagnostics.push(
        errorDiagnostic(
          "TOA211",
          `"${key}" name "${item.name}" must be an identifier`,
          file,
          at(key),
        ),
      );
      continue;
    }
    const type = parseType(item.type);
    if (type === undefined) {
      diagnostics.push(
        errorDiagnostic(
          "TOA212",
          `"${key}" has unsupported type "${item.type}" (use string | number | boolean, optional "[]")`,
          file,
          at(key),
        ),
      );
      continue;
    }
    fields.push({ name: item.name, type });
  }
  return fields;
}

function parseTools(
  obj: JsonObject,
  file: string,
  diagnostics: Diagnostic[],
  at: Locator,
): string[] {
  const arr = obj.tools;
  if (arr === undefined) {
    return [];
  }
  if (!Array.isArray(arr)) {
    diagnostics.push(
      errorDiagnostic(
        "TOA220",
        `"tools" must be an array of names`,
        file,
        at("tools"),
      ),
    );
    return [];
  }
  const names: string[] = [];
  for (const t of arr) {
    if (typeof t !== "string" || !IDENT.test(t)) {
      diagnostics.push(
        errorDiagnostic(
          "TOA221",
          `tool name must be an identifier, got ${JSON.stringify(t)}`,
          file,
          at("tools"),
        ),
      );
      continue;
    }
    names.push(t);
  }
  return names;
}

function parsePrompt(
  text: string,
  inputs: FieldDecl[],
  file: string,
  diagnostics: Diagnostic[],
  at: Locator,
): AgentAst["prompt"] {
  const ctx: PromptScopeCtx = {
    inputNames: new Set(inputs.map((f) => f.name)),
    arrayInputs: new Set(inputs.filter((f) => f.type.array).map((f) => f.name)),
    boolInputs: new Set(
      inputs
        .filter((f) => f.type.base === "boolean" && !f.type.array)
        .map((f) => f.name),
    ),
    file,
    diagnostics,
    at,
  };
  const { segments, errors } = parsePromptTemplate(text);
  for (const message of errors) {
    diagnostics.push(errorDiagnostic("TOA302", message, file, at("prompt")));
  }
  validatePromptSegments(segments, new Set(), ctx);
  return segments;
}

interface PromptScopeCtx {
  inputNames: Set<string>;
  arrayInputs: Set<string>;
  boolInputs: Set<string>;
  file: string;
  diagnostics: Diagnostic[];
  at: Locator;
}

function validatePromptSegments(
  segments: PromptSegment[],
  vars: Set<string>,
  ctx: PromptScopeCtx,
): void {
  for (const seg of segments) {
    if (seg.kind === "interp") {
      const root = seg.path[0];
      if (root !== undefined && vars.has(root)) {
        if (seg.path.length !== 1) {
          ctx.diagnostics.push(
            errorDiagnostic(
              "TOA301",
              `loop variable {${seg.path.join(".")}} has no fields; use {${root}}`,
              ctx.file,
              ctx.at("prompt"),
            ),
          );
        }
      } else if (
        root === "inputs" &&
        seg.path.length === 2 &&
        ctx.inputNames.has(seg.path[1]!)
      ) {
        // ok — a declared input
      } else if (root === "env" && seg.path.length === 2) {
        // ok — an environment variable, resolved at runtime
      } else {
        ctx.diagnostics.push(
          errorDiagnostic(
            "TOA301",
            `unknown interpolation {${seg.path.join(".")}} (use {inputs.<name>}, {env.<NAME>}, or a loop variable)`,
            ctx.file,
            ctx.at("prompt"),
          ),
        );
      }
    } else if (seg.kind === "each") {
      const okSource =
        seg.source.length === 2 &&
        seg.source[0] === "inputs" &&
        ctx.arrayInputs.has(seg.source[1]!);
      if (!okSource) {
        ctx.diagnostics.push(
          errorDiagnostic(
            "TOA303",
            `{#each ${seg.source.join(".")}} must iterate a declared array input (a "[]" type)`,
            ctx.file,
            ctx.at("prompt"),
          ),
        );
      }
      if (vars.has(seg.item)) {
        ctx.diagnostics.push(
          errorDiagnostic(
            "TOA304",
            `loop variable "${seg.item}" shadows an outer one`,
            ctx.file,
            ctx.at("prompt"),
          ),
        );
      }
      const inner = new Set(vars);
      inner.add(seg.item);
      if (seg.index !== undefined) {
        if (vars.has(seg.index)) {
          ctx.diagnostics.push(
            errorDiagnostic(
              "TOA304",
              `loop index "${seg.index}" shadows an outer variable`,
              ctx.file,
              ctx.at("prompt"),
            ),
          );
        }
        inner.add(seg.index);
      }
      validatePromptSegments(seg.body, inner, ctx);
      if (seg.else !== undefined) {
        validatePromptSegments(seg.else, vars, ctx);
      }
    } else if (seg.kind === "if") {
      const okCond =
        seg.cond.length === 2 &&
        seg.cond[0] === "inputs" &&
        ctx.boolInputs.has(seg.cond[1]!);
      if (!okCond) {
        ctx.diagnostics.push(
          errorDiagnostic(
            "TOA305",
            `{#if ${seg.cond.join(".")}} must test a boolean input (a "boolean" type)`,
            ctx.file,
            ctx.at("prompt"),
          ),
        );
      }
      validatePromptSegments(seg.then, vars, ctx);
      validatePromptSegments(seg.else, vars, ctx);
    }
  }
}

function parseType(raw: string): ToaType | undefined {
  let base = raw;
  let array = false;
  if (base.endsWith("[]")) {
    array = true;
    base = base.slice(0, -2);
  }
  if (base === "string" || base === "number" || base === "boolean") {
    return { base, array };
  }
  return undefined;
}

function isObject(v: JsonValue): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
