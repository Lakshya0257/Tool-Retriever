import type { ToolDefinition, ToolRegistry } from "../types.js";

export function arrayRegistry(definitions: readonly ToolDefinition[]): ToolRegistry {
  return { list: () => definitions };
}

export function toRegistry(source: ToolRegistry | readonly ToolDefinition[]): ToolRegistry {
  return Array.isArray(source) ? arrayRegistry(source) : (source as ToolRegistry);
}
