import { z, type ZodType } from "zod";
import {
  anthropicClient,
  type LlmClient,
  type LlmMessage,
  type LlmText,
  type LlmTool,
  type LlmToolUse,
} from "./client.js";
import { MaxTurnsError, OutputParseError, ToolError } from "./errors.js";
import type { AnyToolDef, ToolDef } from "./tool.js";

const RESPOND_TOOL = "respond";

export interface AgentConfig<I, O> {
  name: string;
  model: string;
  description?: string;
  tools?: Record<string, AnyToolDef>;
  /** Schema for the agent's inputs; lets it be used as a tool via `asTool()`. */
  inputSchema?: ZodType<I>;
  /** When set, the agent must return a value matching this schema. */
  outputSchema?: ZodType<O>;
  prompt: (inputs: I) => string;
  maxTurns?: number;
  maxTokens?: number;
  /** Injectable for testing; defaults to the real Anthropic client. */
  client?: LlmClient;
}

export interface Agent<I, O> {
  readonly name: string;
  run(inputs: I): Promise<O>;
  /** Expose this agent as a tool that another agent can call. */
  asTool(options?: { description?: string }): ToolDef<I>;
}

/**
 * Build a runnable agent from a config. Runs a tool-use loop over the LLM:
 * send the prompt, execute any requested tools, feed results back, repeat until
 * the model finishes (or calls `respond` for structured output). See §6.
 */
export function createAgent<I, O = string>(
  config: AgentConfig<I, O>,
): Agent<I, O> {
  const maxTurns = config.maxTurns ?? 8;
  const maxTokens = config.maxTokens ?? 4096;
  const toolDefs = config.tools ?? {};

  const tools: LlmTool[] = Object.entries(toolDefs).map(([name, def]) => ({
    name,
    description: def.description,
    input_schema: toInputSchema(def.input),
  }));
  if (config.outputSchema) {
    tools.push({
      name: RESPOND_TOOL,
      description:
        "Return the final structured result. Call this exactly once when done.",
      input_schema: toInputSchema(config.outputSchema),
    });
  }
  if (tools.length > 0) {
    // Cache the (stable) tool prefix across turns.
    tools[tools.length - 1]!.cache_control = { type: "ephemeral" };
  }

  const systemText = config.description ?? `You are ${config.name}.`;

  const agent: Agent<I, O> = {
    name: config.name,
    async run(inputs: I): Promise<O> {
      const client = config.client ?? anthropicClient();
      let userText = config.prompt(inputs);
      if (config.outputSchema) {
        userText += `\n\nWhen finished, call the \`${RESPOND_TOOL}\` tool with the final result.`;
      }
      const messages: LlmMessage[] = [{ role: "user", content: userText }];

      for (let turn = 0; turn < maxTurns; turn++) {
        const res = await client.create({
          model: config.model,
          max_tokens: maxTokens,
          system: [
            {
              type: "text",
              text: systemText,
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: tools.length > 0 ? tools : undefined,
          messages,
        });

        const toolUses = res.content.filter(
          (b): b is LlmToolUse => b.type === "tool_use",
        );

        if (toolUses.length === 0) {
          if (config.outputSchema) {
            throw new OutputParseError(
              `agent "${config.name}" stopped without calling ${RESPOND_TOOL}`,
            );
          }
          return joinText(res.content) as O;
        }

        messages.push({ role: "assistant", content: res.content });
        const results: unknown[] = [];

        for (const tu of toolUses) {
          if (config.outputSchema && tu.name === RESPOND_TOOL) {
            const parsed = config.outputSchema.safeParse(tu.input);
            if (!parsed.success) {
              throw new OutputParseError(
                `agent "${config.name}" returned invalid output: ${parsed.error.message}`,
              );
            }
            return parsed.data;
          }
          const def = toolDefs[tu.name];
          if (!def) {
            results.push(toolResult(tu.id, `unknown tool "${tu.name}"`, true));
            continue;
          }
          const input = def.input.safeParse(tu.input);
          if (!input.success) {
            results.push(
              toolResult(tu.id, `invalid input: ${input.error.message}`, true),
            );
            continue;
          }
          let output: unknown;
          try {
            output = await def.run(input.data);
          } catch (err) {
            throw new ToolError(tu.name, err);
          }
          results.push(toolResult(tu.id, stringify(output)));
        }

        messages.push({ role: "user", content: results });
      }

      throw new MaxTurnsError(maxTurns);
    },
    asTool(options) {
      const input =
        config.inputSchema ?? (z.object({}) as unknown as ZodType<I>);
      return {
        description:
          options?.description ??
          config.description ??
          `Run the ${config.name} agent.`,
        input,
        run: (value: I) => agent.run(value),
      };
    },
  };
  return agent;
}

function toInputSchema(schema: ZodType<any>): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function toolResult(id: string, content: string, isError = false): unknown {
  return isError
    ? { type: "tool_result", tool_use_id: id, content, is_error: true }
    : { type: "tool_result", tool_use_id: id, content };
}

function joinText(content: { type: string }[]): string {
  return content
    .filter((b): b is LlmText => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function stringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
