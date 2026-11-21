import { describe, expect, it, vi } from "vitest";
import { arrayRegistry, ToolRetriever, type Ranker, type ToolDefinition } from "../src/index.js";
import { tools } from "./fixtures.js";

const names = (list: { name: string }[]) => list.map((tool) => tool.name);

describe("ToolRetriever.select", () => {
  it("returns the top-k relevant tools", async () => {
    const retriever = new ToolRetriever({ registry: tools, topK: 1 });
    expect(names(await retriever.select("email the quarterly report"))).toEqual(["send_email"]);
  });

  it("defaults topK to 3 and orders by score", async () => {
    const retriever = new ToolRetriever({ registry: tools });
    const selected = names(await retriever.select("email a file and schedule a meeting with attendees"));
    expect(selected).toHaveLength(3);
    expect(selected[0]).toBe("create_calendar_event");
  });

  it("omits tools that do not match the query", async () => {
    const retriever = new ToolRetriever({ registry: tools, topK: 5 });
    expect(names(await retriever.select("weather"))).toEqual(["get_weather"]);
    expect(await retriever.select("")).toEqual([]);
  });

  it("allows overriding topK per call", async () => {
    const retriever = new ToolRetriever({ registry: tools, topK: 1 });
    expect(await retriever.select("file", { topK: 2 })).toHaveLength(2);
    expect(await retriever.select("file", { topK: 0 })).toEqual([]);
  });

  it("applies minScore", async () => {
    const retriever = new ToolRetriever({ registry: tools, topK: 5, minScore: 100 });
    expect(await retriever.select("email")).toEqual([]);
  });

  it("returns normalized tools", async () => {
    const retriever = new ToolRetriever({ registry: tools, topK: 1 });
    const [tool] = await retriever.select("calendar");
    expect(tool).toMatchObject({ name: "create_calendar_event", inputSchema: { type: "object" } });
  });

  it("rejects an invalid topK", () => {
    expect(() => new ToolRetriever({ registry: tools, topK: -1 })).toThrow(RangeError);
    expect(() => new ToolRetriever({ registry: tools, topK: 1.5 })).toThrow(RangeError);
    const retriever = new ToolRetriever({ registry: tools });
    return expect(retriever.select("x", { topK: Number.NaN })).rejects.toThrow(RangeError);
  });

  it("works with an empty registry", async () => {
    const retriever = new ToolRetriever({ registry: [] });
    expect(await retriever.select("anything")).toEqual([]);
  });
});

describe("alwaysInclude", () => {
  it("appends pinned tools even when irrelevant", async () => {
    const retriever = new ToolRetriever({ registry: tools, topK: 1, alwaysInclude: ["delete_file"] });
    expect(names(await retriever.select("weather in Oslo"))).toEqual(["get_weather", "delete_file"]);
    expect(names(await retriever.select("nothing relevant here"))).toEqual(["delete_file"]);
  });

  it("does not let pinned tools consume top-k slots or appear twice", async () => {
    const retriever = new ToolRetriever({ registry: tools, topK: 1, alwaysInclude: ["send_email"] });
    expect(names(await retriever.select("email the team about the weather"))).toEqual([
      "get_weather",
      "send_email",
    ]);
  });

  it("accepts predicates", async () => {
    const retriever = new ToolRetriever({
      registry: tools,
      topK: 0,
      alwaysInclude: [(tool) => tool.annotations?.["destructiveHint"] === true, "send_email"],
    });
    expect(names(await retriever.select("anything"))).toEqual(["send_email", "delete_file"]);
  });

  it("fails loudly on unknown pinned names", async () => {
    const retriever = new ToolRetriever({ registry: tools, alwaysInclude: ["delete_fiel"] });
    await expect(retriever.select("x")).rejects.toThrow("alwaysInclude references unknown tool: delete_fiel");
  });
});

describe("index caching and refresh", () => {
  it("builds the index once and reuses it across steps", async () => {
    const list = vi.fn(() => tools);
    const retriever = new ToolRetriever({ registry: { list } });
    await Promise.all([retriever.select("email"), retriever.select("weather"), retriever.rank("file")]);
    await retriever.select("calendar");
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("picks up registry changes on refresh", async () => {
    const current: ToolDefinition[] = [{ name: "get_weather", description: "weather forecast" }];
    const retriever = new ToolRetriever({ registry: arrayRegistry(current) });
    expect(names(await retriever.select("translate text"))).toEqual([]);
    current.push({ name: "translate", description: "Translate text between languages" });
    expect(names(await retriever.select("translate text"))).toEqual([]);
    await retriever.refresh();
    expect(names(await retriever.select("translate text"))).toEqual(["translate"]);
  });

  it("keeps serving the previous index if a refresh fails", async () => {
    const list = vi.fn<() => Promise<ToolDefinition[]>>().mockResolvedValueOnce(tools);
    const retriever = new ToolRetriever({ registry: { list }, topK: 1 });
    await retriever.select("email");
    list.mockRejectedValueOnce(new Error("server down"));
    await expect(retriever.refresh()).rejects.toThrow("server down");
    expect(names(await retriever.select("email"))).toEqual(["send_email"]);
  });

  it("retries the initial build after a failure", async () => {
    const list = vi
      .fn<() => Promise<ToolDefinition[]>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(tools);
    const retriever = new ToolRetriever({ registry: { list }, topK: 1 });
    await expect(retriever.select("email")).rejects.toThrow("boom");
    expect(names(await retriever.select("email"))).toEqual(["send_email"]);
  });

  it("lets the latest refresh win when refreshes overlap", async () => {
    let release: (defs: ToolDefinition[]) => void = () => {};
    const slow = new Promise<ToolDefinition[]>((resolve) => (release = resolve));
    const list = vi
      .fn<() => Promise<ToolDefinition[]>>()
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce([{ name: "fresh", description: "fresh tool" }]);
    const retriever = new ToolRetriever({ registry: { list } });
    const first = retriever.refresh();
    await retriever.refresh();
    release([{ name: "stale", description: "stale tool" }]);
    await first;
    expect(names(await retriever.tools())).toEqual(["fresh"]);
  });

  it("surfaces duplicate tool names from the registry", async () => {
    const retriever = new ToolRetriever({ registry: [{ name: "a" }, { name: "a" }] });
    await expect(retriever.tools()).rejects.toThrow("Duplicate tool name: a");
  });
});

describe("rank", () => {
  it("returns every tool with its score, best first", async () => {
    const retriever = new ToolRetriever({ registry: tools });
    const ranked = await retriever.rank("read a file");
    expect(ranked).toHaveLength(tools.length);
    expect(ranked[0]?.tool.name).toBe("read_file");
    expect(ranked.map((r) => r.score)).toEqual([...ranked.map((r) => r.score)].sort((a, b) => b - a));
  });

  it("supports custom rankers and validates their output", async () => {
    const reverse: Ranker = { build: (list) => ({ score: () => list.map((_, i) => i) }) };
    const retriever = new ToolRetriever({ registry: tools, ranker: reverse, topK: 1 });
    expect(names(await retriever.select("anything"))).toEqual(["read_file"]);

    const broken: Ranker = { build: () => ({ score: () => [1] }) };
    await expect(new ToolRetriever({ registry: tools, ranker: broken }).select("x")).rejects.toThrow(
      `Ranker returned 1 scores for ${tools.length} tools`,
    );
  });
});
