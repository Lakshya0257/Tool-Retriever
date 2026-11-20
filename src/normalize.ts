import type { JsonSchema, PlainToolDefinition, Tool, ToolDefinition } from "./types.js";

const emptySchema = (): JsonSchema => ({ type: "object", properties: {} });

function fromDefinition(definition: ToolDefinition): Tool {
  if ("function" in definition) {
    const { name, description, parameters } = definition.function;
    return { name, description: description ?? "", inputSchema: parameters ?? emptySchema() };
  }
  const plain: PlainToolDefinition = definition;
  const tool: Tool = {
    name: plain.name,
    description: plain.description ?? "",
    inputSchema: plain.inputSchema ?? plain.input_schema ?? plain.parameters ?? emptySchema(),
  };
  if (plain.annotations) tool.annotations = plain.annotations;
  return tool;
}

export function normalizeTool(definition: ToolDefinition): Tool {
  const tool = fromDefinition(definition);
  if (typeof tool.name !== "string" || tool.name.length === 0) {
    throw new TypeError("Tool definition is missing a name");
  }
  return tool;
}

export function normalizeTools(definitions: readonly ToolDefinition[]): Tool[] {
  const seen = new Set<string>();
  return definitions.map((definition) => {
    const tool = normalizeTool(definition);
    if (seen.has(tool.name)) throw new Error(`Duplicate tool name: ${tool.name}`);
    seen.add(tool.name);
    return tool;
  });
}
