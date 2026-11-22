import type { JsonSchema, Tool } from "../types.js";

export interface OpenAIChatTool {
  type: "function";
  function: { name: string; description: string; parameters: JsonSchema };
}

export interface OpenAIResponsesTool {
  type: "function";
  name: string;
  description: string;
  parameters: JsonSchema;
}

export function toOpenAITools(tools: readonly Tool[]): OpenAIChatTool[] {
  return tools.map(({ name, description, inputSchema }) => ({
    type: "function",
    function: { name, description, parameters: inputSchema },
  }));
}

export function toOpenAIResponsesTools(tools: readonly Tool[]): OpenAIResponsesTool[] {
  return tools.map(({ name, description, inputSchema }) => ({
    type: "function",
    name,
    description,
    parameters: inputSchema,
  }));
}
