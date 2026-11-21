import type { Embedder, Ranker, RankerIndex, Tool } from "../types.js";

function toolText(tool: Tool): string {
  const params = Object.entries(tool.inputSchema.properties ?? {}).map(([key, schema]) =>
    schema.description ? `${key}: ${schema.description}` : key,
  );
  return [tool.name, tool.description, ...params].filter(Boolean).join("\n");
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

async function embedAll(embedder: Embedder, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const vectors = await embedder.embed(texts);
  if (vectors.length !== texts.length) {
    throw new Error(`Embedder returned ${vectors.length} vectors for ${texts.length} inputs`);
  }
  return vectors;
}

export function semanticRanker(embedder: Embedder): Ranker {
  return {
    async build(tools): Promise<RankerIndex> {
      const vectors = await embedAll(embedder, tools.map(toolText));
      return {
        async score(query) {
          if (vectors.length === 0 || query.trim().length === 0) return vectors.map(() => 0);
          const [queryVector = []] = await embedAll(embedder, [query]);
          return vectors.map((vector) => cosine(queryVector, vector));
        },
      };
    },
  };
}
