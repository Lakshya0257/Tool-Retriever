import type { ToolRetriever } from "../retriever.js";

export interface SearchToolsInput {
  query: string;
}

export interface SearchToolsOutput {
  tools: { name: string; description: string }[];
}

type ValidationResult = { value: SearchToolsInput; issues?: undefined } | { issues: { message: string }[] };

export interface SearchToolsSchema {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: { readonly input: SearchToolsInput; readonly output: SearchToolsInput } | undefined;
    readonly validate: (value: unknown) => ValidationResult;
    readonly jsonSchema: {
      readonly input: (options: { target: string }) => Record<string, unknown>;
      readonly output: (options: { target: string }) => Record<string, unknown>;
    };
  };
}

export interface SearchToolsTool {
  description: string;
  inputSchema: SearchToolsSchema;
  execute: (input: SearchToolsInput) => Promise<SearchToolsOutput>;
}

export interface SearchToolsToolOptions {
  topK?: number;
  description?: string;
}

const DEFAULT_DESCRIPTION =
  "Find more tools when none of your current tools fit the task. Describe what you need to do in a few words. Matching tools become available on your next step.";

const inputJsonSchema = () => ({
  type: "object",
  properties: {
    query: { type: "string", description: "What you need a tool for, for example 'send an email'" },
  },
  required: ["query"],
  additionalProperties: false,
});

function validate(value: unknown): ValidationResult {
  const query =
    typeof value === "object" && value !== null ? (value as { query?: unknown }).query : undefined;
  if (typeof query === "string" && query.trim().length > 0) return { value: { query } };
  return { issues: [{ message: "query must be a non-empty string" }] };
}

const inputSchema: SearchToolsSchema = {
  "~standard": {
    version: 1,
    vendor: "tool-retriever",
    validate,
    jsonSchema: { input: inputJsonSchema, output: inputJsonSchema },
  },
};

export function searchToolsTool(
  retriever: ToolRetriever,
  options: SearchToolsToolOptions = {},
): SearchToolsTool {
  const topK = options.topK ?? 5;
  return {
    description: options.description ?? DEFAULT_DESCRIPTION,
    inputSchema,
    execute: async ({ query }) => {
      const found = await retriever.select(query, { topK, includePinned: false });
      return { tools: found.map(({ name, description }) => ({ name, description })) };
    },
  };
}
