import { decode, ToonDecodeError } from "@toon-format/toon";
import type { JsonValue } from "@toon-format/toon";
import { errorDiagnostic, type Diagnostic } from "./diagnostics.js";

export interface DecodeToonResult {
  /** Present only when decoding succeeds. */
  value?: JsonValue;
  diagnostics: Diagnostic[];
}

/**
 * Decode TOON source into a JSON value using the reference `@toon-format/toon`
 * decoder — the structural data layer of every `.agent` file. Decode failures
 * become located diagnostics rather than thrown errors (architecture.md §3,
 * NFR4). This wrapper assumes the source is already valid TOON; the Toa
 * superset (block scalars) is lowered upstream in the preprocessor (S1.2).
 */
export function decodeToon(source: string, file: string): DecodeToonResult {
  try {
    return { value: decode(source), diagnostics: [] };
  } catch (err) {
    if (err instanceof ToonDecodeError) {
      return {
        diagnostics: [
          errorDiagnostic("TOA101", stripLinePrefix(err.message), file, {
            line: err.line,
          }),
        ],
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { diagnostics: [errorDiagnostic("TOA101", message, file)] };
  }
}

// The decoder prefixes messages with "Line N: "; we carry the line separately.
function stripLinePrefix(message: string): string {
  return message.replace(/^Line \d+:\s*/, "");
}
