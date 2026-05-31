// Bundled to site/toad-tokenizer.js by `pnpm build:site`. Exposes an exact
// GPT token count (gpt-tokenizer, o200k/cl100k) for the playground's meters —
// a close, real-world proxy for Claude's tokenizer, which has no public lib.
export { countTokens } from "gpt-tokenizer";
