/**
 * `toad-runtime` — the runtime that agents compiled by `toac` import. Provides
 * `defineTool`, `createAgent`, the tool loop, and typed errors.
 * See `_bmad-output/architecture.md` §6.
 */

export const RUNTIME_VERSION = "0.6.0";

export { defineTool, type ToolDef, type ToolRunContext } from "./tool.js";
export {
  createAgent,
  toonValue,
  type Agent,
  type AgentConfig,
  type AgentEvent,
  type AgentHooks,
  type ContextBreakdown,
  type AgentSession,
  type RunOptions,
  type SessionState,
  type TokenUsage,
  type ToolResultEncoding,
} from "./agent.js";
export { MaxTurnsError, OutputParseError, ToolError } from "./errors.js";
export {
  anthropicClient,
  type LlmBlock,
  type LlmCallOptions,
  type LlmClient,
  type LlmRequest,
  type LlmResponse,
  type LlmStreamChunk,
  type LlmUsage,
} from "./client.js";
