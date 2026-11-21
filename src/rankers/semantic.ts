import { toolText } from "../document.js";
import { cosine } from "../scoring.js";
import type { Embedder, Ranker, RankerIndex } from "../types.js";

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
