import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  createServer,
  decodeMessages,
  encodeMessage,
  runLanguageServer,
} from "./lsp.js";

const VALID = "agent: ping\nmodel: m\nprompt: hi\n";
const INVALID = "model: m\n"; // missing the required `agent` key (TOA203)
const URI = "file:///tmp/ping.agent";

function open(
  server: ReturnType<typeof createServer>,
  uri: string,
  text: string,
) {
  return server.handle({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: { textDocument: { uri, text } },
  });
}

describe("createServer — lifecycle", () => {
  it("advertises capabilities on initialize", () => {
    const server = createServer();
    const { messages } = server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    });
    const caps = (messages[0]!.result as any).capabilities;
    expect(caps.textDocumentSync).toBe(1);
    expect(caps.hoverProvider).toBe(true);
    expect(caps.documentFormattingProvider).toBe(true);
    expect(caps.completionProvider.triggerCharacters).toContain("{");
  });

  it("signals exit", () => {
    const server = createServer();
    expect(server.handle({ jsonrpc: "2.0", method: "exit" }).exit).toBe(true);
  });

  it("replies method-not-found to an unknown request", () => {
    const server = createServer();
    const { messages } = server.handle({
      jsonrpc: "2.0",
      id: 9,
      method: "textDocument/references",
    });
    expect((messages[0]!.error as any).code).toBe(-32601);
  });
});

describe("createServer — diagnostics", () => {
  it("publishes no diagnostics for a valid document", () => {
    const server = createServer();
    const { messages } = open(server, URI, VALID);
    expect(messages[0]!.method).toBe("textDocument/publishDiagnostics");
    expect((messages[0]!.params as any).diagnostics).toEqual([]);
  });

  it("publishes a located diagnostic for an invalid document", () => {
    const server = createServer();
    const { messages } = open(server, URI, INVALID);
    const diags = (messages[0]!.params as any).diagnostics;
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].code).toBe("TOA203");
    expect(diags[0].severity).toBe(1); // error
    expect(diags[0].source).toBe("toac");
    // 0-based range with a visible (>= 1 wide) span
    expect(diags[0].range.start.line).toBeGreaterThanOrEqual(0);
    expect(diags[0].range.end.character).toBeGreaterThan(
      diags[0].range.start.character,
    );
  });

  it("re-validates on didChange (full sync)", () => {
    const server = createServer();
    open(server, URI, INVALID);
    const { messages } = server.handle({
      jsonrpc: "2.0",
      method: "textDocument/didChange",
      params: { textDocument: { uri: URI }, contentChanges: [{ text: VALID }] },
    });
    expect((messages[0]!.params as any).diagnostics).toEqual([]);
  });

  it("clears diagnostics on didClose", () => {
    const server = createServer();
    open(server, URI, INVALID);
    const { messages } = server.handle({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: URI } },
    });
    expect((messages[0]!.params as any).diagnostics).toEqual([]);
    expect(server.docs.has(URI)).toBe(false);
  });
});

describe("createServer — hover, completion, formatting", () => {
  it("returns hover for a top-level key", () => {
    const server = createServer();
    open(server, URI, VALID);
    const { messages } = server.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "textDocument/hover",
      params: {
        textDocument: { uri: URI },
        position: { line: 0, character: 2 },
      },
    });
    expect((messages[0]!.result as any).contents.value).toContain("**agent**");
  });

  it("returns completions as LSP items with kinds and snippet format", () => {
    const server = createServer();
    open(server, URI, "pro");
    const { messages } = server.handle({
      jsonrpc: "2.0",
      id: 3,
      method: "textDocument/completion",
      params: {
        textDocument: { uri: URI },
        position: { line: 0, character: 3 },
      },
    });
    const items = messages[0]!.result as any[];
    const prompt = items.find((i) => i.label === "prompt");
    expect(prompt.kind).toBe(10); // Property
    expect(prompt.insertTextFormat).toBe(2); // Snippet
  });

  it("returns a whole-document edit for an unformatted file", () => {
    const server = createServer();
    const messy = "agent:    ping\nmodel: m\nprompt: hi\n";
    open(server, URI, messy);
    const { messages } = server.handle({
      jsonrpc: "2.0",
      id: 4,
      method: "textDocument/formatting",
      params: { textDocument: { uri: URI } },
    });
    const edits = messages[0]!.result as any[];
    expect(edits.length).toBe(1);
    expect(edits[0].newText).toContain("agent: ping");
    expect(edits[0].range.start).toEqual({ line: 0, character: 0 });
  });

  it("returns no edits for an already-formatted file", () => {
    const server = createServer();
    open(server, URI, VALID);
    const { messages } = server.handle({
      jsonrpc: "2.0",
      id: 5,
      method: "textDocument/formatting",
      params: { textDocument: { uri: URI } },
    });
    expect(messages[0]!.result).toEqual([]);
  });
});

describe("message framing", () => {
  it("round-trips through encode/decode", () => {
    const msg = { jsonrpc: "2.0" as const, id: 1, method: "initialize" };
    const { messages, rest } = decodeMessages(encodeMessage(msg));
    expect(messages).toEqual([msg]);
    expect(rest).toBe("");
  });

  it("decodes several concatenated frames", () => {
    const a = encodeMessage({ jsonrpc: "2.0", id: 1, method: "a" });
    const b = encodeMessage({ jsonrpc: "2.0", id: 2, method: "b" });
    const { messages } = decodeMessages(a + b);
    expect(messages.map((m) => m.method)).toEqual(["a", "b"]);
  });

  it("holds back a partial frame for the next read", () => {
    const full = encodeMessage({ jsonrpc: "2.0", id: 1, method: "a" });
    const cut = full.slice(0, full.length - 5);
    const { messages, rest } = decodeMessages(cut);
    expect(messages).toEqual([]);
    expect(rest).toBe(cut);
  });

  it("handles a multi-byte UTF-8 body by byte length", () => {
    const msg = { jsonrpc: "2.0" as const, id: 1, method: "δ — ✓" };
    const { messages } = decodeMessages(encodeMessage(msg));
    expect(messages[0]!.method).toBe("δ — ✓");
  });
});

describe("runLanguageServer over streams", () => {
  it("responds to initialize and exits on exit", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.setEncoding("utf8");
    output.on("data", (c: string) => chunks.push(c));

    const done = runLanguageServer(input, output);
    input.write(
      encodeMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
    );
    input.write(encodeMessage({ jsonrpc: "2.0", method: "exit" }));
    await done;

    const { messages } = decodeMessages(chunks.join(""));
    expect((messages[0]!.result as any).serverInfo.name).toBe("toad-lsp");
  });
});
