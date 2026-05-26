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
  "maxTurns",
  "retries",
  "uses",
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
  const uses = parseUses(value, file, diagnostics, at);
  const maxTurns = parseIntKey(value, "maxTurns", file, diagnostics, at);
  const retries = parseIntKey(value, "retries", file, diagnostics, at);
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
    uses,
    prompt,
  };
  if (description !== undefined) {
    ast.description = description;
  }
  if (maxTurns !== undefined) {
    ast.maxTurns = maxTurns;
  }
  if (retries !== undefined) {
    ast.retries = retries;
  }
  return { ast, diagnostics };
}

function parseUses(
  obj: JsonObject,
  file: string,
  diagnostics: Diagnostic[],
  at: Locator,
): string[] {
  const arr = obj.uses;
  if (arr === undefined) {
    return [];
  }
  if (!Array.isArray(arr)) {
    diagnostics.push(
      errorDiagnostic(
        "TOA230",
        `"uses" must be an array of agent names`,
        file,
        at("uses"),
      ),
    );
    return [];
  }
  const names: string[] = [];
  for (const u of arr) {
    if (typeof u !== "string" || !IDENT.test(u)) {
      diagnostics.push(
        errorDiagnostic(
          "TOA231",
          `"uses" entries must be identifiers, got ${JSON.stringify(u)}`,
          file,
          at("uses"),
        ),
      );
      continue;
    }
    names.push(u);
  }
  return names;
}

function parseIntKey(
  obj: JsonObject,
  key: string,
  file: string,
  diagnostics: Diagnostic[],
  at: Locator,
): number | undefined {
  const v = obj[key];
  if (v === undefined) {
    return undefined;
  }
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    diagnostics.push(
      errorDiagnostic(
        "TOA206",
        `"${key}" must be a non-negative integer`,
        file,
        at(key),
      ),
    );
    return undefined;
  }
  return v;
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
    inputTypes: new Map(inputs.map((f) => [f.name, f.type])),
    file,
    diagnostics,
    at,
  };
  const { segments, errors } = parsePromptTemplate(text);
  for (const message of errors) {
    diagnostics.push(errorDiagnostic("TOA302", message, file, at("prompt")));
  }
  validatePromptSegments(segments, new Map(), ctx);
  return segments;
}

interface PromptScopeCtx {
  inputTypes: Map<string, ToaType>;
  file: string;
  diagnostics: Diagnostic[];
  at: Locator;
}

const NUMBER_TYPE: ToaType = { base: "number", array: false };

/** Walk a dotted path through object fields; returns the resolved type or null. */
function resolveFieldPath(type: ToaType, rest: string[]): ToaType | null {
  let cur = type;
  for (const seg of rest) {
    if (cur.array || cur.base !== "object" || cur.fields === undefined) {
      return null;
    }
    const field = cur.fields.find((f) => f.name === seg);
    if (field === undefined) {
      return null;
    }
    cur = field.type;
  }
  return cur;
}

function badInterp(path: string[], ctx: PromptScopeCtx): void {
  ctx.diagnostics.push(
    errorDiagnostic(
      "TOA301",
      `invalid interpolation {${path.join(".")}} (unknown name or field)`,
      ctx.file,
      ctx.at("prompt"),
    ),
  );
}

function validatePromptSegments(
  segments: PromptSegment[],
  vars: Map<string, ToaType>,
  ctx: PromptScopeCtx,
): void {
  for (const seg of segments) {
    if (seg.kind === "interp") {
      const root = seg.path[0];
      if (root !== undefined && vars.has(root)) {
        if (resolveFieldPath(vars.get(root)!, seg.path.slice(1)) === null) {
          badInterp(seg.path, ctx);
        }
      } else if (
        root === "inputs" &&
        seg.path.length >= 2 &&
        ctx.inputTypes.has(seg.path[1]!)
      ) {
        if (
          resolveFieldPath(
            ctx.inputTypes.get(seg.path[1]!)!,
            seg.path.slice(2),
          ) === null
        ) {
          badInterp(seg.path, ctx);
        }
      } else if (root === "env" && seg.path.length === 2) {
        // ok — an environment variable, resolved at runtime
      } else {
        badInterp(seg.path, ctx);
      }
    } else if (seg.kind === "each") {
      const sourceType =
        seg.source.length === 2 && seg.source[0] === "inputs"
          ? ctx.inputTypes.get(seg.source[1]!)
          : undefined;
      if (sourceType === undefined || !sourceType.array) {
        ctx.diagnostics.push(
          errorDiagnostic(
            "TOA303",
            `{#each ${seg.source.join(".")}} must iterate a declared array input (a "[]" type)`,
            ctx.file,
            ctx.at("prompt"),
          ),
        );
        continue;
      }
      const elementType: ToaType = sourceType.fields
        ? { base: sourceType.base, array: false, fields: sourceType.fields }
        : { base: sourceType.base, array: false };
      const inner = new Map(vars);
      inner.set(seg.item, elementType);
      if (seg.index !== undefined) {
        inner.set(seg.index, NUMBER_TYPE);
      }
      validatePromptSegments(seg.body, inner, ctx);
      if (seg.else !== undefined) {
        validatePromptSegments(seg.else, vars, ctx);
      }
    } else if (seg.kind === "if") {
      const condType =
        seg.cond.length === 2 && seg.cond[0] === "inputs"
          ? ctx.inputTypes.get(seg.cond[1]!)
          : undefined;
      if (
        condType === undefined ||
        condType.base !== "boolean" ||
        condType.array
      ) {
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
  let rest = raw.trim();
  let array = false;
  if (rest.endsWith("[]")) {
    array = true;
    rest = rest.slice(0, -2).trim();
  }
  if (rest === "string" || rest === "number" || rest === "boolean") {
    return { base: rest, array };
  }
  if (rest.startsWith("{") && rest.endsWith("}")) {
    const fields: FieldDecl[] = [];
    for (const part of splitFields(rest.slice(1, -1))) {
      const idx = part.indexOf(":");
      if (idx === -1) {
        return undefined;
      }
      const name = part.slice(0, idx).trim();
      const fieldType = parseType(part.slice(idx + 1));
      if (!IDENT.test(name) || fieldType === undefined) {
        return undefined;
      }
      fields.push({ name, type: fieldType });
    }
    if (fields.length === 0) {
      return undefined;
    }
    return { base: "object", array, fields };
  }
  return undefined;
}

/** Split object-field declarations on top-level `;` (brace-aware). */
function splitFields(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
    }
    if (ch === ";" && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim().length > 0) {
    parts.push(cur);
  }
  return parts;
}

function isObject(v: JsonValue): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
