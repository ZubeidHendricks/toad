import type { AgentAst } from "./ast.js";
import type { Diagnostic } from "./diagnostics.js";
import { preprocess } from "./preprocess.js";
import { decodeToon } from "./toon.js";
import { validate } from "./validate.js";

export interface AnalyzeResult {
  ast?: AgentAst;
  diagnostics: Diagnostic[];
}

/**
 * The compiler front-end: `.agent` source -> preprocess (lower superset) ->
 * TOON decode -> validate -> typed `AgentAst`. Stops at the first stage that
 * produces errors. See `_bmad-output/architecture.md` §3.
 */
export function analyze(source: string, file: string): AnalyzeResult {
  const pre = preprocess(source, file);
  if (pre.diagnostics.length > 0) {
    return { diagnostics: pre.diagnostics };
  }

  const decoded = decodeToon(pre.toon, file);
  if (decoded.value === undefined || decoded.diagnostics.length > 0) {
    return { diagnostics: decoded.diagnostics };
  }

  return validate(decoded.value, file, pre.keyLines, source);
}
