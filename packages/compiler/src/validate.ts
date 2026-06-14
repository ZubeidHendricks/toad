import type { JsonObject, JsonValue } from "@toon-format/toon";
import type {
  AgentAst,
  FieldDecl,
  PromptSegment,
  ToaType,
  ToolDecl,
} from "./ast.js";
import {
  closest,
  errorDiagnostic,
  type Diagnostic,
  type DiagnosticLoc,
} from "./diagnostics.js";
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
  "system",
  "maxTurns",
  "maxContextTokens",
  "retries",
  "temperature",
  "uses",
]);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Locator = (key: string) => { line?: number };
/** Locate a specific row of a tabular key (`inputs`/`outputs`) for a caret. */
type RowLocator = (
  key: string,
  index: number,
) => { line?: number; col?: number; length?: number };

/**
 * Validate a decoded `.agent` object and lift it into a typed `AgentAst`. All
 * user errors are collected as diagnostics; the AST is returned only when there
 * are none. See `_bmad-output/architecture.md` §3.③–④.
 */
export function validate(
  value: JsonValue,
  file: string,
  keyLines: Map<string, number>,
  source?: string,
): ValidateResult {
  const diagnostics: Diagnostic[] = [];
  const at: Locator = (key) => ({ line: keyLines.get(key) });
  // Tabular rows follow the header line in order, so row i is at headerLine+1+i.
  // Resolve it to a precise caret (column + width) when the source is available.
  const srcLines = source?.split(/\r?\n/);
  const rowAt: RowLocator = (key, index) => {
    const headerLine = keyLines.get(key);
    if (headerLine === undefined || srcLines === undefined) {
      return { line: headerLine };
    }
    const lineNo = headerLine + 1 + index;
    const text = srcLines[lineNo - 1] ?? "";
    const trimmed = text.trim();
    if (trimmed === "") return { line: headerLine };
    return {
      line: lineNo,
      col: text.length - text.trimStart().length + 1,
      length: trimmed.length,
    };
  };

  if (!isObject(value)) {
    diagnostics.push(
      errorDiagnostic("TOA201", "an .agent file must be a TOON object", file),
    );
    return { diagnostics };
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) {
      const hint = closest(key, ALLOWED_KEYS);
      // Keys sit at column 1 in TOON; underline the whole key.
      diagnostics.push(
        errorDiagnostic("TOA202", `unknown key "${key}"`, file, {
          ...at(key),
          col: 1,
          length: key.length,
          ...(hint !== undefined ? { help: `did you mean \`${hint}\`?` } : {}),
        }),
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

  const inputs = parseFields(value, "inputs", file, diagnostics, at, rowAt);
  const outputs = parseFields(value, "outputs", file, diagnostics, at, rowAt);
  const tools = parseTools(value, file, diagnostics, at, rowAt);
  const uses = parseUses(value, file, diagnostics, at);
  const maxTurns = parseIntKey(value, "maxTurns", file, diagnostics, at);
  const maxContextTokens = parseIntKey(
    value,
    "maxContextTokens",
    file,
    diagnostics,
    at,
  );
  const retries = parseIntKey(value, "retries", file, diagnostics, at);
  const temperature = parseTemperature(value, file, diagnostics, at);
  const prompt =
    typeof promptText === "string"
      ? parsePrompt(
          promptText,
          inputs,
          file,
          diagnostics,
          keyLines.get("prompt"),
          srcLines,
        )
      : [];
  let system: PromptSegment[] | undefined;
  if (value.system !== undefined) {
    if (typeof value.system === "string") {
      system = parsePrompt(
        value.system,
        inputs,
        file,
        diagnostics,
        keyLines.get("system"),
        srcLines,
      );
    } else {
      diagnostics.push(
        errorDiagnostic(
          "TOA204",
          `"system" must be a string`,
          file,
          at("system"),
        ),
      );
    }
  }

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
  if (system !== undefined) {
    ast.system = system;
  }
  if (maxTurns !== undefined) {
    ast.maxTurns = maxTurns;
  }
  if (maxContextTokens !== undefined) {
    ast.maxContextTokens = maxContextTokens;
  }
  if (retries !== undefined) {
    ast.retries = retries;
  }
  if (temperature !== undefined) {
    ast.temperature = temperature;
  }
  return { ast, diagnostics };
}

function parseTemperature(
  obj: JsonObject,
  file: string,
  diagnostics: Diagnostic[],
  at: Locator,
): number | undefined {
  const v = obj.temperature;
  if (v === undefined) {
    return undefined;
  }
  if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 1) {
    diagnostics.push(
      errorDiagnostic(
        "TOA207",
        `"temperature" must be a number between 0 and 1`,
        file,
        at("temperature"),
      ),
    );
    return undefined;
  }
  return v;
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
  rowAt: RowLocator,
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
  arr.forEach((item, index) => {
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
          rowAt(key, index),
        ),
      );
      return;
    }
    const rawName: string = item.name;
    const rawType: string = item.type;
    // A trailing `?` on the name marks the field optional: `topic?,string`.
    const optional = rawName.endsWith("?");
    const name = optional ? rawName.slice(0, -1) : rawName;
    if (!IDENT.test(name)) {
      diagnostics.push(
        errorDiagnostic(
          "TOA211",
          `"${key}" name "${name}" must be an identifier`,
          file,
          rowAt(key, index),
        ),
      );
      return;
    }
    const type = parseType(rawType);
    if (type === undefined) {
      diagnostics.push(
        errorDiagnostic(
          "TOA212",
          `"${key}" has unsupported type "${rawType}" (use string | number | boolean, optional "[]")`,
          file,
          rowAt(key, index),
        ),
      );
      return;
    }
    fields.push(optional ? { name, type, optional } : { name, type });
  });
  return fields;
}

function parseTools(
  obj: JsonObject,
  file: string,
  diagnostics: Diagnostic[],
  at: Locator,
  rowAt: RowLocator,
): ToolDecl[] {
  const arr = obj.tools;
  if (arr === undefined) {
    return [];
  }
  if (!Array.isArray(arr)) {
    diagnostics.push(
      errorDiagnostic(
        "TOA220",
        `"tools" must be a list of names or {name,input} rows`,
        file,
        at("tools"),
      ),
    );
    return [];
  }
  const tools: ToolDecl[] = [];
  const seen = new Set<string>();
  const push = (decl: ToolDecl, loc: DiagnosticLoc): void => {
    if (seen.has(decl.name)) {
      diagnostics.push(
        errorDiagnostic(
          "TOA224",
          `duplicate tool name "${decl.name}"`,
          file,
          loc,
        ),
      );
      return;
    }
    seen.add(decl.name);
    tools.push(decl);
  };
  arr.forEach((t, index) => {
    // Bare-name form (`tools[N]: a,b`): names share the header line.
    if (typeof t === "string") {
      if (!IDENT.test(t)) {
        diagnostics.push(badToolName(t, file, at("tools")));
        return;
      }
      push({ name: t }, at("tools"));
      return;
    }
    // Typed tabular form (`tools[N]{name,input}:`): each row is on its own line,
    // so locate errors at the row. The compiler owns the input schema; the tools
    // file supplies only the typed `run` body.
    const loc = rowAt("tools", index);
    if (isObject(t) && typeof t.name === "string") {
      const name = t.name;
      if (!IDENT.test(name)) {
        diagnostics.push(badToolName(name, file, loc));
        return;
      }
      if (typeof t.input !== "string") {
        diagnostics.push(
          errorDiagnostic(
            "TOA222",
            `typed tool "${name}" needs a string input type`,
            file,
            loc,
          ),
        );
        return;
      }
      const input = parseType(t.input);
      if (input === undefined || input.base !== "object" || input.array) {
        diagnostics.push(
          errorDiagnostic(
            "TOA223",
            `tool "${name}" input must be an object type like "{query:string}"`,
            file,
            loc,
          ),
        );
        return;
      }
      const decl: ToolDecl = { name, input };
      if (typeof t.description === "string") {
        decl.description = t.description;
      }
      push(decl, loc);
      return;
    }
    diagnostics.push(
      errorDiagnostic(
        "TOA221",
        `each tool must be a name or a {name,input} row, got ${JSON.stringify(t)}`,
        file,
        loc,
      ),
    );
  });
  return tools;
}

function badToolName(
  value: unknown,
  file: string,
  loc: DiagnosticLoc,
): Diagnostic {
  return errorDiagnostic(
    "TOA221",
    `tool name must be an identifier, got ${JSON.stringify(value)}`,
    file,
    loc,
  );
}

function parsePrompt(
  text: string,
  inputs: FieldDecl[],
  file: string,
  diagnostics: Diagnostic[],
  blockLine: number | undefined,
  srcLines: string[] | undefined,
): AgentAst["prompt"] {
  // Map a character offset in the (dedented) block text to a source location.
  // The block body starts one line below its `key: |` header, and the dedent
  // preserves line count, so block line k is source line blockLine + 1 + k.
  const locFor = (offset: number): DiagnosticLoc => {
    if (blockLine === undefined) return {};
    if (srcLines === undefined) return { line: blockLine };
    const lineNo = blockLine + 1 + countNewlines(text, offset);
    const srcText = srcLines[lineNo - 1] ?? "";
    const trimmed = srcText.trim();
    if (trimmed === "") return { line: lineNo };
    return {
      line: lineNo,
      col: srcText.length - srcText.trimStart().length + 1,
      length: trimmed.length,
    };
  };

  const ctx: PromptScopeCtx = {
    inputTypes: new Map(inputs.map((f) => [f.name, f.type])),
    file,
    diagnostics,
    header: { line: blockLine },
  };
  const { segments, errors } = parsePromptTemplate(text);
  for (const e of errors) {
    diagnostics.push(
      errorDiagnostic("TOA302", e.message, file, locFor(e.offset)),
    );
  }
  validatePromptSegments(segments, new Map(), ctx);
  return segments;
}

/** Count newline characters in `text` before `offset` (0-based line index). */
function countNewlines(text: string, offset: number): number {
  let n = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") n++;
  }
  return n;
}

interface PromptScopeCtx {
  inputTypes: Map<string, ToaType>;
  file: string;
  diagnostics: Diagnostic[];
  /** Location of the block's `key: |` header — the anchor for semantic errors. */
  header: DiagnosticLoc;
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
  // Suggest the closest declared input when a `{inputs.X}` name looks like a typo.
  let help: string | undefined;
  if (path[0] === "inputs" && path.length >= 2) {
    const hint = closest(path[1]!, ctx.inputTypes.keys());
    if (hint !== undefined) help = `did you mean \`inputs.${hint}\`?`;
  }
  ctx.diagnostics.push(
    errorDiagnostic(
      "TOA301",
      `invalid interpolation {${path.join(".")}} (unknown name or field)`,
      ctx.file,
      { ...ctx.header, ...(help !== undefined ? { help } : {}) },
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
            ctx.header,
          ),
        );
        continue;
      }
      const elementType: ToaType = sourceType.fields
        ? { base: sourceType.base, array: false, fields: sourceType.fields }
        : { base: sourceType.base, array: false };
      const inner = new Map(vars);
      if (seg.item.kind === "name") {
        inner.set(seg.item.name, elementType);
      } else if (
        elementType.base !== "object" ||
        elementType.fields === undefined
      ) {
        ctx.diagnostics.push(
          errorDiagnostic(
            "TOA306",
            `cannot destructure {#each ${seg.source.join(".")}}: its elements are not objects`,
            ctx.file,
            ctx.header,
          ),
        );
      } else {
        for (const field of seg.item.fields) {
          const decl = elementType.fields.find((f) => f.name === field);
          if (decl === undefined) {
            ctx.diagnostics.push(
              errorDiagnostic(
                "TOA306",
                `{#each … as { ${field} }} — the element has no field "${field}"`,
                ctx.file,
                ctx.header,
              ),
            );
          } else {
            inner.set(field, decl.type);
          }
        }
      }
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
            ctx.header,
          ),
        );
      }
      validatePromptSegments(seg.then, vars, ctx);
      validatePromptSegments(seg.else, vars, ctx);
    }
  }
}

const ENUM_VALUE = /^[A-Za-z0-9_-]+$/;

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
  // Enum: pipe-separated literal values, e.g. `draft|final` (2+ values).
  if (!rest.startsWith("{") && rest.includes("|")) {
    const values = rest.split("|").map((v) => v.trim());
    if (values.length < 2 || !values.every((v) => ENUM_VALUE.test(v))) {
      return undefined;
    }
    if (new Set(values).size !== values.length) {
      return undefined;
    }
    return { base: "enum", array, values };
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
