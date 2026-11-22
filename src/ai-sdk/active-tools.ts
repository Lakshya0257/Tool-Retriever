import type { ToolRetriever } from "../retriever.js";

export interface AiSdkMessageLike {
  role: string;
  content: unknown;
}

export interface AiSdkStepLike {
  toolResults?: readonly { toolName: string; output?: unknown }[];
}

export interface ActiveToolsStepOptions {
  query?: (messages: readonly AiSdkMessageLike[]) => string;
  searchTool?: string;
  maxSearchedTools?: number;
}

export type ActiveToolsStep<NAME extends string> = (options: {
  messages: readonly AiSdkMessageLike[];
  steps?: readonly AiSdkStepLike[];
}) => Promise<{ activeTools: NAME[] } | undefined>;

const isTextPart = (part: unknown): part is { type: "text"; text: string } =>
  typeof part === "object" &&
  part !== null &&
  (part as { type?: unknown }).type === "text" &&
  typeof (part as { text?: unknown }).text === "string";

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as unknown[])
    .filter(isTextPart)
    .map((part) => part.text)
    .join("\n");
}

export function lastUserMessage(messages: readonly AiSdkMessageLike[]): string {
  const message = messages.findLast((candidate) => candidate.role === "user");
  return message ? messageText(message.content).trim() : "";
}

function foundToolNames(output: unknown): string[] {
  const tools =
    typeof output === "object" && output !== null ? (output as { tools?: unknown }).tools : undefined;
  if (!Array.isArray(tools)) return [];
  return (tools as unknown[]).flatMap((tool) => {
    const name = typeof tool === "object" && tool !== null ? (tool as { name?: unknown }).name : undefined;
    return typeof name === "string" ? [name] : [];
  });
}

function searchedToolNames(steps: readonly AiSdkStepLike[], searchTool: string): string[] {
  const names = [...steps]
    .reverse()
    .flatMap((step) => step.toolResults ?? [])
    .filter((result) => result.toolName === searchTool)
    .flatMap((result) => foundToolNames(result.output));
  return [...new Set(names)];
}

export function activeToolsStep<TOOLS extends Readonly<Record<string, unknown>>>(
  retriever: ToolRetriever,
  tools: TOOLS,
  options: ActiveToolsStepOptions = {},
): ActiveToolsStep<keyof TOOLS & string> {
  type Name = keyof TOOLS & string;
  const toQuery = options.query ?? lastUserMessage;
  const { searchTool } = options;
  const maxSearched = options.maxSearchedTools ?? 10;
  const isKnown = (name: string): name is Name => Object.hasOwn(tools, name);
  let cached: { query: string; selected: Name[] } | undefined;

  const selectFor = async (query: string): Promise<Name[]> => {
    if (query.length === 0) return [];
    if (cached?.query !== query) {
      const selected = await retriever.select(query);
      cached = { query, selected: selected.map((tool) => tool.name).filter(isKnown) };
    }
    return cached.selected;
  };

  return async ({ messages, steps = [] }) => {
    const query = toQuery(messages);
    if (searchTool === undefined) {
      return query.length === 0 ? undefined : { activeTools: [...(await selectFor(query))] };
    }
    const selected = await selectFor(query);
    const searched = searchedToolNames(steps, searchTool)
      .filter((name): name is Name => isKnown(name) && name !== searchTool && !selected.includes(name))
      .slice(0, maxSearched);
    return { activeTools: [...selected, ...searched, searchTool].filter(isKnown) };
  };
}
