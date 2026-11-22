import type { ToolRetriever } from "../retriever.js";

export interface AiSdkMessageLike {
  role: string;
  content: unknown;
}

export interface ActiveToolsStepOptions {
  query?: (messages: readonly AiSdkMessageLike[]) => string;
}

export type ActiveToolsStep<NAME extends string> = (options: {
  messages: readonly AiSdkMessageLike[];
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

export function activeToolsStep<TOOLS extends Readonly<Record<string, unknown>>>(
  retriever: ToolRetriever,
  tools: TOOLS,
  options: ActiveToolsStepOptions = {},
): ActiveToolsStep<keyof TOOLS & string> {
  const toQuery = options.query ?? lastUserMessage;
  const isKnown = (name: string): name is keyof TOOLS & string => Object.hasOwn(tools, name);
  let cached: { query: string; activeTools: (keyof TOOLS & string)[] } | undefined;

  return async ({ messages }) => {
    const query = toQuery(messages);
    if (query.length === 0) return undefined;
    if (cached?.query !== query) {
      const selected = await retriever.select(query);
      cached = { query, activeTools: selected.map((tool) => tool.name).filter(isKnown) };
    }
    return { activeTools: [...cached.activeTools] };
  };
}
