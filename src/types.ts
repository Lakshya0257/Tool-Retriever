export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  required?: string[];
  enum?: unknown[];
  [key: string]: unknown;
}

export interface FunctionToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: JsonSchema;
  };
}

export interface PlainToolDefinition {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  input_schema?: JsonSchema;
  parameters?: JsonSchema;
  annotations?: Record<string, unknown>;
}

export type ToolDefinition = PlainToolDefinition | FunctionToolDefinition;

export interface Tool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: Record<string, unknown>;
}

export interface ToolRegistry {
  list(): Promise<readonly ToolDefinition[]> | readonly ToolDefinition[];
}

export interface ScoredTool {
  tool: Tool;
  score: number;
}
