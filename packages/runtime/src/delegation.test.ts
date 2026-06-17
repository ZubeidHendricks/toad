import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAgent } from "./agent.js";
import type { LlmClient, LlmResponse } from "./client.js";
import { AuthorizationError } from "./errors.js";
import { defineTool } from "./tool.js";
import {
  encodeDelegationHeader,
  extendChain,
  parseDelegationHeader,
  type DelegationContext,
} from "./delegation.js";

/** Replays a fixed script of model responses, ignoring the request. */
function scriptedClient(responses: LlmResponse[]): LlmClient {
  let i = 0;
  return { create: async () => responses[i++]! };
}

const toolUse = (id: string, name: string, input: unknown): LlmResponse => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id, name, input }],
});

const endTurn = (text: string): LlmResponse => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text }],
});

describe("extendChain", () => {
  it("appends without mutating and preserves the subject", () => {
    const base: DelegationContext = {
      subject: { id: "user:1" },
      chain: [{ id: "agent:a" }],
    };
    const next = extendChain(base, { id: "agent:b" });
    expect(next.chain.map((p) => p.id)).toEqual(["agent:a", "agent:b"]);
    expect(next.subject).toEqual({ id: "user:1" });
    expect(base.chain).toHaveLength(1); // unchanged
  });
});

describe("Toad-Delegation header codec", () => {
  it("round-trips subject + chain", () => {
    const ctx: DelegationContext = {
      subject: { id: "user:1234" },
      chain: [{ id: "agent:a" }, { id: "agent:b" }],
    };
    const header = encodeDelegationHeader(ctx);
    expect(header).toBe("subject=user%3A1234; chain=agent%3Aa,agent%3Ab");
    const back = parseDelegationHeader(header);
    expect(back?.subject?.id).toBe("user:1234");
    expect(back?.chain.map((p) => p.id)).toEqual(["agent:a", "agent:b"]);
  });

  it("encodes a chain with no subject", () => {
    const header = encodeDelegationHeader({ chain: [{ id: "agent:a" }] });
    expect(header).toBe("chain=agent%3Aa");
    expect(parseDelegationHeader(header)?.chain.map((p) => p.id)).toEqual([
      "agent:a",
    ]);
  });

  it("percent-encodes ids that would break the grammar", () => {
    const header = encodeDelegationHeader({ chain: [{ id: "a,b; c=d" }] });
    expect(parseDelegationHeader(header)?.chain[0]!.id).toBe("a,b; c=d");
  });

  it("ignores an empty or unparseable header", () => {
    expect(parseDelegationHeader("")).toBeUndefined();
    expect(parseDelegationHeader("garbage")).toBeUndefined();
    expect(parseDelegationHeader("chain=")).toBeUndefined();
  });

  it("tolerates whitespace and unknown segments", () => {
    const ctx = parseDelegationHeader(" chain = agent%3Aa ; foo=bar ");
    expect(ctx?.chain.map((p) => p.id)).toEqual(["agent:a"]);
  });
});

describe("delegation propagation", () => {
  it("passes the chain into a leaf tool's ctx", async () => {
    let seen: DelegationContext | undefined;
    const peek = defineTool({
      description: "peek",
      input: z.object({}),
      run: (_input, ctx) => {
        seen = ctx?.delegation;
        return "ok";
      },
    });
    const agent = createAgent({
      name: "solo",
      model: "m",
      tools: { peek },
      prompt: () => "go",
      client: scriptedClient([toolUse("t1", "peek", {}), endTurn("done")]),
    });

    await agent.run(
      {},
      {
        delegation: {
          subject: { id: "user:1" },
          chain: [{ id: "agent:solo" }],
        },
      },
    );
    expect(seen?.chain.map((p) => p.id)).toEqual(["agent:solo"]);
    expect(seen?.subject?.id).toBe("user:1");
  });

  it("ctx.delegation is undefined when no chain was seeded (backward compatible)", async () => {
    let seen: DelegationContext | undefined = { chain: [{ id: "sentinel" }] };
    const peek = defineTool({
      description: "peek",
      input: z.object({}),
      run: (_input, ctx) => {
        seen = ctx?.delegation;
        return "ok";
      },
    });
    const agent = createAgent({
      name: "solo",
      model: "m",
      tools: { peek },
      prompt: () => "go",
      client: scriptedClient([toolUse("t1", "peek", {}), endTurn("done")]),
    });

    await agent.run({});
    expect(seen).toBeUndefined();
  });

  it("extends the chain by one hop through an asTool sub-agent", async () => {
    let seen: DelegationContext | undefined;
    const peek = defineTool({
      description: "peek",
      input: z.object({}),
      run: (_input, ctx) => {
        seen = ctx?.delegation;
        return "ok";
      },
    });
    const verifier = createAgent({
      name: "verifier",
      model: "m",
      tools: { peek },
      inputSchema: z.object({}),
      prompt: () => "verify",
      client: scriptedClient([toolUse("v1", "peek", {}), endTurn("verified")]),
    });
    const director = createAgent({
      name: "director",
      model: "m",
      tools: { verify: verifier.asTool() },
      prompt: () => "delegate",
      client: scriptedClient([toolUse("d1", "verify", {}), endTurn("done")]),
    });

    await director.run(
      {},
      { delegation: { chain: [{ id: "agent:director" }] } },
    );
    // peek runs inside the sub-agent; it sees director THEN verifier.
    expect(seen?.chain.map((p) => p.id)).toEqual([
      "agent:director",
      "agent:verifier",
    ]);
  });
});

describe("authorizeToolCall", () => {
  function billing(
    authorize: (req: {
      tool: string;
      delegation?: DelegationContext;
      agent: string;
    }) => boolean | Promise<boolean>,
  ) {
    const ran: string[] = [];
    const records = defineTool({
      description: "read patient records",
      input: z.object({}),
      run: () => {
        ran.push("records");
        return "PHI";
      },
    });
    const agent = createAgent({
      name: "billing",
      model: "m",
      tools: { records },
      prompt: () => "go",
      hooks: { authorizeToolCall: authorize },
      client: scriptedClient([toolUse("t1", "records", {}), endTurn("done")]),
    });
    return { agent, ran };
  }

  it("denies a call (false) without running the tool; the run continues", async () => {
    const { agent, ran } = billing(() => false);
    const out = await agent.run(
      {},
      { delegation: { chain: [{ id: "agent:billing" }] } },
    );
    expect(ran).toEqual([]); // tool never executed
    expect(out).toBe("done"); // model saw the denial and finished
  });

  it("allows a call (true) and runs the tool", async () => {
    const { agent, ran } = billing(() => true);
    await agent.run({}, { delegation: { chain: [{ id: "agent:billing" }] } });
    expect(ran).toEqual(["records"]);
  });

  it("receives the tool, agent, and full delegation chain", async () => {
    let req:
      | { tool: string; agent: string; delegation?: DelegationContext }
      | undefined;
    const { agent } = billing((r) => {
      req = r;
      return true;
    });
    await agent.run(
      {},
      {
        delegation: {
          subject: { id: "user:1" },
          chain: [{ id: "agent:billing" }],
        },
      },
    );
    expect(req?.tool).toBe("records");
    expect(req?.agent).toBe("billing");
    expect(req?.delegation?.chain.map((p) => p.id)).toEqual(["agent:billing"]);
    expect(req?.delegation?.subject?.id).toBe("user:1");
  });

  it("aborts the whole run when the hook throws AuthorizationError", async () => {
    const { agent, ran } = billing(() => {
      throw new AuthorizationError("records");
    });
    await expect(
      agent.run({}, { delegation: { chain: [{ id: "agent:billing" }] } }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(ran).toEqual([]);
  });

  it("is opt-in: with no hook and no chain, the tool runs unchanged", async () => {
    const ran: string[] = [];
    const records = defineTool({
      description: "x",
      input: z.object({}),
      run: () => {
        ran.push("records");
        return "ok";
      },
    });
    const agent = createAgent({
      name: "billing",
      model: "m",
      tools: { records },
      prompt: () => "go",
      client: scriptedClient([toolUse("t1", "records", {}), endTurn("done")]),
    });
    await agent.run({});
    expect(ran).toEqual(["records"]);
  });
});

describe("confused-deputy: chain-wide policy across composition", () => {
  // Identity-based policy: who may reach each tool. Path-free.
  const MAY_REACH: Record<string, (id: string) => boolean> = {
    patient_records: (id) => id === "agent:billing",
  };
  const chainPolicy = (req: {
    tool: string;
    delegation?: DelegationContext;
  }): boolean => {
    const allow = MAY_REACH[req.tool];
    // EVERY actor in the chain must be permitted — the confused-deputy guard.
    return !!allow && (req.delegation?.chain ?? []).every((p) => allow(p.id));
  };

  it("blocks a sub-agent that should never touch the resource, even mid-chain", async () => {
    const ran: string[] = [];
    const patientRecords = defineTool({
      description: "read patient records",
      input: z.object({}),
      run: () => {
        ran.push("records");
        return "PHI";
      },
    });

    // The sub-agent tries to read patient records — it must be stopped.
    const verifier = createAgent({
      name: "verifier",
      model: "m",
      tools: { patient_records: patientRecords },
      inputSchema: z.object({}),
      prompt: () => "verify",
      hooks: { authorizeToolCall: chainPolicy },
      client: scriptedClient([
        toolUse("v1", "patient_records", {}),
        endTurn("verified"),
      ]),
    });

    const billing = createAgent({
      name: "billing",
      model: "m",
      tools: { verify: verifier.asTool() },
      prompt: () => "delegate",
      client: scriptedClient([toolUse("b1", "verify", {}), endTurn("done")]),
    });

    await billing.run(
      {},
      {
        delegation: {
          subject: { id: "user:1" },
          chain: [{ id: "agent:billing" }],
        },
      },
    );
    // chain at the sub-agent is [billing, verifier] → verifier fails the policy.
    expect(ran).toEqual([]);
  });

  it("allows the same tool when the orchestrator calls it directly", async () => {
    const ran: string[] = [];
    const patientRecords = defineTool({
      description: "read patient records",
      input: z.object({}),
      run: () => {
        ran.push("records");
        return "PHI";
      },
    });
    const billing = createAgent({
      name: "billing",
      model: "m",
      tools: { patient_records: patientRecords },
      prompt: () => "go",
      hooks: { authorizeToolCall: chainPolicy },
      client: scriptedClient([
        toolUse("b1", "patient_records", {}),
        endTurn("done"),
      ]),
    });

    await billing.run({}, { delegation: { chain: [{ id: "agent:billing" }] } });
    // chain is just [billing] → policy allows.
    expect(ran).toEqual(["records"]);
  });
});

describe("merged authorization (config + per-call)", () => {
  it("requires both to allow (AND semantics)", async () => {
    const ran: string[] = [];
    const tool = defineTool({
      description: "x",
      input: z.object({}),
      run: () => {
        ran.push("ran");
        return "ok";
      },
    });
    const agent = createAgent({
      name: "a",
      model: "m",
      tools: { tool },
      prompt: () => "go",
      hooks: { authorizeToolCall: () => true }, // config allows
      client: scriptedClient([toolUse("t1", "tool", {}), endTurn("done")]),
    });

    // Per-call hook denies → merged decision is deny.
    await agent.run(
      {},
      {
        delegation: { chain: [{ id: "agent:a" }] },
        hooks: { authorizeToolCall: () => false },
      },
    );
    expect(ran).toEqual([]);
  });
});
