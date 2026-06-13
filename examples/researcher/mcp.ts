// Serve the researcher agent as an MCP tool over stdio.
//
// Build the agent first (`toac build researcher.agent`), then point any MCP
// client at this file. For Claude Desktop / Claude Code, add to the MCP config:
//
//   {
//     "mcpServers": {
//       "researcher": { "command": "node", "args": ["examples/researcher/mcp.js"] }
//     }
//   }
//
// The client sees one tool, `researcher`, whose input schema is the agent's
// declared `inputs`; calling it runs the full tool-use loop and returns the
// typed result (also as MCP `structuredContent`).
import { serveMcp } from "toad-runtime/mcp";
import { researcher } from "./researcher.js";

serveMcp([researcher]);
