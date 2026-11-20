import { describe, expect, it } from "vitest";
import { normalizeTool, normalizeTools } from "../src/index.js";

describe("normalizeTool", () => {
  it("accepts inputSchema, input_schema, parameters and OpenAI function shapes", () => {
    const schema = { type: "object", properties: { q: { type: "string" } } };
    expect(normalizeTool({ name: "a", inputSchema: schema }).inputSchema).toBe(schema);
    expect(normalizeTool({ name: "b", input_schema: schema }).inputSchema).toBe(schema);
    expect(normalizeTool({ name: "c", parameters: schema }).inputSchema).toBe(schema);
    expect(normalizeTool({ type: "function", function: { name: "d", parameters: schema } })).toEqual({
      name: "d",
      description: "",
      inputSchema: schema,
    });
  });

  it("fills in an empty description and object schema", () => {
    expect(normalizeTool({ name: "noop" })).toEqual({
      name: "noop",
      description: "",
      inputSchema: { type: "object", properties: {} },
    });
    expect(normalizeTool({ type: "function", function: { name: "f" } }).inputSchema).toEqual({
      type: "object",
      properties: {},
    });
  });

  it("keeps annotations", () => {
    expect(normalizeTool({ name: "rm", annotations: { destructiveHint: true } }).annotations).toEqual({
      destructiveHint: true,
    });
  });

  it("rejects tools without a name", () => {
    expect(() => normalizeTool({ name: "" })).toThrow(TypeError);
    expect(() => normalizeTool({} as never)).toThrow(TypeError);
  });
});

describe("normalizeTools", () => {
  it("rejects duplicate names", () => {
    expect(() => normalizeTools([{ name: "a" }, { name: "a" }])).toThrow("Duplicate tool name: a");
  });
});
