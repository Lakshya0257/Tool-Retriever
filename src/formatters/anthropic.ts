import type { JsonSchema, Tool } from "../types.js";

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

export function toAnthropicTools(tools: readonly Tool[]): AnthropicTool[] {
  return tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    input_schema: inputSchema,
  }));
}
