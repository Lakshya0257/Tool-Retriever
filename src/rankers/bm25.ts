import { tokenize } from "../tokenize.js";
import type { JsonSchema, Ranker, RankerIndex, Tool } from "../types.js";

export interface Bm25Options {
  k1?: number;
  b?: number;
  fieldWeights?: Partial<Record<"name" | "description" | "parameters", number>>;
}

function collectParameterText(schema: JsonSchema | undefined, out: string[]): void {
  if (!schema || typeof schema !== "object") return;
  if (schema.description) out.push(schema.description);
  if (schema.enum) out.push(...schema.enum.filter((value) => typeof value === "string"));
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    out.push(key);
    collectParameterText(child, out);
  }
  const items = Array.isArray(schema.items) ? schema.items : schema.items ? [schema.items] : [];
  for (const item of items) collectParameterText(item, out);
}

function termFrequencies(
  tool: Tool,
  weights: Record<"name" | "description" | "parameters", number>,
): Map<string, number> {
  const params: string[] = [];
  collectParameterText(tool.inputSchema, params);
  const fields: [string, number][] = [
    [tool.name, weights.name],
    [tool.description, weights.description],
    [params.join(" "), weights.parameters],
  ];
  const frequencies = new Map<string, number>();
  for (const [text, weight] of fields) {
    for (const term of tokenize(text)) frequencies.set(term, (frequencies.get(term) ?? 0) + weight);
  }
  return frequencies;
}

export function bm25Ranker(options: Bm25Options = {}): Ranker {
  const k1 = options.k1 ?? 1.2;
  const b = options.b ?? 0.75;
  const weights = { name: 3, description: 1, parameters: 1, ...options.fieldWeights };

  return {
    build(tools): RankerIndex {
      const documents = tools.map((tool) => termFrequencies(tool, weights));
      const lengths = documents.map((doc) => [...doc.values()].reduce((sum, n) => sum + n, 0));
      const averageLength = lengths.reduce((sum, n) => sum + n, 0) / Math.max(lengths.length, 1) || 1;
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
            return terms.reduce((total, term) => {
              const tf = doc.get(term) ?? 0;
              return tf === 0 ? total : total + (idf(term) * tf * (k1 + 1)) / (tf + norm);
            }, 0);
          });
        },
      };
    },
  };
}
