var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// editors/vscode/src/extension.mjs
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"), 1);

// packages/compiler/dist/preprocess.js
var BLOCK_HEADER = /^([A-Za-z_][A-Za-z0-9_.]*|"(?:[^"\\]|\\.)*"): *\| *$/;
var TOP_LEVEL_KEY = /^([A-Za-z_][A-Za-z0-9_.]*|"(?:[^"\\]|\\.)*"):/;
function preprocess(source, _file) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const keyLines = /* @__PURE__ */ new Map();
  const diagnostics = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const indent = leadingSpaces(raw);
    const content = raw.slice(indent);
    if (indent === 0) {
      const keyMatch = TOP_LEVEL_KEY.exec(content);
      if (keyMatch && !keyLines.has(keyMatch[1])) {
        keyLines.set(keyMatch[1], i + 1);
      }
    }
    const header = BLOCK_HEADER.exec(content);
    if (header) {
      const key = header[1];
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const line = lines[j] ?? "";
        if (line.trim() === "" || leadingSpaces(line) > indent) {
          body.push(line);
        } else {
          break;
        }
      }
      while (body.length > 0 && (body[body.length - 1] ?? "").trim() === "") {
        body.pop();
      }
      const nonBlankIndents = body.filter((l) => l.trim() !== "").map(leadingSpaces);
      const base = nonBlankIndents.length > 0 ? Math.min(...nonBlankIndents) : 0;
      const text = body.map((l) => l.trim() === "" ? "" : l.slice(base)).join("\n");
      out.push(`${" ".repeat(indent)}${key}: "${toonEscape(text)}"`);
      i = j;
      continue;
    }
    out.push(raw);
    i++;
  }
  return { toon: out.join("\n"), keyLines, diagnostics };
}
function leadingSpaces(line) {
  let n = 0;
  while (n < line.length && line[n] === " ") {
    n++;
  }
  return n;
}
function toonEscape(s) {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\\") {
      out += "\\\\";
    } else if (ch === '"') {
      out += '\\"';
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "	") {
      out += "\\t";
    } else if (code < 32) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
    } else {
      out += ch;
    }
  }
  return out;
}

// node_modules/.pnpm/@toon-format+toon@2.3.0/node_modules/@toon-format/toon/dist/index.mjs
var DELIMITERS = {
  comma: ",",
  tab: "	",
  pipe: "|"
};
var DEFAULT_DELIMITER = DELIMITERS.comma;
function unescapeString(value) {
  let unescaped = "";
  let i = 0;
  while (i < value.length) {
    if (value[i] === "\\") {
      if (i + 1 >= value.length) throw new SyntaxError("Invalid escape sequence: backslash at end of string");
      const next = value[i + 1];
      if (next === "n") {
        unescaped += "\n";
        i += 2;
        continue;
      }
      if (next === "t") {
        unescaped += "	";
        i += 2;
        continue;
      }
      if (next === "r") {
        unescaped += "\r";
        i += 2;
        continue;
      }
      if (next === "\\") {
        unescaped += "\\";
        i += 2;
        continue;
      }
      if (next === '"') {
        unescaped += '"';
        i += 2;
        continue;
      }
      if (next === "u") {
        if (i + 6 > value.length) throw new SyntaxError(`Invalid escape sequence: truncated \\u escape at "${value.slice(i, i + 6)}"`);
        const hex = value.slice(i + 2, i + 6);
        if (!/^[0-9a-f]{4}$/i.test(hex)) throw new SyntaxError(`Invalid escape sequence: \\u must be followed by 4 hex digits, got "${hex}"`);
        const codeUnit = Number.parseInt(hex, 16);
        if (codeUnit >= 55296 && codeUnit <= 57343) throw new SyntaxError(`Invalid escape sequence: \\u${hex} is a lone surrogate; supplementary code points MUST appear as literal UTF-8`);
        unescaped += String.fromCodePoint(codeUnit);
        i += 6;
        continue;
      }
      throw new SyntaxError(`Invalid escape sequence: \\${next}`);
    }
    unescaped += value[i];
    i++;
  }
  return unescaped;
}
function findClosingQuote(content, start) {
  let i = start + 1;
  while (i < content.length) {
    if (content[i] === "\\" && i + 1 < content.length) {
      i += 2;
      continue;
    }
    if (content[i] === '"') return i;
    i++;
  }
  return -1;
}
function findUnquotedChar(content, char, start = 0) {
  let inQuotes = false;
  let i = start;
  while (i < content.length) {
    if (content[i] === "\\" && i + 1 < content.length && inQuotes) {
      i += 2;
      continue;
    }
    if (content[i] === '"') {
      inQuotes = !inQuotes;
      i++;
      continue;
    }
    if (content[i] === char && !inQuotes) return i;
    i++;
  }
  return -1;
}
var ToonDecodeError = class extends SyntaxError {
  constructor(message, context) {
    const prefix = context?.line !== void 0 ? `Line ${context.line}: ` : "";
    super(prefix + message, context?.cause !== void 0 ? { cause: context.cause } : void 0);
    this.name = "ToonDecodeError";
    this.line = context?.line;
    this.source = context?.source;
  }
};
function withLine(line, fn) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ToonDecodeError) throw error;
    if (error instanceof Error) throw new ToonDecodeError(error.message, {
      line: line.lineNumber,
      source: line.raw,
      cause: error
    });
    throw error;
  }
}
var NUMERIC_LITERAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i;
function isBooleanOrNullLiteral(token) {
  return token === "true" || token === "false" || token === "null";
}
function isNumericLiteral(token) {
  if (!token) return false;
  if (!NUMERIC_LITERAL_PATTERN.test(token)) return false;
  const numericValue = Number(token);
  return !Number.isNaN(numericValue) && Number.isFinite(numericValue);
}
function parseArrayHeaderLine(content, defaultDelimiter, strict = false) {
  const trimmedToken = content.trimStart();
  let bracketStart = -1;
  if (trimmedToken.startsWith('"')) {
    const closingQuoteIndex = findClosingQuote(trimmedToken, 0);
    if (closingQuoteIndex === -1) return;
    if (!trimmedToken.slice(closingQuoteIndex + 1).startsWith("[")) return;
    const keyEndIndex = content.length - trimmedToken.length + closingQuoteIndex + 1;
    bracketStart = content.indexOf("[", keyEndIndex);
  } else bracketStart = content.indexOf("[");
  if (bracketStart === -1) return;
  const bracketEnd = content.indexOf("]", bracketStart);
  if (bracketEnd === -1) return;
  let colonIndex = bracketEnd + 1;
  let braceEnd = colonIndex;
  const braceStart = content.indexOf("{", bracketEnd);
  if (braceStart !== -1 && braceStart < content.indexOf(":", bracketEnd)) {
    const gapBeforeBrace = content.slice(bracketEnd + 1, braceStart);
    if (gapBeforeBrace !== "") {
      if (strict) {
        const trimmedGap = gapBeforeBrace.trim();
        throw new SyntaxError(trimmedGap === "" ? `Unexpected whitespace between bracket and fields segment` : `Unexpected content "${trimmedGap}" between bracket and fields segment`);
      }
      return;
    }
    const foundBraceEnd = content.indexOf("}", braceStart);
    if (foundBraceEnd !== -1) braceEnd = foundBraceEnd + 1;
  }
  colonIndex = content.indexOf(":", Math.max(bracketEnd, braceEnd));
  if (colonIndex === -1) return;
  const gapStart = Math.max(bracketEnd + 1, braceEnd);
  const gapBeforeColon = content.slice(gapStart, colonIndex);
  if (gapBeforeColon !== "") {
    if (strict) {
      const trimmedGap = gapBeforeColon.trim();
      throw new SyntaxError(trimmedGap === "" ? `Unexpected whitespace between bracket segment and colon` : `Unexpected content "${trimmedGap}" between bracket segment and colon`);
    }
    return;
  }
  let key;
  if (bracketStart > 0) {
    const rawKey = content.slice(0, bracketStart).trim();
    key = rawKey.startsWith('"') ? parseStringLiteral(rawKey) : rawKey;
  }
  const afterColon = content.slice(colonIndex + 1).trim();
  const bracketContent = content.slice(bracketStart + 1, bracketEnd);
  let parsedBracket;
  try {
    parsedBracket = parseBracketSegment(bracketContent, defaultDelimiter);
  } catch (error) {
    if (strict) throw error;
    return;
  }
  const { length, delimiter } = parsedBracket;
  let fields;
  if (braceStart !== -1 && braceStart < colonIndex) {
    const foundBraceEnd = content.indexOf("}", braceStart);
    if (foundBraceEnd !== -1 && foundBraceEnd < colonIndex) {
      const fieldsContent = content.slice(braceStart + 1, foundBraceEnd);
      const mismatchedDelimiter = findUnquotedMismatchedDelimiter(fieldsContent, delimiter);
      if (mismatchedDelimiter !== void 0) {
        if (strict) throw new SyntaxError(`Header delimiter mismatch: bracket declares "${formatDelimiter(delimiter)}" but fields segment contains unquoted "${formatDelimiter(mismatchedDelimiter)}"`);
        return;
      }
      fields = parseDelimitedValues(fieldsContent, delimiter).map((field) => parseStringLiteral(field.trim()));
    }
  }
  return {
    header: {
      key,
      length,
      delimiter,
      fields
    },
    inlineValues: afterColon || void 0
  };
}
var BRACKET_LENGTH_PATTERN = /^(?:0|[1-9]\d*)$/;
function parseBracketSegment(seg, defaultDelimiter) {
  let content = seg;
  let delimiter = defaultDelimiter;
  if (content.endsWith("	")) {
    delimiter = DELIMITERS.tab;
    content = content.slice(0, -1);
  } else if (content.endsWith("|")) {
    delimiter = DELIMITERS.pipe;
    content = content.slice(0, -1);
  }
  if (!BRACKET_LENGTH_PATTERN.test(content)) throw new SyntaxError(`Invalid array length: "${seg}" (expected non-negative integer with no leading zeros)`);
  return {
    length: Number.parseInt(content, 10),
    delimiter
  };
}
var DELIMITER_CANDIDATES = [
  ",",
  "	",
  "|"
];
function findUnquotedMismatchedDelimiter(content, activeDelimiter) {
  for (const candidate of DELIMITER_CANDIDATES) {
    if (candidate === activeDelimiter) continue;
    if (findUnquotedChar(content, candidate) !== -1) return candidate;
  }
}
function formatDelimiter(delimiter) {
  if (delimiter === "	") return "\\t";
  return delimiter;
}
function parseDelimitedValues(input, delimiter) {
  const values = [];
  let valueBuffer = "";
  let inQuotes = false;
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (char === "\\" && i + 1 < input.length && inQuotes) {
      valueBuffer += char + input[i + 1];
      i += 2;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      valueBuffer += char;
      i++;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      values.push(valueBuffer.trim());
      valueBuffer = "";
      i++;
      continue;
    }
    valueBuffer += char;
    i++;
  }
  if (valueBuffer || values.length > 0) values.push(valueBuffer.trim());
  return values;
}
function mapRowValuesToPrimitives(values) {
  return values.map((v) => parsePrimitiveToken(v));
}
function parsePrimitiveToken(token) {
  const trimmedToken = token.trim();
  if (!trimmedToken) return "";
  if (trimmedToken.startsWith('"')) return parseStringLiteral(trimmedToken);
  if (isBooleanOrNullLiteral(trimmedToken)) {
    if (trimmedToken === "true") return true;
    if (trimmedToken === "false") return false;
    if (trimmedToken === "null") return null;
  }
  if (isNumericLiteral(trimmedToken)) {
    const parsedNumber = Number.parseFloat(trimmedToken);
    return Object.is(parsedNumber, -0) ? 0 : parsedNumber;
  }
  return trimmedToken;
}
function parseStringLiteral(token) {
  const trimmedToken = token.trim();
  if (trimmedToken.startsWith('"')) {
    const closingQuoteIndex = findClosingQuote(trimmedToken, 0);
    if (closingQuoteIndex === -1) throw new SyntaxError("Unterminated string: missing closing quote");
    if (closingQuoteIndex !== trimmedToken.length - 1) throw new SyntaxError("Unexpected characters after closing quote");
    return unescapeString(trimmedToken.slice(1, closingQuoteIndex));
  }
  return trimmedToken;
}
function parseUnquotedKey(content, start) {
  let parsePosition = start;
  while (parsePosition < content.length && content[parsePosition] !== ":") parsePosition++;
  if (parsePosition >= content.length || content[parsePosition] !== ":") throw new SyntaxError("Missing colon after key");
  const key = content.slice(start, parsePosition).trim();
  parsePosition++;
  return {
    key,
    end: parsePosition
  };
}
function parseQuotedKey(content, start) {
  const closingQuoteIndex = findClosingQuote(content, start);
  if (closingQuoteIndex === -1) throw new SyntaxError("Unterminated quoted key");
  const key = unescapeString(content.slice(start + 1, closingQuoteIndex));
  let parsePosition = closingQuoteIndex + 1;
  if (parsePosition >= content.length || content[parsePosition] !== ":") throw new SyntaxError("Missing colon after key");
  parsePosition++;
  return {
    key,
    end: parsePosition
  };
}
function parseKeyToken(content, start) {
  const isQuoted = content[start] === '"';
  return {
    ...isQuoted ? parseQuotedKey(content, start) : parseUnquotedKey(content, start),
    isQuoted
  };
}
function isArrayHeaderContent(content) {
  return content.trim().startsWith("[") && findUnquotedChar(content, ":") !== -1;
}
function isKeyValueContent(content) {
  return findUnquotedChar(content, ":") !== -1;
}
function createScanState() {
  return {
    lineNumber: 0,
    blankLines: []
  };
}
function parseLineIncremental(raw, state, indentSize, strict) {
  state.lineNumber++;
  const lineNumber = state.lineNumber;
  let indent = 0;
  while (indent < raw.length && raw[indent] === " ") indent++;
  const content = raw.slice(indent);
  if (!content.trim()) {
    const depth2 = computeDepthFromIndent(indent, indentSize);
    state.blankLines.push({
      lineNumber,
      indent,
      depth: depth2
    });
    return;
  }
  const depth = computeDepthFromIndent(indent, indentSize);
  if (strict) {
    let whitespaceEndIndex = 0;
    while (whitespaceEndIndex < raw.length && (raw[whitespaceEndIndex] === " " || raw[whitespaceEndIndex] === "	")) whitespaceEndIndex++;
    if (raw.slice(0, whitespaceEndIndex).includes("	")) throw new ToonDecodeError("Tabs are not allowed in indentation in strict mode", {
      line: lineNumber,
      source: raw
    });
    if (indent > 0 && indent % indentSize !== 0) throw new ToonDecodeError(`Indentation must be exact multiple of ${indentSize}, but found ${indent} spaces`, {
      line: lineNumber,
      source: raw
    });
  }
  return {
    raw,
    indent,
    content,
    depth,
    lineNumber
  };
}
function* parseLinesSync(source, indentSize, strict, state) {
  for (const raw of source) {
    const parsedLine = parseLineIncremental(raw, state, indentSize, strict);
    if (parsedLine !== void 0) yield parsedLine;
  }
}
function computeDepthFromIndent(indentSpaces, indentSize) {
  return Math.floor(indentSpaces / indentSize);
}
function assertExpectedCount(actual, expected, itemType, options, line) {
  if (options.strict && actual !== expected) throw new ToonDecodeError(`Expected ${expected} ${itemType}, but got ${actual}`, {
    line: line.lineNumber,
    source: line.raw
  });
}
function validateNoExtraListItems(nextLine, itemDepth, expectedCount) {
  if (nextLine?.depth === itemDepth && nextLine.content.startsWith("- ")) throw new ToonDecodeError(`Expected ${expectedCount} list array items, but found more`, {
    line: nextLine.lineNumber,
    source: nextLine.raw
  });
}
function validateNoExtraTabularRows(nextLine, rowDepth, header) {
  if (nextLine?.depth === rowDepth && !nextLine.content.startsWith("- ") && isDataRow(nextLine.content, header.delimiter)) throw new ToonDecodeError(`Expected ${header.length} tabular rows, but found more`, {
    line: nextLine.lineNumber,
    source: nextLine.raw
  });
}
function validateNoBlankLinesInRange(startLine, endLine, blankLines, strict, context) {
  if (!strict) return;
  const firstBlank = blankLines.find((blank) => blank.lineNumber > startLine && blank.lineNumber < endLine);
  if (firstBlank) throw new ToonDecodeError(`Blank lines inside ${context} are not allowed in strict mode`, { line: firstBlank.lineNumber });
}
function isDataRow(content, delimiter) {
  const colonPos = content.indexOf(":");
  const delimiterPos = content.indexOf(delimiter);
  if (colonPos === -1) return true;
  if (delimiterPos !== -1 && delimiterPos < colonPos) return true;
  return false;
}
var StreamingLineCursor = class {
  constructor(generator, scanState) {
    this.buffer = [];
    this.done = false;
    this.generator = generator;
    this.scanState = scanState;
  }
  getBlankLines() {
    return this.scanState.blankLines;
  }
  async peek() {
    if (this.buffer.length > 0) return this.buffer[0];
    if (this.done) return;
    const result = await this.generator.next();
    if (result.done) {
      this.done = true;
      return;
    }
    this.buffer.push(result.value);
    return result.value;
  }
  async next() {
    const line = await this.peek();
    if (line !== void 0) {
      this.buffer.shift();
      this.lastLine = line;
    }
    return line;
  }
  async advance() {
    await this.next();
  }
  current() {
    return this.lastLine;
  }
  async atEnd() {
    return await this.peek() === void 0;
  }
  peekSync() {
    if (this.buffer.length > 0) return this.buffer[0];
    if (this.done) return;
    const result = this.generator.next();
    if (result.done) {
      this.done = true;
      return;
    }
    this.buffer.push(result.value);
    return result.value;
  }
  nextSync() {
    const line = this.peekSync();
    if (line !== void 0) {
      this.buffer.shift();
      this.lastLine = line;
    }
    return line;
  }
  advanceSync() {
    this.nextSync();
  }
  atEndSync() {
    return this.peekSync() === void 0;
  }
};
function* decodeStreamSync$1(source, options) {
  if (options?.expandPaths !== void 0) throw new Error("expandPaths is not supported in streaming decode");
  const resolvedOptions = {
    indent: options?.indent ?? 2,
    strict: options?.strict ?? true
  };
  const scanState = createScanState();
  const cursor = new StreamingLineCursor(parseLinesSync(source, resolvedOptions.indent, resolvedOptions.strict, scanState), scanState);
  const first = cursor.peekSync();
  if (!first) {
    yield { type: "startObject" };
    yield { type: "endObject" };
    return;
  }
  if (first.content.trim() === "[]") {
    cursor.advanceSync();
    yield {
      type: "startArray",
      length: 0
    };
    yield { type: "endArray" };
    return;
  }
  if (isArrayHeaderContent(first.content)) {
    const headerInfo = withLine(first, () => parseArrayHeaderLine(first.content, DEFAULT_DELIMITER, resolvedOptions.strict));
    if (headerInfo) {
      cursor.advanceSync();
      yield* decodeArrayFromHeaderSync(headerInfo.header, headerInfo.inlineValues, cursor, 0, resolvedOptions, first);
      return;
    }
  }
  cursor.advanceSync();
  if (!!cursor.atEndSync() && !isKeyValueLineSync(first)) {
    yield {
      type: "primitive",
      value: withLine(first, () => parsePrimitiveToken(first.content.trim()))
    };
    return;
  }
  if (!isKeyValueLineSync(first) && cursor.peekSync()?.depth === 0) throw new ToonDecodeError("Top-level document must start with a key-value or array-header line", {
    line: first.lineNumber,
    source: first.raw
  });
  const rootSeenKeys = resolvedOptions.strict ? /* @__PURE__ */ new Set() : void 0;
  yield { type: "startObject" };
  yield* decodeKeyValueSync(first, cursor, 0, resolvedOptions, rootSeenKeys);
  while (!cursor.atEndSync()) {
    const line = cursor.peekSync();
    if (!line || line.depth !== 0) break;
    cursor.advanceSync();
    yield* decodeKeyValueSync(line, cursor, 0, resolvedOptions, rootSeenKeys);
  }
  yield { type: "endObject" };
}
function assertNoDuplicateKey(key, line, seenKeys) {
  if (!seenKeys) return;
  if (seenKeys.has(key)) throw new ToonDecodeError(`Duplicate sibling key "${key}"`, {
    line: line.lineNumber,
    source: line.raw
  });
  seenKeys.add(key);
}
function* decodeKeyValueSync(line, cursor, baseDepth, options, seenKeys) {
  const content = line.content;
  const arrayHeader = withLine(line, () => parseArrayHeaderLine(content, DEFAULT_DELIMITER, options.strict));
  if (arrayHeader && arrayHeader.header.key !== void 0) {
    assertNoDuplicateKey(arrayHeader.header.key, line, seenKeys);
    yield {
      type: "key",
      key: arrayHeader.header.key
    };
    yield* decodeArrayFromHeaderSync(arrayHeader.header, arrayHeader.inlineValues, cursor, baseDepth, options, line);
    return;
  }
  const { key, isQuoted } = withLine(line, () => parseKeyToken(content, 0));
  const colonIndex = content.indexOf(":", key.length);
  const rest = colonIndex >= 0 ? content.slice(colonIndex + 1).trim() : "";
  assertNoDuplicateKey(key, line, seenKeys);
  yield isQuoted ? {
    type: "key",
    key,
    wasQuoted: true
  } : {
    type: "key",
    key
  };
  if (!rest) {
    const nextLine = cursor.peekSync();
    if (nextLine && nextLine.depth > baseDepth) {
      yield { type: "startObject" };
      yield* decodeObjectFieldsSync(cursor, baseDepth + 1, options);
      yield { type: "endObject" };
      return;
    }
    yield { type: "startObject" };
    yield { type: "endObject" };
    return;
  }
  if (rest === "[]") {
    yield {
      type: "startArray",
      length: 0
    };
    yield { type: "endArray" };
    return;
  }
  yield {
    type: "primitive",
    value: withLine(line, () => parsePrimitiveToken(rest))
  };
}
function* decodeObjectFieldsSync(cursor, baseDepth, options) {
  let computedDepth;
  const seenKeys = options.strict ? /* @__PURE__ */ new Set() : void 0;
  while (!cursor.atEndSync()) {
    const line = cursor.peekSync();
    if (!line || line.depth < baseDepth) break;
    if (computedDepth === void 0 && line.depth >= baseDepth) computedDepth = line.depth;
    if (line.depth === computedDepth) {
      cursor.advanceSync();
      yield* decodeKeyValueSync(line, cursor, computedDepth, options, seenKeys);
    } else break;
  }
}
function* decodeArrayFromHeaderSync(header, inlineValues, cursor, baseDepth, options, headerLine) {
  yield {
    type: "startArray",
    length: header.length
  };
  if (inlineValues) {
    yield* decodeInlinePrimitiveArraySync(header, inlineValues, options, headerLine);
    yield { type: "endArray" };
    return;
  }
  if (header.fields && header.fields.length > 0) {
    yield* decodeTabularArraySync(header, cursor, baseDepth, options, headerLine);
    yield { type: "endArray" };
    return;
  }
  yield* decodeListArraySync(header, cursor, baseDepth, options, headerLine);
  yield { type: "endArray" };
}
function* decodeInlinePrimitiveArraySync(header, inlineValues, options, headerLine) {
  if (!inlineValues.trim()) {
    assertExpectedCount(0, header.length, "inline array items", options, headerLine);
    return;
  }
  const values = withLine(headerLine, () => parseDelimitedValues(inlineValues, header.delimiter));
  const primitives = withLine(headerLine, () => mapRowValuesToPrimitives(values));
  assertExpectedCount(primitives.length, header.length, "inline array items", options, headerLine);
  for (const primitive of primitives) yield {
    type: "primitive",
    value: primitive
  };
}
function* decodeTabularArraySync(header, cursor, baseDepth, options, headerLine) {
  const rowDepth = baseDepth + 1;
  let rowCount = 0;
  let startLine;
  let endLine;
  let lastRowLine = headerLine;
  while (!cursor.atEndSync() && rowCount < header.length) {
    const line = cursor.peekSync();
    if (!line || line.depth < rowDepth) break;
    if (line.depth === rowDepth) {
      if (startLine === void 0) startLine = line.lineNumber;
      endLine = line.lineNumber;
      lastRowLine = line;
      cursor.advanceSync();
      const values = withLine(line, () => parseDelimitedValues(line.content, header.delimiter));
      assertExpectedCount(values.length, header.fields.length, "tabular row values", options, line);
      const primitives = withLine(line, () => mapRowValuesToPrimitives(values));
      yield* yieldObjectFromFields(header.fields, primitives);
      rowCount++;
    } else break;
  }
  assertExpectedCount(rowCount, header.length, "tabular rows", options, lastRowLine);
  if (options.strict && startLine !== void 0 && endLine !== void 0) validateNoBlankLinesInRange(startLine, endLine, cursor.getBlankLines(), options.strict, "tabular array");
  if (options.strict) validateNoExtraTabularRows(cursor.peekSync(), rowDepth, header);
}
function* decodeListArraySync(header, cursor, baseDepth, options, headerLine) {
  const itemDepth = baseDepth + 1;
  let itemCount = 0;
  let startLine;
  let endLine;
  let lastItemLine = headerLine;
  while (!cursor.atEndSync() && itemCount < header.length) {
    const line = cursor.peekSync();
    if (!line || line.depth < itemDepth) break;
    const isListItem = line.content.startsWith("- ") || line.content === "-";
    if (line.depth === itemDepth && isListItem) {
      if (startLine === void 0) startLine = line.lineNumber;
      endLine = line.lineNumber;
      lastItemLine = line;
      yield* decodeListItemSync(cursor, itemDepth, options);
      const currentLine = cursor.current();
      if (currentLine) {
        endLine = currentLine.lineNumber;
        lastItemLine = currentLine;
      }
      itemCount++;
    } else break;
  }
  assertExpectedCount(itemCount, header.length, "list array items", options, lastItemLine);
  if (options.strict && startLine !== void 0 && endLine !== void 0) validateNoBlankLinesInRange(startLine, endLine, cursor.getBlankLines(), options.strict, "list array");
  if (options.strict) validateNoExtraListItems(cursor.peekSync(), itemDepth, header.length);
}
function* decodeListItemSync(cursor, baseDepth, options) {
  const line = cursor.nextSync();
  if (!line) throw new ReferenceError("Expected list item");
  let afterHyphen;
  if (line.content === "-") {
    yield { type: "startObject" };
    yield { type: "endObject" };
    return;
  } else if (line.content.startsWith("- ")) afterHyphen = line.content.slice(2);
  else throw new ToonDecodeError(`Expected list item to start with "- "`, {
    line: line.lineNumber,
    source: line.raw
  });
  if (!afterHyphen.trim()) {
    yield { type: "startObject" };
    yield { type: "endObject" };
    return;
  }
  if (afterHyphen.trim() === "[]") {
    yield {
      type: "startArray",
      length: 0
    };
    yield { type: "endArray" };
    return;
  }
  const itemLine = {
    ...line,
    content: afterHyphen
  };
  if (isArrayHeaderContent(afterHyphen)) {
    const arrayHeader = withLine(itemLine, () => parseArrayHeaderLine(afterHyphen, DEFAULT_DELIMITER, options.strict));
    if (arrayHeader) {
      yield* decodeArrayFromHeaderSync(arrayHeader.header, arrayHeader.inlineValues, cursor, baseDepth, options, itemLine);
      return;
    }
  }
  const headerInfo = withLine(itemLine, () => parseArrayHeaderLine(afterHyphen, DEFAULT_DELIMITER, options.strict));
  if (headerInfo && headerInfo.header.key !== void 0 && headerInfo.header.fields !== void 0) {
    const header = headerInfo.header;
    const seenKeys = options.strict ? /* @__PURE__ */ new Set([header.key]) : void 0;
    yield { type: "startObject" };
    yield {
      type: "key",
      key: header.key
    };
    yield* decodeArrayFromHeaderSync(header, headerInfo.inlineValues, cursor, baseDepth + 1, options, itemLine);
    const followDepth = baseDepth + 1;
    while (!cursor.atEndSync()) {
      const nextLine = cursor.peekSync();
      if (!nextLine || nextLine.depth < followDepth) break;
      if (nextLine.depth === followDepth && !nextLine.content.startsWith("- ")) {
        cursor.advanceSync();
        yield* decodeKeyValueSync(nextLine, cursor, followDepth, options, seenKeys);
      } else break;
    }
    yield { type: "endObject" };
    return;
  }
  if (isKeyValueContent(afterHyphen)) {
    const seenKeys = options.strict ? /* @__PURE__ */ new Set() : void 0;
    yield { type: "startObject" };
    yield* decodeKeyValueSync(itemLine, cursor, baseDepth + 1, options, seenKeys);
    const followDepth = baseDepth + 1;
    while (!cursor.atEndSync()) {
      const nextLine = cursor.peekSync();
      if (!nextLine || nextLine.depth < followDepth) break;
      if (nextLine.depth === followDepth && !nextLine.content.startsWith("- ")) {
        cursor.advanceSync();
        yield* decodeKeyValueSync(nextLine, cursor, followDepth, options, seenKeys);
      } else break;
    }
    yield { type: "endObject" };
    return;
  }
  yield {
    type: "primitive",
    value: withLine(itemLine, () => parsePrimitiveToken(afterHyphen))
  };
}
function isKeyValueLineSync(line) {
  const content = line.content;
  if (content.startsWith('"')) {
    const closingQuoteIndex = findClosingQuote(content, 0);
    if (closingQuoteIndex === -1) return false;
    return content.slice(closingQuoteIndex + 1).includes(":");
  } else return content.includes(":");
}
function* yieldObjectFromFields(fields, primitives) {
  yield { type: "startObject" };
  for (let i = 0; i < fields.length; i++) {
    yield {
      type: "key",
      key: fields[i]
    };
    yield {
      type: "primitive",
      value: primitives[i]
    };
  }
  yield { type: "endObject" };
}
function isJsonObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isIdentifierSegment(key) {
  return /^[A-Z_]\w*$/i.test(key);
}
var QUOTED_KEY_MARKER = /* @__PURE__ */ Symbol("quotedKey");
function expandPathsSafe(value, strict) {
  if (Array.isArray(value)) return value.map((item) => expandPathsSafe(item, strict));
  if (isJsonObject(value)) {
    const expandedObject = {};
    const quotedKeys = value[QUOTED_KEY_MARKER];
    for (const [key, keyValue] of Object.entries(value)) {
      const isQuoted = quotedKeys?.has(key);
      if (key.includes(".") && !isQuoted) {
        const segments = key.split(".");
        if (segments.every((seg) => isIdentifierSegment(seg))) {
          insertPathSafe(expandedObject, segments, expandPathsSafe(keyValue, strict), strict);
          continue;
        }
      }
      const expandedValue = expandPathsSafe(keyValue, strict);
      if (key in expandedObject) {
        const conflictingValue = expandedObject[key];
        if (canMerge(conflictingValue, expandedValue)) mergeObjects(conflictingValue, expandedValue, strict);
        else {
          if (strict) throw new TypeError(`Path expansion conflict at key "${key}": cannot merge ${typeof conflictingValue} with ${typeof expandedValue}`);
          expandedObject[key] = expandedValue;
        }
      } else expandedObject[key] = expandedValue;
    }
    return expandedObject;
  }
  return value;
}
function insertPathSafe(target, segments, value, strict) {
  let currentNode = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const currentSegment = segments[i];
    const segmentValue = currentNode[currentSegment];
    if (segmentValue === void 0) {
      const newObj = {};
      currentNode[currentSegment] = newObj;
      currentNode = newObj;
    } else if (isJsonObject(segmentValue)) currentNode = segmentValue;
    else {
      if (strict) throw new TypeError(`Path expansion conflict at segment "${currentSegment}": expected object but found ${typeof segmentValue}`);
      const newObj = {};
      currentNode[currentSegment] = newObj;
      currentNode = newObj;
    }
  }
  const lastSeg = segments[segments.length - 1];
  const destinationValue = currentNode[lastSeg];
  if (destinationValue === void 0) currentNode[lastSeg] = value;
  else if (canMerge(destinationValue, value)) mergeObjects(destinationValue, value, strict);
  else {
    if (strict) throw new TypeError(`Path expansion conflict at key "${lastSeg}": cannot merge ${typeof destinationValue} with ${typeof value}`);
    currentNode[lastSeg] = value;
  }
}
function mergeObjects(target, source, strict) {
  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = target[key];
    if (targetValue === void 0) target[key] = sourceValue;
    else if (canMerge(targetValue, sourceValue)) mergeObjects(targetValue, sourceValue, strict);
    else {
      if (strict) throw new TypeError(`Path expansion conflict at key "${key}": cannot merge ${typeof targetValue} with ${typeof sourceValue}`);
      target[key] = sourceValue;
    }
  }
}
function canMerge(a, b) {
  return isJsonObject(a) && isJsonObject(b);
}
function buildValueFromEvents(events) {
  const state = {
    stack: [],
    root: void 0
  };
  for (const event of events) applyEvent(state, event);
  return finalizeState(state);
}
function applyEvent(state, event) {
  const { stack } = state;
  switch (event.type) {
    case "startObject": {
      const obj = {};
      const quotedKeys = /* @__PURE__ */ new Set();
      if (stack.length === 0) stack.push({
        type: "object",
        obj,
        quotedKeys
      });
      else {
        const parent = stack[stack.length - 1];
        if (parent.type === "object") {
          if (parent.currentKey === void 0) throw new Error("Object startObject event without preceding key");
          parent.obj[parent.currentKey] = obj;
          parent.currentKey = void 0;
        } else if (parent.type === "array") parent.arr.push(obj);
        stack.push({
          type: "object",
          obj,
          quotedKeys
        });
      }
      break;
    }
    case "endObject": {
      if (stack.length === 0) throw new Error("Unexpected endObject event");
      const context = stack.pop();
      if (context.type !== "object") throw new Error("Mismatched endObject event");
      if (context.quotedKeys.size > 0) Object.defineProperty(context.obj, QUOTED_KEY_MARKER, {
        value: context.quotedKeys,
        enumerable: false,
        writable: false,
        configurable: false
      });
      if (stack.length === 0) state.root = context.obj;
      break;
    }
    case "startArray": {
      const arr = [];
      if (stack.length === 0) stack.push({
        type: "array",
        arr
      });
      else {
        const parent = stack[stack.length - 1];
        if (parent.type === "object") {
          if (parent.currentKey === void 0) throw new Error("Array startArray event without preceding key");
          parent.obj[parent.currentKey] = arr;
          parent.currentKey = void 0;
        } else if (parent.type === "array") parent.arr.push(arr);
        stack.push({
          type: "array",
          arr
        });
      }
      break;
    }
    case "endArray": {
      if (stack.length === 0) throw new Error("Unexpected endArray event");
      const context = stack.pop();
      if (context.type !== "array") throw new Error("Mismatched endArray event");
      if (stack.length === 0) state.root = context.arr;
      break;
    }
    case "key": {
      if (stack.length === 0) throw new Error("Key event outside of object context");
      const parent = stack[stack.length - 1];
      if (parent.type !== "object") throw new Error("Key event in non-object context");
      parent.currentKey = event.key;
      if (event.wasQuoted) parent.quotedKeys.add(event.key);
      break;
    }
    case "primitive":
      if (stack.length === 0) state.root = event.value;
      else {
        const parent = stack[stack.length - 1];
        if (parent.type === "object") {
          if (parent.currentKey === void 0) throw new Error("Primitive event without preceding key in object");
          parent.obj[parent.currentKey] = event.value;
          parent.currentKey = void 0;
        } else if (parent.type === "array") parent.arr.push(event.value);
      }
      break;
  }
}
function finalizeState(state) {
  if (state.stack.length !== 0) throw new Error("Incomplete event stream: stack not empty at end");
  if (state.root === void 0) throw new Error("No root value built from events");
  return state.root;
}
function decode(input, options) {
  return decodeFromLines(input.split("\n"), options);
}
function decodeFromLines(lines, options) {
  const resolvedOptions = resolveDecodeOptions(options);
  const decodedValue = buildValueFromEvents(decodeStreamSync$1(lines, {
    indent: resolvedOptions.indent,
    strict: resolvedOptions.strict
  }));
  if (resolvedOptions.expandPaths === "safe") return expandPathsSafe(decodedValue, resolvedOptions.strict);
  return decodedValue;
}
function resolveDecodeOptions(options) {
  return {
    indent: options?.indent ?? 2,
    strict: options?.strict ?? true,
    expandPaths: options?.expandPaths ?? "off"
  };
}

// packages/compiler/dist/diagnostics.js
function errorDiagnostic(code, message, file, loc) {
  const diagnostic = { severity: "error", code, message, file };
  if (loc?.line !== void 0) {
    diagnostic.line = loc.line;
  }
  if (loc?.col !== void 0) {
    diagnostic.col = loc.col;
  }
  return diagnostic;
}

// packages/compiler/dist/toon.js
function decodeToon(source, file) {
  try {
    return { value: decode(source), diagnostics: [] };
  } catch (err) {
    if (err instanceof ToonDecodeError) {
      return {
        diagnostics: [
          errorDiagnostic("TOA101", stripLinePrefix(err.message), file, {
            line: err.line
          })
        ]
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { diagnostics: [errorDiagnostic("TOA101", message, file)] };
  }
}
function stripLinePrefix(message) {
  return message.replace(/^Line \d+:\s*/, "");
}

// packages/compiler/dist/interpolate.js
var PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
var EACH = /^#each\s+([A-Za-z_][A-Za-z0-9_.]*)\s+as\s+(\{[^}]*\}|[A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z_][A-Za-z0-9_]*))?$/;
var IF = /^#if\s+(!?)\s*([A-Za-z_][A-Za-z0-9_.]*)$/;
var ELSE_IF = /^:else if\s+(!?)\s*([A-Za-z_][A-Za-z0-9_.]*)$/;
function parsePromptTemplate(text) {
  const errors = [];
  const root = [];
  const stack = [{ kind: "root", segs: root }];
  let buf = "";
  const top = () => stack[stack.length - 1];
  const flush = () => {
    if (buf.length > 0) {
      top().segs.push({ kind: "text", value: buf });
      buf = "";
    }
  };
  const eatNewline = (i2) => text[i2] === "\n" ? i2 + 1 : i2;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "{" && next === "{") {
      buf += "{";
      i += 2;
      continue;
    }
    if (ch === "}" && next === "}") {
      buf += "}";
      i += 2;
      continue;
    }
    if (ch === "{") {
      let end = -1;
      let depth = 0;
      for (let j = i; j < text.length; j++) {
        if (text[j] === "{") {
          depth += 1;
        } else if (text[j] === "}") {
          depth -= 1;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      if (end === -1) {
        errors.push("unterminated interpolation: missing '}'");
        buf += ch;
        i += 1;
        continue;
      }
      const inner = text.slice(i + 1, end).trim();
      if (inner.startsWith("#each")) {
        const m = EACH.exec(inner);
        if (!m) {
          errors.push(`invalid {#each}: {${inner}} (use {#each inputs.xs as x} or {#each inputs.xs as x, i})`);
          i = end + 1;
          continue;
        }
        flush();
        const body = [];
        const bind = m[2];
        const item = bind.startsWith("{") ? {
          kind: "destructure",
          fields: bind.slice(1, -1).split(",").map((s) => s.trim()).filter((s) => s.length > 0)
        } : { kind: "name", name: bind };
        const frame = {
          kind: "each",
          segs: body,
          source: m[1].split("."),
          item,
          body,
          elseSegs: []
        };
        if (m[3] !== void 0) {
          frame.index = m[3];
        }
        stack.push(frame);
        i = eatNewline(end + 1);
        continue;
      }
      if (inner.startsWith("#if")) {
        const m = IF.exec(inner);
        if (!m) {
          errors.push(`invalid {#if}: {${inner}} (use {#if inputs.flag} or {#if !inputs.flag})`);
          i = end + 1;
          continue;
        }
        flush();
        const first = {
          cond: m[2].split("."),
          negate: m[1] === "!",
          body: []
        };
        stack.push({
          kind: "if",
          segs: first.body,
          branches: [first],
          elseSegs: []
        });
        i = eatNewline(end + 1);
        continue;
      }
      if (inner.startsWith(":else if")) {
        const m = ELSE_IF.exec(inner);
        const frame = top();
        if (!m) {
          errors.push(`invalid {:else if}: {${inner}}`);
          i = end + 1;
          continue;
        }
        if (frame.kind !== "if") {
          errors.push("unexpected {:else if}");
          i = end + 1;
          continue;
        }
        flush();
        const branch = {
          cond: m[2].split("."),
          negate: m[1] === "!",
          body: []
        };
        frame.branches.push(branch);
        frame.segs = branch.body;
        i = eatNewline(end + 1);
        continue;
      }
      if (inner === ":else") {
        flush();
        const frame = top();
        if (frame.kind !== "if" && frame.kind !== "each") {
          errors.push("unexpected {:else}");
          i = end + 1;
          continue;
        }
        frame.segs = frame.elseSegs;
        i = eatNewline(end + 1);
        continue;
      }
      if (inner === "/each") {
        flush();
        const frame = top();
        if (frame.kind !== "each") {
          errors.push("unexpected {/each}");
          i = end + 1;
          continue;
        }
        stack.pop();
        const seg = {
          kind: "each",
          source: frame.source,
          item: frame.item,
          body: frame.body
        };
        if (frame.index !== void 0) {
          seg.index = frame.index;
        }
        if (frame.elseSegs.length > 0) {
          seg.else = frame.elseSegs;
        }
        top().segs.push(seg);
        i = eatNewline(end + 1);
        continue;
      }
      if (inner === "/if") {
        flush();
        const frame = top();
        if (frame.kind !== "if") {
          errors.push("unexpected {/if}");
          i = end + 1;
          continue;
        }
        stack.pop();
        let elseChain = frame.elseSegs;
        const branches = frame.branches;
        for (let k = branches.length - 1; k >= 0; k--) {
          const branch = branches[k];
          const ifSeg = {
            kind: "if",
            cond: branch.cond,
            negate: branch.negate,
            then: branch.body,
            else: elseChain
          };
          elseChain = [ifSeg];
        }
        top().segs.push(elseChain[0]);
        i = eatNewline(end + 1);
        continue;
      }
      if (inner === "" || !PATH.test(inner)) {
        errors.push(`invalid interpolation: {${inner}}`);
        i = end + 1;
        continue;
      }
      flush();
      top().segs.push({ kind: "interp", path: inner.split(".") });
      i = end + 1;
      continue;
    }
    if (ch === "}") {
      errors.push("unexpected '}' (use '}}' for a literal brace)");
      buf += ch;
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  flush();
  if (stack.length > 1) {
    errors.push("unclosed block (missing {/each} or {/if})");
  }
  return { segments: root, errors };
}

// packages/compiler/dist/validate.js
var ALLOWED_KEYS = /* @__PURE__ */ new Set([
  "agent",
  "model",
  "description",
  "inputs",
  "tools",
  "prompt",
  "outputs",
  "system",
  "maxTurns",
  "retries",
  "temperature",
  "uses"
]);
var IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function validate(value, file, keyLines) {
  const diagnostics = [];
  const at = (key) => ({ line: keyLines.get(key) });
  if (!isObject(value)) {
    diagnostics.push(errorDiagnostic("TOA201", "an .agent file must be a TOON object", file));
    return { diagnostics };
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) {
      diagnostics.push(errorDiagnostic("TOA202", `unknown key "${key}"`, file, at(key)));
    }
  }
  const name = requireString(value, "agent", file, diagnostics, at);
  if (name !== void 0 && !IDENT.test(name)) {
    diagnostics.push(errorDiagnostic("TOA205", `"agent" must be an identifier, got "${name}"`, file, at("agent")));
  }
  const model = requireString(value, "model", file, diagnostics, at);
  const promptText = requireString(value, "prompt", file, diagnostics, at);
  let description;
  if (value.description !== void 0) {
    if (typeof value.description === "string") {
      description = value.description;
    } else {
      diagnostics.push(errorDiagnostic("TOA204", `"description" must be a string`, file, at("description")));
    }
  }
  const inputs = parseFields(value, "inputs", file, diagnostics, at);
  const outputs = parseFields(value, "outputs", file, diagnostics, at);
  const tools = parseTools(value, file, diagnostics, at);
  const uses = parseUses(value, file, diagnostics, at);
  const maxTurns = parseIntKey(value, "maxTurns", file, diagnostics, at);
  const retries = parseIntKey(value, "retries", file, diagnostics, at);
  const temperature = parseTemperature(value, file, diagnostics, at);
  const prompt = typeof promptText === "string" ? parsePrompt(promptText, inputs, file, diagnostics, at) : [];
  let system;
  if (value.system !== void 0) {
    if (typeof value.system === "string") {
      system = parsePrompt(value.system, inputs, file, diagnostics, at);
    } else {
      diagnostics.push(errorDiagnostic("TOA204", `"system" must be a string`, file, at("system")));
    }
  }
  if (diagnostics.some((d) => d.severity === "error")) {
    return { diagnostics };
  }
  const ast = {
    name,
    model,
    inputs,
    outputs,
    tools,
    uses,
    prompt
  };
  if (description !== void 0) {
    ast.description = description;
  }
  if (system !== void 0) {
    ast.system = system;
  }
  if (maxTurns !== void 0) {
    ast.maxTurns = maxTurns;
  }
  if (retries !== void 0) {
    ast.retries = retries;
  }
  if (temperature !== void 0) {
    ast.temperature = temperature;
  }
  return { ast, diagnostics };
}
function parseTemperature(obj, file, diagnostics, at) {
  const v = obj.temperature;
  if (v === void 0) {
    return void 0;
  }
  if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 1) {
    diagnostics.push(errorDiagnostic("TOA207", `"temperature" must be a number between 0 and 1`, file, at("temperature")));
    return void 0;
  }
  return v;
}
function parseUses(obj, file, diagnostics, at) {
  const arr = obj.uses;
  if (arr === void 0) {
    return [];
  }
  if (!Array.isArray(arr)) {
    diagnostics.push(errorDiagnostic("TOA230", `"uses" must be an array of agent names`, file, at("uses")));
    return [];
  }
  const names = [];
  for (const u of arr) {
    if (typeof u !== "string" || !IDENT.test(u)) {
      diagnostics.push(errorDiagnostic("TOA231", `"uses" entries must be identifiers, got ${JSON.stringify(u)}`, file, at("uses")));
      continue;
    }
    names.push(u);
  }
  return names;
}
function parseIntKey(obj, key, file, diagnostics, at) {
  const v = obj[key];
  if (v === void 0) {
    return void 0;
  }
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    diagnostics.push(errorDiagnostic("TOA206", `"${key}" must be a non-negative integer`, file, at(key)));
    return void 0;
  }
  return v;
}
function requireString(obj, key, file, diagnostics, at) {
  const v = obj[key];
  if (v === void 0) {
    diagnostics.push(errorDiagnostic("TOA203", `missing required key "${key}"`, file));
    return void 0;
  }
  if (typeof v !== "string") {
    diagnostics.push(errorDiagnostic("TOA204", `"${key}" must be a string`, file, at(key)));
    return void 0;
  }
  return v;
}
function parseFields(obj, key, file, diagnostics, at) {
  const arr = obj[key];
  if (arr === void 0) {
    return [];
  }
  if (!Array.isArray(arr)) {
    diagnostics.push(errorDiagnostic("TOA210", `"${key}" must be a tabular array of {name,type}`, file, at(key)));
    return [];
  }
  const fields = [];
  for (const item of arr) {
    if (!isObject(item) || typeof item.name !== "string" || typeof item.type !== "string") {
      diagnostics.push(errorDiagnostic("TOA210", `each "${key}" row needs a string name and type`, file, at(key)));
      continue;
    }
    const rawName = item.name;
    const rawType = item.type;
    const optional = rawName.endsWith("?");
    const name = optional ? rawName.slice(0, -1) : rawName;
    if (!IDENT.test(name)) {
      diagnostics.push(errorDiagnostic("TOA211", `"${key}" name "${name}" must be an identifier`, file, at(key)));
      continue;
    }
    const type = parseType(rawType);
    if (type === void 0) {
      diagnostics.push(errorDiagnostic("TOA212", `"${key}" has unsupported type "${rawType}" (use string | number | boolean, optional "[]")`, file, at(key)));
      continue;
    }
    fields.push(optional ? { name, type, optional } : { name, type });
  }
  return fields;
}
function parseTools(obj, file, diagnostics, at) {
  const arr = obj.tools;
  if (arr === void 0) {
    return [];
  }
  if (!Array.isArray(arr)) {
    diagnostics.push(errorDiagnostic("TOA220", `"tools" must be an array of names`, file, at("tools")));
    return [];
  }
  const names = [];
  for (const t of arr) {
    if (typeof t !== "string" || !IDENT.test(t)) {
      diagnostics.push(errorDiagnostic("TOA221", `tool name must be an identifier, got ${JSON.stringify(t)}`, file, at("tools")));
      continue;
    }
    names.push(t);
  }
  return names;
}
function parsePrompt(text, inputs, file, diagnostics, at) {
  const ctx = {
    inputTypes: new Map(inputs.map((f) => [f.name, f.type])),
    file,
    diagnostics,
    at
  };
  const { segments, errors } = parsePromptTemplate(text);
  for (const message of errors) {
    diagnostics.push(errorDiagnostic("TOA302", message, file, at("prompt")));
  }
  validatePromptSegments(segments, /* @__PURE__ */ new Map(), ctx);
  return segments;
}
var NUMBER_TYPE = { base: "number", array: false };
function resolveFieldPath(type, rest) {
  let cur = type;
  for (const seg of rest) {
    if (cur.array || cur.base !== "object" || cur.fields === void 0) {
      return null;
    }
    const field = cur.fields.find((f) => f.name === seg);
    if (field === void 0) {
      return null;
    }
    cur = field.type;
  }
  return cur;
}
function badInterp(path, ctx) {
  ctx.diagnostics.push(errorDiagnostic("TOA301", `invalid interpolation {${path.join(".")}} (unknown name or field)`, ctx.file, ctx.at("prompt")));
}
function validatePromptSegments(segments, vars, ctx) {
  for (const seg of segments) {
    if (seg.kind === "interp") {
      const root = seg.path[0];
      if (root !== void 0 && vars.has(root)) {
        if (resolveFieldPath(vars.get(root), seg.path.slice(1)) === null) {
          badInterp(seg.path, ctx);
        }
      } else if (root === "inputs" && seg.path.length >= 2 && ctx.inputTypes.has(seg.path[1])) {
        if (resolveFieldPath(ctx.inputTypes.get(seg.path[1]), seg.path.slice(2)) === null) {
          badInterp(seg.path, ctx);
        }
      } else if (root === "env" && seg.path.length === 2) {
      } else {
        badInterp(seg.path, ctx);
      }
    } else if (seg.kind === "each") {
      const sourceType = seg.source.length === 2 && seg.source[0] === "inputs" ? ctx.inputTypes.get(seg.source[1]) : void 0;
      if (sourceType === void 0 || !sourceType.array) {
        ctx.diagnostics.push(errorDiagnostic("TOA303", `{#each ${seg.source.join(".")}} must iterate a declared array input (a "[]" type)`, ctx.file, ctx.at("prompt")));
        continue;
      }
      const elementType = sourceType.fields ? { base: sourceType.base, array: false, fields: sourceType.fields } : { base: sourceType.base, array: false };
      const inner = new Map(vars);
      if (seg.item.kind === "name") {
        inner.set(seg.item.name, elementType);
      } else if (elementType.base !== "object" || elementType.fields === void 0) {
        ctx.diagnostics.push(errorDiagnostic("TOA306", `cannot destructure {#each ${seg.source.join(".")}}: its elements are not objects`, ctx.file, ctx.at("prompt")));
      } else {
        for (const field of seg.item.fields) {
          const decl = elementType.fields.find((f) => f.name === field);
          if (decl === void 0) {
            ctx.diagnostics.push(errorDiagnostic("TOA306", `{#each \u2026 as { ${field} }} \u2014 the element has no field "${field}"`, ctx.file, ctx.at("prompt")));
          } else {
            inner.set(field, decl.type);
          }
        }
      }
      if (seg.index !== void 0) {
        inner.set(seg.index, NUMBER_TYPE);
      }
      validatePromptSegments(seg.body, inner, ctx);
      if (seg.else !== void 0) {
        validatePromptSegments(seg.else, vars, ctx);
      }
    } else if (seg.kind === "if") {
      const condType = seg.cond.length === 2 && seg.cond[0] === "inputs" ? ctx.inputTypes.get(seg.cond[1]) : void 0;
      if (condType === void 0 || condType.base !== "boolean" || condType.array) {
        ctx.diagnostics.push(errorDiagnostic("TOA305", `{#if ${seg.cond.join(".")}} must test a boolean input (a "boolean" type)`, ctx.file, ctx.at("prompt")));
      }
      validatePromptSegments(seg.then, vars, ctx);
      validatePromptSegments(seg.else, vars, ctx);
    }
  }
}
var ENUM_VALUE = /^[A-Za-z0-9_-]+$/;
function parseType(raw) {
  let rest = raw.trim();
  let array = false;
  if (rest.endsWith("[]")) {
    array = true;
    rest = rest.slice(0, -2).trim();
  }
  if (rest === "string" || rest === "number" || rest === "boolean") {
    return { base: rest, array };
  }
  if (!rest.startsWith("{") && rest.includes("|")) {
    const values = rest.split("|").map((v) => v.trim());
    if (values.length < 2 || !values.every((v) => ENUM_VALUE.test(v))) {
      return void 0;
    }
    if (new Set(values).size !== values.length) {
      return void 0;
    }
    return { base: "enum", array, values };
  }
  if (rest.startsWith("{") && rest.endsWith("}")) {
    const fields = [];
    for (const part of splitFields(rest.slice(1, -1))) {
      const idx = part.indexOf(":");
      if (idx === -1) {
        return void 0;
      }
      const name = part.slice(0, idx).trim();
      const fieldType = parseType(part.slice(idx + 1));
      if (!IDENT.test(name) || fieldType === void 0) {
        return void 0;
      }
      fields.push({ name, type: fieldType });
    }
    if (fields.length === 0) {
      return void 0;
    }
    return { base: "object", array, fields };
  }
  return void 0;
}
function splitFields(s) {
  const parts = [];
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
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// packages/compiler/dist/analyze.js
function analyze(source, file) {
  const pre = preprocess(source, file);
  if (pre.diagnostics.length > 0) {
    return { diagnostics: pre.diagnostics };
  }
  const decoded = decodeToon(pre.toon, file);
  if (decoded.value === void 0 || decoded.diagnostics.length > 0) {
    return { diagnostics: decoded.diagnostics };
  }
  return validate(decoded.value, file, pre.keyLines);
}

// packages/compiler/dist/codegen.js
function generate(ast) {
  const pascal = pascalCase(ast.name);
  const inputType = `${pascal}Input`;
  const outputType = `${pascal}Output`;
  const hasInputs = ast.inputs.length > 0;
  const hasOutputs = ast.outputs.length > 0;
  const hasTools = ast.tools.length > 0;
  const agentType = `Agent<${inputType}, ${hasOutputs ? outputType : "string"}>`;
  const ctx = {
    inputTypes: new Map(ast.inputs.map((f) => [f.name, f.type])),
    optionalInputs: new Set(ast.inputs.filter((f) => f.optional === true).map((f) => f.name)),
    usesToon: false
  };
  const promptCode = promptExpr(ast.prompt, ctx, /* @__PURE__ */ new Map());
  const systemCode = ast.system ? promptExpr(ast.system, ctx, /* @__PURE__ */ new Map()) : void 0;
  const lines = [];
  lines.push(`// Generated by toac from ${ast.name}.agent \u2014 do not edit.`);
  const runtimeImports = ctx.usesToon ? "createAgent, toonValue" : "createAgent";
  lines.push(`import { ${runtimeImports}, type Agent } from "toad-runtime";`);
  if (hasInputs || hasOutputs) {
    lines.push(`import { z } from "zod";`);
  }
  if (hasTools) {
    lines.push(`import { ${ast.tools.join(", ")} } from "./${ast.name}.tools";`);
  }
  for (const sub of ast.uses) {
    lines.push(`import { ${sub} } from "./${sub}";`);
  }
  lines.push("");
  emitInterface(lines, inputType, ast.inputs);
  lines.push("");
  if (hasOutputs) {
    emitInterface(lines, outputType, ast.outputs);
    lines.push("");
  }
  if (hasInputs) {
    emitSchema(lines, "inputSchema", ast.inputs);
    lines.push("");
  }
  if (hasOutputs) {
    emitSchema(lines, "outputSchema", ast.outputs);
    lines.push("");
  }
  lines.push(`export const ${ast.name}: ${agentType} = createAgent({`);
  lines.push(`  name: ${JSON.stringify(ast.name)},`);
  lines.push(`  model: ${JSON.stringify(ast.model)},`);
  if (ast.description !== void 0) {
    lines.push(`  description: ${JSON.stringify(ast.description)},`);
  }
  if (ast.maxTurns !== void 0) {
    lines.push(`  maxTurns: ${ast.maxTurns},`);
  }
  if (ast.retries !== void 0) {
    lines.push(`  retries: ${ast.retries},`);
  }
  if (ast.temperature !== void 0) {
    lines.push(`  temperature: ${ast.temperature},`);
  }
  const toolEntries = [
    ...ast.tools,
    ...ast.uses.map((sub) => `${sub}: ${sub}.asTool()`)
  ];
  if (toolEntries.length > 0) {
    lines.push(`  tools: { ${toolEntries.join(", ")} },`);
  }
  if (hasInputs) {
    lines.push(`  inputSchema,`);
  }
  if (hasOutputs) {
    lines.push(`  outputSchema,`);
  }
  if (systemCode !== void 0) {
    lines.push(`  system: (inputs: ${inputType}) =>`);
    lines.push(`    ${systemCode},`);
  }
  lines.push(`  prompt: (inputs: ${inputType}) =>`);
  lines.push(`    ${promptCode},`);
  lines.push(`});`);
  lines.push("");
  lines.push(`export default ${ast.name};`);
  lines.push("");
  return lines.join("\n");
}
function emitInterface(lines, name, fields) {
  if (fields.length === 0) {
    lines.push(`export interface ${name} {}`);
    return;
  }
  lines.push(`export interface ${name} {`);
  for (const f of fields) {
    lines.push(`  ${f.name}${f.optional === true ? "?" : ""}: ${tsType(f.type)};`);
  }
  lines.push(`}`);
}
function emitSchema(lines, name, fields) {
  lines.push(`const ${name} = z.object({`);
  for (const f of fields) {
    const expr = zodExpr(f.type);
    lines.push(`  ${f.name}: ${f.optional === true ? `${expr}.optional()` : expr},`);
  }
  lines.push(`});`);
}
function tsType(t) {
  let base;
  if (t.base === "object") {
    base = `{ ${(t.fields ?? []).map((f) => `${f.name}: ${tsType(f.type)}`).join("; ")} }`;
  } else if (t.base === "enum") {
    base = (t.values ?? []).map((v) => JSON.stringify(v)).join(" | ");
    if (t.array)
      base = `(${base})`;
  } else {
    base = t.base;
  }
  return t.array ? `${base}[]` : base;
}
function zodExpr(t) {
  let base;
  if (t.base === "object") {
    base = `z.object({ ${(t.fields ?? []).map((f) => `${f.name}: ${zodExpr(f.type)}`).join(", ")} })`;
  } else if (t.base === "enum") {
    base = `z.enum([${(t.values ?? []).map((v) => JSON.stringify(v)).join(", ")}])`;
  } else {
    base = `z.${t.base}()`;
  }
  return t.array ? `z.array(${base})` : base;
}
function isOptionalInputRoot(path, ctx) {
  return path[0] === "inputs" && path.length >= 2 && ctx.optionalInputs.has(path[1]);
}
function pathExpr(path, ctx) {
  if (isOptionalInputRoot(path, ctx) && path.length > 2) {
    return `inputs.${path[1]}?.${path.slice(2).join(".")}`;
  }
  return path.join(".");
}
function resolveFieldPath2(type, rest) {
  let cur = type;
  for (const seg of rest) {
    if (cur.array || cur.base !== "object" || cur.fields === void 0) {
      return null;
    }
    const field = cur.fields.find((f) => f.name === seg);
    if (field === void 0)
      return null;
    cur = field.type;
  }
  return cur;
}
function interpType(path, ctx, vars) {
  const root = path[0];
  if (root !== void 0 && vars.has(root)) {
    return resolveFieldPath2(vars.get(root), path.slice(1));
  }
  if (root === "inputs" && path.length >= 2 && ctx.inputTypes.has(path[1])) {
    return resolveFieldPath2(ctx.inputTypes.get(path[1]), path.slice(2));
  }
  return null;
}
var isNonScalar = (t) => t.array || t.base === "object";
function promptExpr(segments, ctx, vars) {
  return `\`${segmentsToBody(segments, ctx, vars)}\``;
}
function segmentsToBody(segments, ctx, vars) {
  let out = "";
  for (const seg of segments) {
    if (seg.kind === "text") {
      out += escapeTemplate(seg.value);
    } else if (seg.kind === "interp") {
      if (seg.path[0] === "env") {
        out += `\${process.env.${seg.path.slice(1).join(".")} ?? ""}`;
      } else {
        const expr = pathExpr(seg.path, ctx);
        const type = interpType(seg.path, ctx, vars);
        if (type !== null && isNonScalar(type)) {
          ctx.usesToon = true;
          out += `\${toonValue(${expr})}`;
        } else if (isOptionalInputRoot(seg.path, ctx)) {
          out += `\${${expr} ?? ""}`;
        } else {
          out += `\${${expr}}`;
        }
      }
    } else if (seg.kind === "each") {
      const bind = seg.item.kind === "name" ? seg.item.name : `{ ${seg.item.fields.join(", ")} }`;
      const params = seg.index !== void 0 ? `${bind}, ${seg.index}` : bind;
      const childVars = bindLoopVars(seg, ctx, vars);
      const src = isOptionalInputRoot(seg.source, ctx) ? `(${seg.source.join(".")} ?? [])` : seg.source.join(".");
      const loop = `${src}.map((${params}) => \`${segmentsToBody(seg.body, ctx, childVars)}\`).join("")`;
      out += seg.else !== void 0 && seg.else.length > 0 ? `\${${src}.length > 0 ? ${loop} : \`${segmentsToBody(seg.else, ctx, vars)}\`}` : `\${${loop}}`;
    } else {
      const cond = `${seg.negate ? "!" : ""}${seg.cond.join(".")}`;
      out += `\${${cond} ? \`${segmentsToBody(seg.then, ctx, vars)}\` : \`${segmentsToBody(seg.else, ctx, vars)}\`}`;
    }
  }
  return out;
}
function bindLoopVars(seg, ctx, vars) {
  const child = new Map(vars);
  const sourceType = interpType(seg.source, ctx, vars);
  if (sourceType === null || !sourceType.array)
    return child;
  const element = { base: sourceType.base, array: false };
  if (sourceType.fields !== void 0)
    element.fields = sourceType.fields;
  if (seg.item.kind === "name") {
    child.set(seg.item.name, element);
  } else if (element.fields !== void 0) {
    for (const field of seg.item.fields) {
      const decl = element.fields.find((f) => f.name === field);
      if (decl !== void 0)
        child.set(field, decl.type);
    }
  }
  return child;
}
function escapeTemplate(s) {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}
function pascalCase(name) {
  return name.split(/[_\s]+/).filter((s) => s.length > 0).map((s) => s[0].toUpperCase() + s.slice(1)).join("");
}

// packages/compiler/dist/index.js
function compile(source, file = "<input>") {
  const { ast, diagnostics } = analyze(source, file);
  if (ast === void 0) {
    return { diagnostics };
  }
  return { code: generate(ast), diagnostics };
}

// editors/vscode/src/extension.mjs
var DEBOUNCE_MS = 200;
var KEY_DOCS = {
  agent: "**agent** (required) \u2014 the agent's name: an identifier, also the emitted export and filename.",
  model: "**model** (required) \u2014 a Claude model id, e.g. `claude-opus-4-7`.",
  description: "**description** \u2014 one line on what the agent does; doubles as the default system prompt and the default tool description for `asTool()`.",
  inputs: "**inputs[N]{name,type}:** \u2014 N typed call parameters, one `name,type` row each. A trailing `?` (`detail?,string`) makes a field optional.",
  tools: "**tools[N]: a,b** \u2014 N tool names, implemented in the co-located `<agent>.tools.ts`.",
  prompt: "**prompt: |** (required) \u2014 the instruction prompt as an indented block. Supports `{inputs.x}`, `{env.X}`, `{#each}`, `{#if}`.",
  outputs: "**outputs[N]{name,type}:** \u2014 N typed result fields; the agent returns a validated object instead of free text.",
  system: "**system: |** \u2014 system prompt block; defaults to the description when absent.",
  uses: "**uses[N]: a,b** \u2014 sub-agents wired in as tools via `asTool()`.",
  maxTurns: "**maxTurns** \u2014 tool-use turn cap (default 8).",
  retries: "**retries** \u2014 retry the model call this many times on error.",
  temperature: "**temperature** \u2014 sampling temperature, a number from 0 to 1; omit for the API default."
};
var TEMPLATE_DOCS = {
  "#each": "`{#each inputs.xs as x}` \u2026 `{/each}` \u2014 iterate an array input. Index: `as x, i`; empty fallback: `{:else}`; destructure: `as {a, b}`.",
  "#if": "`{#if inputs.flag}` \u2026 `{:else if \u2026}` \u2026 `{:else}` \u2026 `{/if}` \u2014 condition on a boolean input; a leading `!` negates.",
  ":else": "`{:else}` \u2014 the empty-list / false branch of `{#each}` or `{#if}`.",
  "/each": "`{/each}` \u2014 closes an `{#each}` block.",
  "/if": "`{/if}` \u2014 closes an `{#if}` block.",
  "inputs.": "`{inputs.<name>}` \u2014 interpolate a declared input.",
  "env.": "`{env.<NAME>}` \u2014 interpolate an environment variable (empty string when unset)."
};
function inputNames(doc) {
  const text = doc.getText();
  try {
    const { ast } = analyze(text, doc.uri.fsPath);
    if (ast) return ast.inputs.map((f) => f.name);
  } catch {
  }
  const names = [];
  const m = text.match(/^inputs\[\d+\][^\n]*\n((?:[ ]{2}[^\n]*\n?)*)/m);
  if (m) {
    for (const row of m[1].split("\n")) {
      const r = /^ {2}([A-Za-z_][A-Za-z0-9_]*)\??,/.exec(row);
      if (r) names.push(r[1]);
    }
  }
  return names;
}
function activate(context) {
  const collection = vscode.languages.createDiagnosticCollection("toad");
  const timers = /* @__PURE__ */ new Map();
  const refresh = (doc) => {
    if (doc.languageId !== "agent") return;
    const { diagnostics } = compile(doc.getText(), doc.uri.fsPath);
    collection.set(
      doc.uri,
      diagnostics.map((d) => {
        const line = Math.min(
          Math.max((d.line ?? 1) - 1, 0),
          doc.lineCount - 1
        );
        const col = Math.max((d.col ?? 1) - 1, 0);
        const lineEnd = doc.lineAt(line).text.length;
        const range = new vscode.Range(
          line,
          Math.min(col, lineEnd),
          line,
          Math.max(lineEnd, col + 1)
        );
        const diag = new vscode.Diagnostic(
          range,
          d.message,
          d.severity === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error
        );
        diag.source = "toac";
        diag.code = d.code;
        return diag;
      })
    );
  };
  const refreshSoon = (doc) => {
    if (doc.languageId !== "agent") return;
    const key = doc.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        refresh(doc);
      }, DEBOUNCE_MS)
    );
  };
  const hover = vscode.languages.registerHoverProvider("agent", {
    provideHover(doc, position) {
      const line = doc.lineAt(position.line).text;
      const m = /^([A-Za-z_][A-Za-z0-9_]*)(?=[:\[])/.exec(line);
      if (m && KEY_DOCS[m[1]] && position.character <= m[1].length) {
        return new vscode.Hover(new vscode.MarkdownString(KEY_DOCS[m[1]]));
      }
      return void 0;
    }
  });
  const completions = vscode.languages.registerCompletionItemProvider(
    "agent",
    {
      provideCompletionItems(doc, position) {
        const before = doc.lineAt(position.line).text.slice(0, position.character);
        if (/\{inputs\.[A-Za-z0-9_]*$/.test(before)) {
          return inputNames(doc).map((name) => {
            const item = new vscode.CompletionItem(
              name,
              vscode.CompletionItemKind.Variable
            );
            item.detail = "declared input";
            return item;
          });
        }
        if (/\{[#:/A-Za-z]*$/.test(before) && before.includes("{")) {
          return Object.entries(TEMPLATE_DOCS).map(([label, doc_]) => {
            const item = new vscode.CompletionItem(
              label,
              vscode.CompletionItemKind.Keyword
            );
            item.documentation = new vscode.MarkdownString(doc_);
            if (label === "#each") {
              item.insertText = new vscode.SnippetString(
                "#each inputs.${1:items} as ${2:item}}\n$0\n{/each}"
              );
            } else if (label === "#if") {
              item.insertText = new vscode.SnippetString(
                "#if inputs.${1:flag}}\n$0\n{/if}"
              );
            }
            return item;
          });
        }
        if (/^[A-Za-z]*$/.test(before)) {
          return Object.entries(KEY_DOCS).map(([key, doc_]) => {
            const item = new vscode.CompletionItem(
              key,
              vscode.CompletionItemKind.Property
            );
            item.documentation = new vscode.MarkdownString(doc_);
            if (key === "inputs" || key === "outputs") {
              item.insertText = new vscode.SnippetString(
                `${key}[\${1:1}]{name,type}:
  \${2:name},\${3:string}`
              );
            } else if (key === "prompt" || key === "system") {
              item.insertText = new vscode.SnippetString(`${key}: |
  $0`);
            } else if (key === "tools" || key === "uses") {
              item.insertText = new vscode.SnippetString(
                `${key}[\${1:1}]: \${2:name}`
              );
            } else {
              item.insertText = new vscode.SnippetString(`${key}: $0`);
            }
            return item;
          });
        }
        return void 0;
      }
    },
    "{",
    "."
  );
  vscode.workspace.textDocuments.forEach(refresh);
  context.subscriptions.push(
    collection,
    hover,
    completions,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => refreshSoon(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      clearTimeout(timers.get(doc.uri.toString()));
      timers.delete(doc.uri.toString());
      collection.delete(doc.uri);
    })
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
