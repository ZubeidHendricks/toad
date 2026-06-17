/**
 * A standalone Language Server for `.agent` files, speaking the Language Server
 * Protocol over JSON-RPC. It reuses the very same compiler front-end as `toac`
 * (`analyze`/`compile` for diagnostics, `formatAgent` for formatting, and the
 * `editor.ts` services for hover/completion), so every LSP-capable editor —
 * Neovim, Helix, Zed, Emacs, JetBrains — gets exactly what `toac check` and the
 * VS Code extension already give.
 *
 * The wire protocol is implemented by hand (no `vscode-languageserver`
 * dependency) to keep `toad-compiler` lean and bundle-safe: this module is only
 * loaded by `toac lsp`, never by the browser playground.
 *
 * `createServer()` is a pure, synchronous message handler — given one incoming
 * JSON-RPC message it returns the outgoing messages — which makes the server
 * exhaustively testable without spawning a process. `runLanguageServer()` wires
 * that handler to stdio.
 */
import type { Readable, Writable } from "node:stream";
import { compile, COMPILER_VERSION } from "./index.js";
import type { Diagnostic } from "./diagnostics.js";
import { completionsAt, hoverAt, type CompletionItem } from "./editor.js";
import { formatAgent } from "./format.js";

const SERVER_VERSION = COMPILER_VERSION;

/** LSP `DiagnosticSeverity`. */
const SEVERITY = { error: 1, warning: 2 } as const;
/** LSP `CompletionItemKind` (the subset we emit). */
const COMPLETION_KIND = { property: 10, keyword: 14, variable: 6 } as const;
/** LSP `InsertTextFormat`. */
const PLAIN_TEXT = 1;
const SNIPPET = 2;

interface RpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

interface Position {
  line: number;
  character: number;
}

/** Outgoing messages, plus a flag set when the client asked us to exit. */
export interface HandleResult {
  messages: RpcMessage[];
  exit?: boolean;
}

/** A position (1-based, in `Diagnostic`) mapped to a 0-based LSP position. */
function lspRange(d: Diagnostic, text: string) {
  const line = Math.max((d.line ?? 1) - 1, 0);
  const character = Math.max((d.col ?? 1) - 1, 0);
  const srcLine = text.split("\n")[line] ?? "";
  // Underline the caret width when known, else to the end of the line (min 1),
  // so every diagnostic is visibly anchored even without a span.
  const width =
    d.length && d.length > 0
      ? d.length
      : Math.max(srcLine.length - character, 1);
  return {
    start: { line, character },
    end: { line, character: character + width },
  };
}

/** Map a compiler `Diagnostic` to an LSP `Diagnostic`. */
function toLspDiagnostic(d: Diagnostic, text: string) {
  const message = d.help ? `${d.message}\n${d.help}` : d.message;
  return {
    range: lspRange(d, text),
    severity: SEVERITY[d.severity],
    code: d.code,
    source: "toac",
    message,
  };
}

/** Map an editor-services completion item to an LSP `CompletionItem`. */
function toLspCompletion(item: CompletionItem) {
  const lsp: Record<string, unknown> = {
    label: item.label,
    kind: COMPLETION_KIND[item.kind],
    insertTextFormat: item.snippet ? SNIPPET : PLAIN_TEXT,
  };
  if (item.detail) lsp.detail = item.detail;
  if (item.documentation)
    lsp.documentation = { kind: "markdown", value: item.documentation };
  if (item.insertText) lsp.insertText = item.insertText;
  return lsp;
}

/** `file://…` (or a bare path) to a filesystem path, for diagnostics. */
function uriToPath(uri: string): string {
  if (uri.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(uri).pathname);
    } catch {
      return uri;
    }
  }
  return uri;
}

/** End-of-document position, for whole-document formatting edits. */
function endPosition(text: string): Position {
  const lines = text.split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

/**
 * A synchronous LSP message handler over an in-memory document store. Drive it
 * one message at a time; it returns the messages to send back. Pure except for
 * the document store it owns, which is exactly what makes it testable.
 */
export function createServer() {
  const docs = new Map<string, string>();

  const response = (id: RpcMessage["id"], result: unknown): RpcMessage => ({
    jsonrpc: "2.0",
    id,
    result,
  });

  const publishDiagnostics = (uri: string): RpcMessage => {
    const text = docs.get(uri) ?? "";
    const { diagnostics } = compile(text, uriToPath(uri));
    return {
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: {
        uri,
        diagnostics: diagnostics.map((d) => toLspDiagnostic(d, text)),
      },
    };
  };

  function handle(msg: RpcMessage): HandleResult {
    switch (msg.method) {
      case "initialize":
        return {
          messages: [
            response(msg.id, {
              capabilities: {
                textDocumentSync: 1, // Full
                hoverProvider: true,
                completionProvider: { triggerCharacters: ["{", "."] },
                documentFormattingProvider: true,
              },
              serverInfo: { name: "toad-lsp", version: SERVER_VERSION },
            }),
          ],
        };

      case "initialized":
        return { messages: [] };

      case "shutdown":
        return { messages: [response(msg.id, null)] };

      case "exit":
        return { messages: [], exit: true };

      case "textDocument/didOpen": {
        const p = msg.params as {
          textDocument: { uri: string; text: string };
        };
        docs.set(p.textDocument.uri, p.textDocument.text);
        return { messages: [publishDiagnostics(p.textDocument.uri)] };
      }

      case "textDocument/didChange": {
        const p = msg.params as {
          textDocument: { uri: string };
          contentChanges: { text: string }[];
        };
        // Full sync: the last change carries the entire document.
        const last = p.contentChanges[p.contentChanges.length - 1];
        if (last) docs.set(p.textDocument.uri, last.text);
        return { messages: [publishDiagnostics(p.textDocument.uri)] };
      }

      case "textDocument/didClose": {
        const p = msg.params as { textDocument: { uri: string } };
        docs.delete(p.textDocument.uri);
        // Clear the editor's problem markers for the closed file.
        return {
          messages: [
            {
              jsonrpc: "2.0",
              method: "textDocument/publishDiagnostics",
              params: { uri: p.textDocument.uri, diagnostics: [] },
            },
          ],
        };
      }

      case "textDocument/hover": {
        const p = msg.params as {
          textDocument: { uri: string };
          position: Position;
        };
        const text = docs.get(p.textDocument.uri) ?? "";
        const hover = hoverAt(text, p.position.line, p.position.character);
        return {
          messages: [
            response(
              msg.id,
              hover
                ? { contents: { kind: "markdown", value: hover.contents } }
                : null,
            ),
          ],
        };
      }

      case "textDocument/completion": {
        const p = msg.params as {
          textDocument: { uri: string };
          position: Position;
        };
        const text = docs.get(p.textDocument.uri) ?? "";
        const items = completionsAt(
          text,
          p.position.line,
          p.position.character,
          uriToPath(p.textDocument.uri),
        );
        return { messages: [response(msg.id, items.map(toLspCompletion))] };
      }

      case "textDocument/formatting": {
        const p = msg.params as { textDocument: { uri: string } };
        const text = docs.get(p.textDocument.uri) ?? "";
        const { code, changed } = formatAgent(
          text,
          uriToPath(p.textDocument.uri),
        );
        if (code === undefined || !changed) {
          return { messages: [response(msg.id, [])] };
        }
        return {
          messages: [
            response(msg.id, [
              {
                range: {
                  start: { line: 0, character: 0 },
                  end: endPosition(text),
                },
                newText: code,
              },
            ]),
          ],
        };
      }

      default:
        // Unknown request: reply with a "method not found" error so the client
        // isn't left waiting. Unknown notifications (no id) are ignored.
        if (msg.id !== undefined) {
          return {
            messages: [
              {
                jsonrpc: "2.0",
                id: msg.id,
                error: {
                  code: -32601,
                  message: `method not found: ${msg.method}`,
                },
              },
            ],
          };
        }
        return { messages: [] };
    }
  }

  return { handle, docs };
}

/** Serialize a message with the LSP `Content-Length` header framing. */
export function encodeMessage(msg: RpcMessage): string {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

/**
 * Pull complete `Content-Length`-framed messages out of a growing buffer,
 * returning the parsed messages and the unconsumed remainder. Tolerant of
 * partial frames (returns them in the remainder for the next read).
 */
export function decodeMessages(buffer: string): {
  messages: RpcMessage[];
  rest: string;
} {
  const messages: RpcMessage[] = [];
  let rest = buffer;
  for (;;) {
    const headerEnd = rest.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const header = rest.slice(0, headerEnd);
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      // Malformed header: drop it and resync past the separator.
      rest = rest.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    // Byte length matters: the body may contain multi-byte UTF-8.
    const remainder = Buffer.from(rest.slice(bodyStart), "utf8");
    if (remainder.byteLength < length) break; // wait for more input
    const body = remainder.subarray(0, length).toString("utf8");
    rest = remainder.subarray(length).toString("utf8");
    try {
      messages.push(JSON.parse(body) as RpcMessage);
    } catch {
      // Skip an unparseable body; the framing is still intact.
    }
  }
  return { messages, rest };
}

/**
 * Run the language server over a pair of streams (stdin/stdout by default).
 * Resolves when the client sends `exit`.
 */
export function runLanguageServer(
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): Promise<void> {
  const server = createServer();
  let buffer = "";

  return new Promise((resolve) => {
    const send = (msg: RpcMessage) => output.write(encodeMessage(msg));

    input.setEncoding("utf8");
    input.on("data", (chunk: string) => {
      buffer += chunk;
      const { messages, rest } = decodeMessages(buffer);
      buffer = rest;
      for (const msg of messages) {
        const { messages: out, exit } = server.handle(msg);
        for (const m of out) send(m);
        if (exit) {
          resolve();
          return;
        }
      }
    });
    input.on("close", () => resolve());
  });
}
