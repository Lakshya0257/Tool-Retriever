import { normalizeScores, sum } from "../scoring.js";
import type { Ranker, RankerIndex } from "../types.js";

export interface WeightedRanker {
  ranker: Ranker;
  weight: number;
}

export function hybridRanker(components: readonly WeightedRanker[]): Ranker {
  if (components.length === 0) throw new Error("hybridRanker needs at least one ranker");
  if (components.some(({ weight }) => !(weight >= 0)))
    throw new RangeError("Ranker weights must be non-negative");
  const totalWeight = sum(components.map(({ weight }) => weight));
  if (totalWeight === 0) throw new RangeError("At least one ranker weight must be positive");

  return {
    async build(tools): Promise<RankerIndex> {
      const indexes = await Promise.all(components.map(async ({ ranker }) => ranker.build(tools)));
      return {
        async score(query) {
          const results = await Promise.all(indexes.map(async (index) => index.score(query)));
          const combined = tools.map(() => 0);
          results.forEach((scores, i) => {
            const weight = (components[i]?.weight ?? 0) / totalWeight;
            normalizeScores(scores).forEach(
              (score, j) => (combined[j] = (combined[j] ?? 0) + weight * score),
            );
          });
          return combined;
        },
      };
    },
  };
}
