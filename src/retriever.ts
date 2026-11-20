import { normalizeTools } from "./normalize.js";
import { bm25Ranker } from "./rankers/bm25.js";
import { toRegistry } from "./registries/array.js";
import type { Ranker, RankerIndex, ScoredTool, Tool, ToolDefinition, ToolRegistry } from "./types.js";

export type ToolPin = string | ((tool: Tool) => boolean);

export interface ToolRetrieverOptions {
  registry: ToolRegistry | readonly ToolDefinition[];
  topK?: number;
  alwaysInclude?: readonly ToolPin[];
  ranker?: Ranker;
  minScore?: number;
}

export interface SelectOptions {
  topK?: number;
}

interface Index {
  tools: Tool[];
  pinned: Set<string>;
  ranker: RankerIndex;
}

function assertTopK(topK: number): number {
  if (!Number.isInteger(topK) || topK < 0) {
    throw new RangeError(`topK must be a non-negative integer, received ${topK}`);
  }
  return topK;
}

function resolvePins(tools: readonly Tool[], pins: readonly ToolPin[]): Set<string> {
  const names = new Set(tools.map((tool) => tool.name));
  const pinned = new Set<string>();
  for (const pin of pins) {
    if (typeof pin === "string") {
      if (!names.has(pin)) throw new Error(`alwaysInclude references unknown tool: ${pin}`);
      pinned.add(pin);
    } else {
      for (const tool of tools) if (pin(tool)) pinned.add(tool.name);
    }
  }
  return pinned;
}

export class ToolRetriever {
  readonly #registry: ToolRegistry;
  readonly #ranker: Ranker;
  readonly #topK: number;
  readonly #pins: readonly ToolPin[];
  readonly #minScore: number;
  #current: Promise<Index> | undefined;
  #generation = 0;

  constructor(options: ToolRetrieverOptions) {
    this.#registry = toRegistry(options.registry);
    this.#ranker = options.ranker ?? bm25Ranker();
    this.#topK = assertTopK(options.topK ?? 3);
    this.#pins = options.alwaysInclude ?? [];
    this.#minScore = options.minScore ?? 0;
  }

  async select(query: string, options: SelectOptions = {}): Promise<Tool[]> {
    const topK = assertTopK(options.topK ?? this.#topK);
    const index = await this.#load();
    const { tools, pinned } = index;
    const ranked = (await this.#rank(index, query))
      .filter(({ tool, score }) => !pinned.has(tool.name) && score > this.#minScore)
      .slice(0, topK)
      .map(({ tool }) => tool);
    return [...ranked, ...tools.filter((tool) => pinned.has(tool.name))];
  }

  async rank(query: string): Promise<ScoredTool[]> {
    return this.#rank(await this.#load(), query);
  }

  async tools(): Promise<Tool[]> {
    return [...(await this.#load()).tools];
  }

  async refresh(): Promise<void> {
    const generation = ++this.#generation;
    const next = await this.#build();
    if (generation === this.#generation) this.#current = Promise.resolve(next);
  }

  async #rank({ tools, ranker }: Index, query: string): Promise<ScoredTool[]> {
    const scores = await ranker.score(query);
    if (scores.length !== tools.length) {
      throw new Error(`Ranker returned ${scores.length} scores for ${tools.length} tools`);
    }
    return tools
      .map((tool, i) => ({ tool, score: scores[i] ?? 0 }))
      .sort((a, b) => b.score - a.score);
  }

  #load(): Promise<Index> {
    if (!this.#current) {
      const pending = this.#build();
      this.#current = pending;
      pending.catch(() => {
        if (this.#current === pending) this.#current = undefined;
      });
    }
    return this.#current;
  }

  async #build(): Promise<Index> {
    const tools = normalizeTools(await this.#registry.list());
    const pinned = resolvePins(tools, this.#pins);
    const ranker = await this.#ranker.build(tools);
    return { tools, pinned, ranker };
  }
}
