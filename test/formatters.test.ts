import { describe, expect, it } from "vitest";
import {
  normalizeTools,
  toAnthropicTools,
  toOpenAIResponsesTools,
  toOpenAITools,
  ToolRetriever,
} from "../src/index.js";
import { tools as definitions } from "./fixtures.js";

const weather = normalizeTools([
  {
    name: "get_weather",
    description: "Weather for a city",
    inputSchema: { type: "object", properties: { city: { type: "string" } } },
  },
]);
const schema = { type: "object", properties: { city: { type: "string" } } };

describe("formatters", () => {
  it("formats OpenAI chat completions tools", () => {
    expect(toOpenAITools(weather)).toEqual([
      {
        type: "function",
        function: { name: "get_weather", description: "Weather for a city", parameters: schema },
      },
    ]);
  });

  it("formats OpenAI responses tools", () => {
    expect(toOpenAIResponsesTools(weather)).toEqual([
      { type: "function", name: "get_weather", description: "Weather for a city", parameters: schema },
    ]);
  });

  it("formats Anthropic tools", () => {
    expect(toAnthropicTools(weather)).toEqual([
      { name: "get_weather", description: "Weather for a city", input_schema: schema },
    ]);
  });

  it("round-trips selected tools from mixed input shapes", async () => {
    const retriever = new ToolRetriever({ registry: definitions, topK: 1 });
    const selected = await retriever.select("schedule a meeting");
    expect(toAnthropicTools(selected)[0]?.input_schema).toMatchObject({
      properties: { title: { type: "string" } },
    });
    expect(toOpenAITools(selected)[0]?.function.name).toBe("create_calendar_event");
  });
});
