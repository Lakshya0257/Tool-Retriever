import type { PlainToolDefinition, ToolRegistry } from "../types.js";
import { resolveJsonSchema, type JsonSchemaResolver } from "./schema.js";

export interface AiSdkToolLike {
  description?: unknown;
  inputSchema?: unknown;
}

export interface AiSdkRegistryOptions {
  toJsonSchema?: JsonSchemaResolver;
}

export function aiSdkRegistry(
  tools: Readonly<Record<string, AiSdkToolLike>>,
  options: AiSdkRegistryOptions = {},
): ToolRegistry {
  const toJsonSchema = options.toJsonSchema ?? resolveJsonSchema;

  return {
    list: () =>
      Promise.all(
        Object.entries(tools).map(async ([name, tool]): Promise<PlainToolDefinition> => {
          const definition: PlainToolDefinition = { name };
          if (typeof tool.description === "string") definition.description = tool.description;
          const inputSchema = await toJsonSchema(tool.inputSchema);
          if (inputSchema !== undefined) definition.inputSchema = inputSchema;
          return definition;
        }),
      ),
  };
}
