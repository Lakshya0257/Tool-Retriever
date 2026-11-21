import type { JsonSchema, PlainToolDefinition, ToolDefinition, ToolRegistry } from "../types.js";

export interface McpToolLike {
  name: string;
  description?: string | undefined;
  inputSchema: object;
  annotations?: object | undefined;
}

export interface McpListToolsResult {
  tools: McpToolLike[];
  nextCursor?: string | undefined;
}

export interface McpClientLike {
  listTools(params?: { cursor?: string }): Promise<McpListToolsResult>;
}

export interface McpRegistryOptions {
  prefix?: string;
  filter?: (tool: McpToolLike) => boolean;
}

function toDefinition(tool: McpToolLike, prefix: string): ToolDefinition {
  const definition: PlainToolDefinition = {
    name: `${prefix}${tool.name}`,
    inputSchema: tool.inputSchema as JsonSchema,
  };
  if (tool.description !== undefined) definition.description = tool.description;
  if (tool.annotations !== undefined) definition.annotations = tool.annotations as Record<string, unknown>;
  return definition;
}

export function mcpRegistry(client: McpClientLike, options: McpRegistryOptions = {}): ToolRegistry {
  const prefix = options.prefix ?? "";
  const filter = options.filter ?? (() => true);

  return {
    async list() {
      const definitions: ToolDefinition[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor === undefined ? undefined : { cursor });
        for (const tool of page.tools) if (filter(tool)) definitions.push(toDefinition(tool, prefix));
        if (cursor !== undefined) seen.add(cursor);
        cursor = page.nextCursor;
      } while (cursor !== undefined && !seen.has(cursor));
      return definitions;
    },
  };
}
