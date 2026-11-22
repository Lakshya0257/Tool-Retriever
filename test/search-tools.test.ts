import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { activeToolsStep, aiSdkRegistry, searchToolsTool, ToolRetriever } from "../src/index.js";

const appTools = {
  getWeather: tool({
    description: "Current weather and forecast for a city",
    inputSchema: z.object({ city: z.string() }),
    execute: async () => "rain",
  }),
  sendEmail: tool({
    description: "Send an email to a recipient",
    inputSchema: z.object({ to: z.string() }),
    execute: async () => "sent",
  }),
  createEvent: tool({
    description: "Schedule a calendar meeting",
    inputSchema: z.object({ title: z.string() }),
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

const toolCall = (toolName: string, input: object, id: string) => ({
  content: [{ type: "tool-call" as const, toolCallId: id, toolName, input: JSON.stringify(input) }],
  finishReason: { unified: "tool-calls" as const, raw: undefined },
  usage,
  warnings: [],
});

const retriever = () =>
  new ToolRetriever({ registry: aiSdkRegistry(appTools), topK: 1, alwaysInclude: ["askHuman"] });

const activeNames = (model: MockLanguageModelV4) =>
  model.doGenerateCalls.map((call) => call.tools?.map((t) => t.name).sort());

describe("searchToolsTool", () => {
  it("lets the model activate tools mid-turn", async () => {
    const instance = retriever();
    const tools = { ...appTools, search_tools: searchToolsTool(instance) };
    const model = new MockLanguageModelV4({
      doGenerate: [
        toolCall("search_tools", { query: "schedule a meeting" }, "1"),
        toolCall("createEvent", { title: "Paris trip" }, "2"),
        {
          content: [{ type: "text", text: "Booked." }],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        },
      ],
    });

    const result = await generateText({
      model,
      tools,
      prompt: "plan my Paris trip",
      stopWhen: stepCountIs(5),
      prepareStep: activeToolsStep(instance, tools, { searchTool: "search_tools" }),
    });

    expect(result.text).toBe("Booked.");
    expect(activeNames(model)).toEqual([
      ["askHuman", "search_tools"],
      ["askHuman", "createEvent", "search_tools"],
      ["askHuman", "createEvent", "search_tools"],
    ]);
    expect(result.steps[0]?.toolResults[0]?.output).toEqual({
      tools: [{ name: "createEvent", description: "Schedule a calendar meeting" }],
    });
  });

  it("excludes pinned tools from search results and respects topK", async () => {
    const search = searchToolsTool(retriever(), { topK: 1 });
    expect(await search.execute({ query: "ask the operator to send an email" })).toEqual({
      tools: [{ name: "sendEmail", description: "Send an email to a recipient" }],
    });
  });

  it("validates its input and exposes a JSON schema", () => {
    const schema = searchToolsTool(retriever()).inputSchema["~standard"];
    expect(schema.validate({ query: "email" })).toEqual({ value: { query: "email" } });
    expect(schema.validate({ query: "  " })).toHaveProperty("issues");
    expect(schema.validate(null)).toHaveProperty("issues");
    expect(schema.jsonSchema.input({ target: "draft-07" })).toMatchObject({ required: ["query"] });
  });

  it("accepts a custom description", () => {
    expect(searchToolsTool(retriever(), { description: "find tools" }).description).toBe("find tools");
  });
});

describe("activeToolsStep with a search tool", () => {
  const messages: ModelMessage[] = [{ role: "user", content: "what's the weather" }];
  const searchResult = (...names: string[]) => ({
    toolResults: [{ toolName: "search_tools", output: { tools: names.map((name) => ({ name })) } }],
  });

  it("keeps searched tools active for the rest of the turn, newest first, up to the cap", async () => {
    const tools = { ...appTools, search_tools: {} };
    const step = activeToolsStep(retriever(), tools, { searchTool: "search_tools", maxSearchedTools: 1 });
    const steps = [
      searchResult("sendEmail"),
      searchResult("createEvent", "sendEmail"),
      searchResult("askHuman"),
    ];
    expect(await step({ messages, steps })).toEqual({
      activeTools: ["getWeather", "askHuman", "createEvent", "search_tools"],
    });
  });

  it("ignores unknown names, other tools and malformed outputs", async () => {
    const tools = { ...appTools, search_tools: {} };
    const step = activeToolsStep(retriever(), tools, { searchTool: "search_tools" });
    const steps = [
      searchResult("doesNotExist"),
      { toolResults: [{ toolName: "getWeather", output: { tools: [{ name: "sendEmail" }] } }] },
      { toolResults: [{ toolName: "search_tools", output: "oops" }] },
      { toolResults: [{ toolName: "search_tools", output: { tools: [42, { name: 7 }] } }] },
      {},
    ];
    expect(await step({ messages, steps })).toEqual({
      activeTools: ["getWeather", "askHuman", "search_tools"],
    });
  });

  it("keeps only the search tool active when there is no user text", async () => {
    const tools = { ...appTools, search_tools: {} };
    const select = vi.fn();
    const instance = retriever();
    instance.select = select;
    const step = activeToolsStep(instance, tools, { searchTool: "search_tools" });
    expect(await step({ messages: [] })).toEqual({ activeTools: ["search_tools"] });
    expect(select).not.toHaveBeenCalled();
  });
});
