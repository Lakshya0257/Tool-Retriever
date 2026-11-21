import { toolFields, type ToolFields } from "../document.js";
import { sum } from "../scoring.js";
import { tokenize } from "../tokenize.js";
import type { Ranker, RankerIndex, Tool } from "../types.js";

type FieldWeights = Record<keyof ToolFields, number>;

export interface Bm25Options {
  k1?: number;
  b?: number;
  fieldWeights?: Partial<FieldWeights>;
}

function termFrequencies(tool: Tool, weights: FieldWeights): Map<string, number> {
  const frequencies = new Map<string, number>();
  const fields = toolFields(tool);
  for (const field of Object.keys(fields) as (keyof ToolFields)[]) {
    for (const term of tokenize(fields[field])) {
      frequencies.set(term, (frequencies.get(term) ?? 0) + weights[field]);
    }
  }
  return frequencies;
}

export function bm25Ranker(options: Bm25Options = {}): Ranker {
  const k1 = options.k1 ?? 1.2;
  const b = options.b ?? 0.75;
  const weights: FieldWeights = { name: 3, description: 1, parameters: 1, ...options.fieldWeights };

  return {
    build(tools): RankerIndex {
      const documents = tools.map((tool) => termFrequencies(tool, weights));
      const lengths = documents.map((doc) => sum(doc.values()));
      const averageLength = sum(lengths) / Math.max(lengths.length, 1) || 1;
      const documentFrequency = new Map<string, number>();
      for (const doc of documents) {
        for (const term of doc.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
      }
      const idf = (term: string): number => {
        const df = documentFrequency.get(term) ?? 0;
        return Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      };

      return {
        score(query) {
          const terms = [...new Set(tokenize(query))];
          return documents.map((doc, i) => {
            const norm = k1 * (1 - b + (b * (lengths[i] ?? 0)) / averageLength);
            return sum(
              terms.map((term) => {
                const tf = doc.get(term) ?? 0;
                return tf === 0 ? 0 : (idf(term) * tf * (k1 + 1)) / (tf + norm);
              }),
            );
          });
        },
      };
    },
  };
}
