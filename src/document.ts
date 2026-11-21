import type { JsonSchema, Tool } from "./types.js";

export interface ToolFields {
  name: string;
  description: string;
  parameters: string;
}

function collectSchemaText(schema: JsonSchema | undefined, out: string[]): void {
  if (!schema || typeof schema !== "object") return;
  if (schema.description) out.push(schema.description);
  if (schema.enum) out.push(...schema.enum.filter((value): value is string => typeof value === "string"));
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    out.push(key);
    collectSchemaText(child, out);
  }
  for (const item of [schema.items ?? []].flat()) collectSchemaText(item, out);
}

export function toolFields(tool: Tool): ToolFields {
  const parameters: string[] = [];
  collectSchemaText(tool.inputSchema, parameters);
  return { name: tool.name, description: tool.description, parameters: parameters.join(" ") };
}

export function toolText(tool: Tool): string {
  const { name, description, parameters } = toolFields(tool);
  return [name, description, parameters].filter(Boolean).join("\n");
}
