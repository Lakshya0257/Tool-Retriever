import type { JsonSchema } from "../types.js";

export type JsonSchemaResolver = (schema: unknown) => JsonSchema | PromiseLike<JsonSchema> | undefined;

interface StandardJsonSchemaSource {
  "~standard": { jsonSchema: { input(options: { target: string }): JsonSchema } };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function hasStandardJsonSchema(value: unknown): value is StandardJsonSchemaSource {
  if (!isObject(value) || !isObject(value["~standard"])) return false;
  const converter = value["~standard"]["jsonSchema"];
  return isObject(converter) && typeof converter["input"] === "function";
}

export const resolveJsonSchema: JsonSchemaResolver = (schema) => {
  const resolved = typeof schema === "function" ? (schema as () => unknown)() : schema;
  if (isObject(resolved) && "jsonSchema" in resolved) return resolved["jsonSchema"] as JsonSchema;
  if (hasStandardJsonSchema(resolved)) return resolved["~standard"].jsonSchema.input({ target: "draft-07" });
  return undefined;
};
