import { describe, expect, it } from "vitest";
import {
  bm25Ranker,
  hybridRanker,
  normalizeTools,
  semanticRanker,
  ToolRetriever,
  type Embedder,
  type Ranker,
} from "../src/index.js";
import { conceptEmbedder } from "./embedder.js";
import { tools as definitions } from "./fixtures.js";

const tools = normalizeTools(definitions);
const names = (list: { name: string }[]) => list.map((tool) => tool.name);

describe("semanticRanker", () => {
  it("finds tools that share meaning but not words with the query", async () => {
    const retriever = new ToolRetriever({ registry: definitions, ranker: semanticRanker(conceptEmbedder()), topK: 1 });
    expect(names(await retriever.select("do I need an umbrella"))).toEqual(["get_weather"]);
    expect(names(await retriever.select("ping my colleague"))).toEqual(["send_email"]);
  });

  it("embeds tools once at build time and only the query per step", async () => {
    const embedder = conceptEmbedder();
    const index = await semanticRanker(embedder).build(tools);
    await index.score("rain");
    await index.score("wipe");
    expect(embedder.calls.map((call) => call.length)).toEqual([tools.length, 1, 1]);
  });

  it("skips the embedder for empty queries and registries", async () => {
    const embedder = conceptEmbedder();
    expect(await (await semanticRanker(embedder).build([])).score("rain")).toEqual([]);
    expect(await (await semanticRanker(embedder).build(tools)).score("   ")).toEqual(tools.map(() => 0));
    expect(embedder.calls).toHaveLength(1);
  });

  it("scores zero vectors as zero", async () => {
    const index = await semanticRanker(conceptEmbedder()).build(tools);
    expect((await index.score("quantum")).every((score) => score === 0)).toBe(true);
  });

  it("rejects embedders that return the wrong number of vectors", async () => {
    const broken: Embedder = { embed: async () => [[1]] };
    await expect(semanticRanker(broken).build(tools)).rejects.toThrow(
      `Embedder returned 1 vectors for ${tools.length} inputs`,
    );
  });
});

describe("hybridRanker", () => {
  const fixed = (scores: number[]): Ranker => ({ build: () => ({ score: () => scores }) });

  it("normalizes each ranker and blends by weight", async () => {
    const pair = normalizeTools([{ name: "a" }, { name: "b" }]);
    const index = await hybridRanker([
      { ranker: fixed([10, 5]), weight: 1 },
      { ranker: fixed([0.2, 0.8]), weight: 3 },
    ]).build(pair);
    const [a, b] = await index.score("q");
    expect(a).toBeCloseTo(0.25 * 1 + 0.75 * 0.25);
    expect(b).toBeCloseTo(0.25 * 0.5 + 0.75 * 1);
  });

  it("treats negative and all-zero scores as zero", async () => {
    const pair = normalizeTools([{ name: "a" }, { name: "b" }]);
    const index = await hybridRanker([
      { ranker: fixed([-1, 0]), weight: 1 },
      { ranker: fixed([0, 0]), weight: 1 },
    ]).build(pair);
    expect(await index.score("q")).toEqual([0, 0]);
  });

  it("validates its configuration", () => {
    expect(() => hybridRanker([])).toThrow("hybridRanker needs at least one ranker");
    expect(() => hybridRanker([{ ranker: bm25Ranker(), weight: -1 }])).toThrow(RangeError);
    expect(() => hybridRanker([{ ranker: bm25Ranker(), weight: Number.NaN }])).toThrow(RangeError);
    expect(() => hybridRanker([{ ranker: bm25Ranker(), weight: 0 }])).toThrow(RangeError);
  });
});

describe("ToolRetriever with an embedder", () => {
  it("uses hybrid keyword and semantic ranking by default", async () => {
    const retriever = new ToolRetriever({ registry: definitions, embedder: conceptEmbedder(), topK: 2 });
    expect(names(await retriever.select("wipe the old document"))).toEqual(["delete_file", "read_file"]);
    expect(names(await retriever.select("get_weather"))[0]).toBe("get_weather");
  });

  it("lets semanticWeight shift the balance", async () => {
    const keywordOnly = new ToolRetriever({
      registry: definitions,
      embedder: conceptEmbedder(),
      semanticWeight: 0,
      topK: 1,
    });
    expect(await keywordOnly.select("umbrella")).toEqual([]);
    const semanticOnly = new ToolRetriever({
      registry: definitions,
      embedder: conceptEmbedder(),
      semanticWeight: 1,
      topK: 1,
    });
    expect(names(await semanticOnly.select("umbrella"))).toEqual(["get_weather"]);
  });

  it("rejects a semanticWeight outside 0..1", () => {
    expect(() => new ToolRetriever({ registry: [], embedder: conceptEmbedder(), semanticWeight: 1.5 })).toThrow(
      RangeError,
    );
  });
});
