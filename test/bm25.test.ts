import { describe, expect, it } from "vitest";
import { bm25Ranker, normalizeTools } from "../src/index.js";
import { tools as definitions } from "./fixtures.js";

const tools = normalizeTools(definitions);

async function topName(query: string, ranker = bm25Ranker()): Promise<string | undefined> {
  const scores = await (await ranker.build(tools)).score(query);
  const best = scores.reduce((bestIndex, score, i) => (score > (scores[bestIndex] ?? 0) ? i : bestIndex), 0);
  return (scores[best] ?? 0) > 0 ? tools[best]?.name : undefined;
}

describe("bm25Ranker", () => {
  it("ranks by name, description and parameters", async () => {
    expect(await topName("email the report to Sam")).toBe("send_email");
    expect(await topName("what's the forecast in Paris")).toBe("get_weather");
    expect(await topName("schedule a meeting with the team")).toBe("create_calendar_event");
    expect(await topName("look up a contact at Acme")).toBe("searchContacts");
  });

  it("matches enum values and nested item descriptions", async () => {
    expect(await topName("fahrenheit")).toBe("get_weather");
    expect(await topName("attendee")).toBe("create_calendar_event");
  });

  it("returns zero scores when nothing matches", async () => {
    const scores = await (await bm25Ranker().build(tools)).score("quantum chromodynamics");
    expect(scores).toHaveLength(tools.length);
    expect(scores.every((score) => score === 0)).toBe(true);
  });

  it("handles an empty tool list", async () => {
    const index = await bm25Ranker().build([]);
    expect(await index.score("anything")).toEqual([]);
  });

  it("respects field weights", async () => {
    const both = normalizeTools([
      { name: "remove", description: "archive it" },
      { name: "archive", description: "remove it" },
    ]);
    const nameHeavy = await bm25Ranker({ fieldWeights: { name: 5, description: 1 } }).build(both);
    const [a, b] = await nameHeavy.score("archive");
    expect(b).toBeGreaterThan(a ?? 0);
    const descriptionHeavy = await bm25Ranker({ fieldWeights: { name: 1, description: 5 } }).build(both);
    const [c, d] = await descriptionHeavy.score("archive");
    expect(c).toBeGreaterThan(d ?? 0);
  });
});
