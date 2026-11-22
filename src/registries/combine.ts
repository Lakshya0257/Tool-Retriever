import type { ToolRegistry } from "../types.js";

export function combineRegistries(...registries: ToolRegistry[]): ToolRegistry {
  return {
    async list() {
      const lists = await Promise.all(registries.map(async (registry) => registry.list()));
      return lists.flat();
    },
  };
}
