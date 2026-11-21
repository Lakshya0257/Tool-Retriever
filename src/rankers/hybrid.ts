import type { Ranker, RankerIndex } from "../types.js";

export interface WeightedRanker {
  ranker: Ranker;
  weight: number;
}

function normalize(scores: readonly number[]): number[] {
  const max = Math.max(0, ...scores);
  return scores.map((score) => (max === 0 ? 0 : Math.max(0, score) / max));
}

export function hybridRanker(components: readonly WeightedRanker[]): Ranker {
  if (components.length === 0) throw new Error("hybridRanker needs at least one ranker");
  if (components.some(({ weight }) => !(weight >= 0))) throw new RangeError("Ranker weights must be non-negative");
  const totalWeight = components.reduce((sum, { weight }) => sum + weight, 0);
  if (totalWeight === 0) throw new RangeError("At least one ranker weight must be positive");

  return {
    async build(tools): Promise<RankerIndex> {
      const indexes = await Promise.all(components.map(({ ranker }) => ranker.build(tools)));
      return {
        async score(query) {
          const results = await Promise.all(indexes.map((index) => index.score(query)));
          const combined = tools.map(() => 0);
          results.forEach((scores, i) => {
            const weight = (components[i]?.weight ?? 0) / totalWeight;
            normalize(scores).forEach((score, j) => (combined[j] = (combined[j] ?? 0) + weight * score));
          });
          return combined;
        },
      };
    },
  };
}
