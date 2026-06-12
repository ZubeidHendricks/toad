import { defineConfig } from "vitepress";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The canonical .agent TextMate grammar — shared with the VS Code extension.
const agentGrammar = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../editors/vscode/syntaxes/agent.tmLanguage.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
);

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "TOAD",
  description:
    "TOAD — Token-Oriented Agentic Development. Write an AI agent as a tiny declarative .agent file; the toac compiler emits readable, fully-typed TypeScript that runs on Claude.",
  base: "/toad/",
  lang: "en-US",
  appearance: "dark",
  lastUpdated: true,

  head: [
    [
      "link",
      {
        rel: "icon",
        href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%230a0f0d'/><circle cx='11' cy='13' r='3.2' fill='%234ade80'/><circle cx='21' cy='13' r='3.2' fill='%234ade80'/><path d='M8 20 q8 7 16 0' fill='none' stroke='%234ade80' stroke-width='2' stroke-linecap='round'/></svg>",
      },
    ],
    ["meta", { property: "og:title", content: "TOAD — Token-Oriented Agentic Development" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Write an AI agent as a tiny declarative .agent file; a compiler emits readable, typed TypeScript that runs on Claude.",
      },
    ],
  ],

  markdown: {
    // .agent gets its own grammar; plain TOON reads well enough as YAML.
    languages: [{ ...agentGrammar, name: "agent" }],
    languageAlias: { toon: "yaml" },
  },

  themeConfig: {
    logo: "/toad_robo.png",

    nav: [
      {
        text: "Guide",
        activeMatch: "/guide/",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Tutorial", link: "/guide/tutorial" },
          { text: "The .agent Format", link: "/guide/agent-format" },
          { text: "Prompt Templates", link: "/guide/templates" },
          { text: "Write Agents with AI", link: "/guide/writing-with-ai" },
        ],
      },
      {
        text: "Reference",
        activeMatch: "/reference/",
        items: [
          { text: "The .agent Specification", link: "/reference/spec" },
          { text: "CLI (toac)", link: "/reference/cli" },
          { text: "Runtime (toad-runtime)", link: "/reference/runtime" },
        ],
      },
      { text: "Playground", link: "/playground", activeMatch: "/playground" },
      { text: "Benchmarks", link: "/benchmarks", activeMatch: "/benchmarks" },
      {
        text: "Ecosystem",
        activeMatch: "/(ecosystem|examples|blog)",
        items: [
          { text: "Overview", link: "/ecosystem" },
          { text: "Examples", link: "/examples" },
          { text: "Release Notes", link: "/blog/" },
        ],
      },
      {
        text: "v0.1.0",
        items: [
          {
            text: "Release Notes",
            link: "https://github.com/ZubeidHendricks/toad/releases",
          },
          {
            text: "toad-compiler on npm",
            link: "https://www.npmjs.com/package/toad-compiler",
          },
          {
            text: "toad-runtime on npm",
            link: "https://www.npmjs.com/package/toad-runtime",
          },
        ],
      },
    ],

    sidebar: {
      "/guide/": guideSidebar(),
      "/reference/": guideSidebar(),
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/ZubeidHendricks/toad" },
      { icon: "npm", link: "https://www.npmjs.com/package/toad-compiler" },
    ],

    search: {
      provider: "local",
    },

    editLink: {
      pattern: "https://github.com/ZubeidHendricks/toad/edit/main/site/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "TOAD — Token-Oriented Agentic Development",
    },

    outline: { level: [2, 3] },
  },
});

function guideSidebar() {
  return [
    {
      text: "Guide",
      items: [
        { text: "Getting Started", link: "/guide/getting-started" },
        { text: "Tutorial", link: "/guide/tutorial" },
        { text: "The .agent Format", link: "/guide/agent-format" },
        { text: "Prompt Templates", link: "/guide/templates" },
        { text: "Write Agents with AI", link: "/guide/writing-with-ai" },
      ],
    },
    {
      text: "Reference",
      items: [
        { text: "The .agent Specification", link: "/reference/spec" },
        { text: "CLI (toac)", link: "/reference/cli" },
        { text: "Runtime (toad-runtime)", link: "/reference/runtime" },
      ],
    },
    {
      text: "Resources",
      items: [
        { text: "Playground", link: "/playground" },
        { text: "Examples", link: "/examples" },
        { text: "Benchmarks", link: "/benchmarks" },
        { text: "Ecosystem", link: "/ecosystem" },
        { text: "Release Notes", link: "/blog/" },
      ],
    },
  ];
}
