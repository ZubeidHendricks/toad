/**
 * `toad-runtime` — the runtime that agents compiled by `toac` import. Provides
 * `defineTool`, `createAgent`, the tool loop, and typed errors.
 * See `_bmad-output/architecture.md` §6.
 */

export const RUNTIME_VERSION = "0.2.0";

export { defineTool, type ToolDef } from "./tool.js";
export {
  createAgent,
  toonValue,
  type Agent,
  type AgentConfig,
  type AgentHooks,
  type TokenUsage,
  type ToolResultEncoding,
} from "./agent.js";
export { MaxTurnsError, OutputParseError, ToolError } from "./errors.js";
export {
  anthropicClient,
  type LlmBlock,
  type LlmClient,
  type LlmRequest,
  type LlmResponse,
  type LlmStreamChunk,
  type LlmUsage,
} from "./client.js";
