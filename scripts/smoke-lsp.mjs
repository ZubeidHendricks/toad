/**
 * Smoke test for the `toac lsp` language server — spawns the *built* binary and
 * drives it over real stdio, the way an editor would. The in-process unit tests
 * (`lsp.test.ts`) cover the protocol; this catches what they can't: a broken
 * `bin.js`, a failed lazy import of `lsp.js`, or a packaging regression that
 * only shows up once the compiler is built and run as a subprocess.
 *
 *   pnpm build && node scripts/smoke-lsp.mjs
 *
 * Exits 0 when the server initializes and publishes the expected diagnostic,
 * non-zero (with a reason) otherwise. No dependencies, no API, no network.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(
  new URL("../packages/compiler/dist/bin.js", import.meta.url),
);
const TIMEOUT_MS = 10_000;

/** Frame a JSON-RPC message with the LSP `Content-Length` header. */
function frame(obj) {
  const body = JSON.stringify(obj);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

/** Pull complete `Content-Length`-framed messages out of a buffer. */
function decode(buffer) {
  const messages = [];
  let rest = buffer;
  for (;;) {
    const headerEnd = rest.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const match = /Content-Length:\s*(\d+)/i.exec(rest.slice(0, headerEnd));
    if (!match) {
      rest = rest.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const remainder = Buffer.from(rest.slice(headerEnd + 4), "utf8");
    if (remainder.byteLength < length) break;
    messages.push(JSON.parse(remainder.subarray(0, length).toString("utf8")));
    rest = remainder.subarray(length).toString("utf8");
  }
  return { messages, rest };
}

function fail(reason) {
  console.error(`smoke-lsp: FAIL — ${reason}`);
  process.exit(1);
}

const child = spawn(process.execPath, [BIN, "lsp"], {
  stdio: ["pipe", "pipe", "inherit"],
});

let out = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (c) => (out += c));
child.on("error", (err) => fail(`could not spawn ${BIN}: ${err.message}`));

const timer = setTimeout(() => {
  child.kill("SIGKILL");
  fail(`server did not exit within ${TIMEOUT_MS}ms`);
}, TIMEOUT_MS);

child.on("close", (code) => {
  clearTimeout(timer);
  if (code !== 0 && code !== null) fail(`server exited with code ${code}`);

  const { messages } = decode(out);

  const init = messages.find((m) => m.result && m.result.capabilities);
  if (!init) fail("no initialize response with capabilities");
  if (init.result.serverInfo?.name !== "toad-lsp") {
    fail(`unexpected serverInfo: ${JSON.stringify(init.result.serverInfo)}`);
  }
  const caps = init.result.capabilities;
  if (caps.textDocumentSync !== 1 || !caps.hoverProvider) {
    fail(`missing expected capabilities: ${JSON.stringify(caps)}`);
  }

  const diags = messages.find(
    (m) => m.method === "textDocument/publishDiagnostics",
  );
  if (!diags) fail("no publishDiagnostics notification");
  const codes = (diags.params.diagnostics ?? []).map((d) => d.code);
  if (!codes.includes("TOA203")) {
    fail(`expected a TOA203 diagnostic, got: ${JSON.stringify(codes)}`);
  }

  console.log("smoke-lsp: OK — initialized and diagnosed an invalid agent");
  process.exit(0);
});

// initialize -> open an invalid doc (missing the required `agent` key) -> exit.
child.stdin.write(
  frame({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
);
child.stdin.write(
  frame({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: { uri: "file:///smoke.agent", text: "model: m\n" },
    },
  }),
);
child.stdin.write(frame({ jsonrpc: "2.0", method: "exit" }));
