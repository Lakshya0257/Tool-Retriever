import { generateText, jsonSchema, stepCountIs, tool, type ModelMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  activeToolsStep,
  aiSdkRegistry,
  lastUserMessage,
  normalizeTools,
  resolveJsonSchema,
  ToolRetriever,
} from "../src/index.js";

const tools = {
  getWeather: tool({
    description: "Current weather and forecast for a city",
    inputSchema: z.object({ city: z.string().describe("City name") }),
    execute: async ({ city }) => ({ city, forecast: "rain" }),
  }),
  sendEmail: tool({
    description: "Send an email to a recipient",
    inputSchema: jsonSchema<{ to: string }>({
      type: "object",
      properties: { to: { type: "string", description: "Recipient address" } },
    }),
    execute: async () => "sent",
  }),
  createEvent: tool({
    description: "Schedule a calendar meeting",
    inputSchema: z.object({ title: z.string(), attendees: z.array(z.string()) }),
    execute: async () => "scheduled",
  }),
  askHuman: tool({
    description: "Ask the operator a question",
    inputSchema: z.object({ question: z.string() }),
    execute: async () => "ok",
  }),
};

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

describe("aiSdkRegistry", () => {
  it("reads names, descriptions and JSON schemas from zod and jsonSchema tools", async () => {
    const [weather, email] = normalizeTools(await aiSdkRegistry(tools).list());
    expect(weather).toMatchObject({
      name: "getWeather",
      description: "Current weather and forecast for a city",
      inputSchema: { type: "object", properties: { city: { type: "string", description: "City name" } } },
    });
    expect(email?.inputSchema).toMatchObject({ properties: { to: { description: "Recipient address" } } });
  });

  it("falls back to an empty schema when a schema cannot be converted", async () => {
    const [plain] = normalizeTools(await aiSdkRegistry({ legacy: { inputSchema: { _def: {} } } }).list());
    expect(plain).toEqual({
      name: "legacy",
      description: "",
      inputSchema: { type: "object", properties: {} },
    });
  });

  it("accepts a custom schema resolver", async () => {
    const toJsonSchema = vi.fn(() => ({ type: "object", properties: { custom: { type: "string" } } }));
    const [custom] = normalizeTools(
      await aiSdkRegistry({ x: { inputSchema: "anything" } }, { toJsonSchema }).list(),
    );
    expect(toJsonSchema).toHaveBeenCalledWith("anything");
    expect(custom?.inputSchema.properties).toHaveProperty("custom");
  });
});

describe("resolveJsonSchema", () => {
  it("handles lazy, promised and missing schemas", async () => {
    const schema = { type: "object", properties: {} };
    expect(resolveJsonSchema(() => ({ jsonSchema: schema }))).toBe(schema);
    expect(await resolveJsonSchema({ jsonSchema: Promise.resolve(schema) })).toBe(schema);
    expect(resolveJsonSchema(undefined)).toBeUndefined();
    expect(resolveJsonSchema({ "~standard": { jsonSchema: {} } })).toBeUndefined();
  });
});

describe("lastUserMessage", () => {
  it("extracts text from the latest user message", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "first question" },
      { role: "assistant", content: "answer" },
      {
        role: "user",
        content: [
          { type: "text", text: "what's the" },
          { type: "image", image: new URL("https://example.com/a.png") },
          { type: "text", text: "forecast?" },
        ],
      },
      { role: "tool", content: [] },
    ];
    expect(lastUserMessage(messages)).toBe("what's the\nforecast?");
  });

  it("returns an empty string when there is no user text", () => {
    expect(lastUserMessage([])).toBe("");
    expect(lastUserMessage([{ role: "user", content: { unexpected: true } }])).toBe("");
  });
});

describe("activeToolsStep", () => {
  const retriever = () =>
    new ToolRetriever({ registry: aiSdkRegistry(tools), topK: 1, alwaysInclude: ["askHuman"] });

  it("limits each generateText step to the retrieved tools", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            { type: "tool-call", toolCallId: "1", toolName: "getWeather", input: '{"city":"Paris"}' },
          ],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        },
        {
          content: [{ type: "text", text: "Bring an umbrella." }],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        },
      ],
    });

    const result = await generateText({
      model,
      tools,
      prompt: "What's the weather forecast in Paris?",
      stopWhen: stepCountIs(3),
      prepareStep: activeToolsStep(retriever(), tools),
    });

    expect(result.text).toBe("Bring an umbrella.");
    expect(model.doGenerateCalls.map((call) => call.tools?.map((t) => t.name))).toEqual([
      ["getWeather", "askHuman"],
      ["getWeather", "askHuman"],
    ]);
  });

  it("reuses the selection while the query is unchanged", async () => {
    const instance = retriever();
    const select = vi.spyOn(instance, "select");
    const step = activeToolsStep(instance, tools);
    const messages: ModelMessage[] = [{ role: "user", content: "send an email" }];
    expect(await step({ messages })).toEqual({ activeTools: ["sendEmail", "askHuman"] });
    expect(await step({ messages: [...messages, { role: "assistant", content: "done" }] })).toEqual({
      activeTools: ["sendEmail", "askHuman"],
    });
    expect(select).toHaveBeenCalledTimes(1);
    await step({ messages: [{ role: "user", content: "schedule a meeting" }] });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("leaves tools untouched when there is no query", async () => {
    expect(await activeToolsStep(retriever(), tools)({ messages: [] })).toBeUndefined();
  });

  it("supports a custom query and drops names missing from the tool set", async () => {
    const step = activeToolsStep(retriever(), { askHuman: tools.askHuman }, { query: () => "weather" });
    expect(await step({ messages: [] })).toEqual({ activeTools: ["askHuman"] });
  });
});
