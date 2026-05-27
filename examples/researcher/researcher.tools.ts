import { defineTool } from "toad-runtime";
import { z } from "zod";

/**
 * Tool implementations for the researcher agent. These are demo stubs — swap in
 * a real search API and HTTP client. The `.agent` file references them by name;
 * `toac` wires them into the generated `researcher.ts`.
 */

export const web_search = defineTool({
  description: "Search the web for a query",
  input: z.object({ query: z.string() }),
  run: async ({ query }) => {
    return `(stub) top results for: ${query}`;
  },
});

export const fetch_page = defineTool({
  description: "Fetch and read a URL",
  input: z.object({ url: z.string() }),
  run: async ({ url }) => {
    const res = await fetch(url);
    return await res.text();
  },
});
