# tool-retriever

[![CI](https://github.com/Lakshya0257/Tool-Retriever/actions/workflows/ci.yml/badge.svg)](https://github.com/Lakshya0257/Tool-Retriever/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Stop sending your agent the entire tool manual. Send it the three tools it actually wants.

`tool-retriever` sits in front of any agent loop and returns only the tool schemas that matter for the current step. It is framework-agnostic, written in TypeScript, and has zero runtime dependencies.

```bash
npm install tool-retriever
```

## Why

Agents get worse and more expensive as you hand them more tools. Wire up a few MCP servers and you can easily reach 60 tools. At around 500 tokens per schema, that is 30,000 tokens of tool definitions on every single step, before the model has read a word of the conversation. Most of those tools are irrelevant to the step at hand, and every extra one is another chance for the model to pick the wrong tool.

`tool-retriever` ranks your tools against the current query and sends only the top few.

## Quick start

### Vercel AI SDK

Keep all your tools registered as usual. `activeToolsStep` plugs into `prepareStep` and narrows `activeTools` to the retrieved ones on every step, so the model only sees their schemas while every tool can still execute.

```ts
import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs } from "ai";
import { ToolRetriever, activeToolsStep, aiSdkRegistry } from "tool-retriever";

const retriever = new ToolRetriever({
  registry: aiSdkRegistry(tools),
  topK: 3,
  alwaysInclude: ["askHuman"],
});

const result = streamText({
  model: openai("gpt-5"),
  tools,
  messages,
  stopWhen: stepCountIs(10),
  prepareStep: activeToolsStep(retriever, tools),
});
```

- `aiSdkRegistry` reads each tool's description and input schema. Zod 4, `jsonSchema()` and lazy schemas are handled without importing `ai`; pass `toJsonSchema: (schema) => asSchema(schema).jsonSchema` for anything else.
- The query defaults to the text of the latest user message. Pass `{ query: (messages) => ... }` to change it.
- The selection is reused across steps while the query stays the same, so a multi-step tool loop costs one retrieval per user turn.
- If there is no user text, `prepareStep` returns nothing and all tools stay active.
- Returned names are typed as keys of your tool set. Tested against AI SDK 7.

### Any other loop

```ts
import { ToolRetriever } from "tool-retriever";

const retriever = new ToolRetriever({ registry: tools, topK: 3, alwaysInclude: ["ask_human"] });

const selected = await retriever.select(userMessage);
```

`select` returns normalized `{ name, description, inputSchema }` tools. `tools` can be any array in the common JSON-schema shape: `{ name, description, inputSchema }`, `{ name, description, input_schema }`, `{ name, description, parameters }`, or OpenAI's `{ type: "function", function: { ... } }`.

## How it works

1. **Index once.** On the first `select`, the retriever lists your registry, normalizes every tool and builds a search index over its name, description, and parameter names and descriptions.
2. **Retrieve per step.** Each `select(query)` scores every tool against the query and returns the top-k by similarity.
3. **Cache the rest.** The index is reused across steps and only rebuilt when you call `refresh()`. Concurrent calls share a single build.
4. **MCP servers are registries.** Point the retriever at any MCP client. Schemas are fetched from the server on demand when the index is built, not when you construct the retriever.

### Ranking

| Mode     | How to enable                      | What it does                                                                                          |
| -------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Keyword  | Default, zero config               | BM25 with field weighting (name > description = parameters), identifier splitting and light stemming. |
| Hybrid   | Pass an `embedder`                 | Normalized blend of BM25 and embedding similarity, weighted by `semanticWeight` (default `0.5`).      |
| Semantic | `ranker: semanticRanker(embedder)` | Cosine similarity between query and tool embeddings only.                                             |
| Custom   | `ranker: { build(tools) { ... } }` | Bring your own scoring.                                                                               |

An embedder is any object with `embed(texts: string[]): Promise<number[][]>`, so you can use whichever provider you like:

```ts
import { embedMany } from "ai";
import { ToolRetriever, aiSdkRegistry } from "tool-retriever";

const retriever = new ToolRetriever({
  registry: aiSdkRegistry(tools),
  embedder: {
    embed: async (values) => (await embedMany({ model: "openai/text-embedding-3-small", values })).embeddings,
  },
});
```

Tool embeddings are computed once per index build. Each `select` embeds only the query.

### MCP

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ToolRetriever, combineRegistries, mcpRegistry } from "tool-retriever";

const retriever = new ToolRetriever({
  registry: combineRegistries(
    mcpRegistry(githubClient, { prefix: "github__" }),
    mcpRegistry(linearClient, { prefix: "linear__" }),
  ),
});
```

`mcpRegistry` accepts anything with a `listTools({ cursor })` method, follows pagination, and keeps tool annotations. `@modelcontextprotocol/sdk` is an optional peer dependency and is never imported by this package. When a server's tool list changes, call `retriever.refresh()`.

## Safety

Side-effecting tools are never excluded on the basis of what they do. The retriever only ranks by relevance, so a destructive tool is treated like any other. If a tool must always be available, pin it with `alwaysInclude`, either by name or with a predicate:

```ts
new ToolRetriever({
  registry,
  alwaysInclude: ["ask_human", (tool) => tool.annotations?.destructiveHint === true],
});
```

Pinned tools are added after the top-k, never take a top-k slot and never appear twice. An unknown name in `alwaysInclude` throws instead of being silently dropped.

The retriever decides what's relevant, never what's allowed. Authorization still belongs in your agent loop.

## API

| Member                                     | Description                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new ToolRetriever(options)`               | `registry` (array or `ToolRegistry`), `topK = 3`, `alwaysInclude = []`, plus optional `embedder`, `semanticWeight = 0.5`, `ranker`, `minScore = 0`. |
| `await retriever.select(query, { topK? })` | The top-k tools with a score above `minScore`, followed by every `alwaysInclude` tool.                                                              |
| `await retriever.rank(query)`              | Every tool with its score, best first. Useful for debugging and evaluation.                                                                         |
| `await retriever.tools()`                  | All indexed tools, normalized to `{ name, description, inputSchema, annotations? }`.                                                                |
| `await retriever.refresh()`                | Rebuilds the index from the registry. If the rebuild fails, the previous index stays in use.                                                        |

Helpers:

| Export                                          | Description                                                |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `aiSdkRegistry(tools, { toJsonSchema? })`       | Indexes a Vercel AI SDK tool set.                          |
| `activeToolsStep(retriever, tools, { query? })` | A `prepareStep` function that sets `activeTools` per step. |
| `arrayRegistry(tools)`                          | Wraps a mutable array so `refresh()` picks up changes.     |
| `mcpRegistry(client, { prefix?, filter? })`     | Lists tools from any MCP client.                           |
| `combineRegistries(...registries)`              | Merges registries. Duplicate tool names throw.             |
| `bm25Ranker(options?)`                          | Keyword ranker with tunable `k1`, `b` and `fieldWeights`.  |
| `semanticRanker(embedder)`                      | Embedding ranker.                                          |
| `hybridRanker([{ ranker, weight }, ...])`       | Weighted blend of any rankers.                             |

## Roadmap

- [x] Hybrid semantic + keyword ranking
- [ ] Per-user tool-frequency priors
- [x] Vercel AI SDK adapter
- [ ] LangChain, LlamaIndex and OpenAI Agents adapters

## Contributing

Issues and pull requests are welcome. A few ground rules:

- Keep the core framework-agnostic and dependency-free. Framework integrations belong in adapters.
- Every change comes with tests. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` before opening a PR.
- No hype. Claims in docs and PRs should be backed by a test or a benchmark.

## License

[MIT](LICENSE)
