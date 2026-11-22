import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  combineRegistries,
  mcpRegistry,
  normalizeTools,
  ToolRetriever,
  type McpClientLike,
  type McpListToolsResult,
} from "../src/index.js";

function mockClient(pages: McpListToolsResult[]) {
  const listTools = vi.fn(async (params?: { cursor?: string }) => {
    const index = params?.cursor ? Number(params.cursor) : 0;
    const page = pages[index];
    if (!page) throw new Error(`no page ${index}`);
    return page;
  });
  return { listTools } satisfies McpClientLike;
}

const githubPages: McpListToolsResult[] = [
  {
    tools: [
      {
        name: "create_issue",
        description: "Open a new issue in a GitHub repository",
        inputSchema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } } },
      },
      {
        name: "merge_pull_request",
        description: "Merge a pull request",
        inputSchema: { type: "object", properties: { number: { type: "number" } } },
        annotations: { destructiveHint: true },
      },
    ],
    nextCursor: "1",
  },
  {
    tools: [
      { name: "list_commits", inputSchema: { type: "object", properties: { branch: { type: "string" } } } },
    ],
  },
];

describe("mcpRegistry", () => {
  it("accepts the official MCP SDK client structurally", () => {
    expectTypeOf<Client>().toExtend<McpClientLike>();
  });

  it("follows pagination cursors and maps tools", async () => {
    const client = mockClient(githubPages);
    const tools = await mcpRegistry(client).list();
    expect(client.listTools).toHaveBeenNthCalledWith(1, undefined);
    expect(client.listTools).toHaveBeenNthCalledWith(2, { cursor: "1" });
    expect(tools).toEqual([
      {
        name: "create_issue",
        description: "Open a new issue in a GitHub repository",
        inputSchema: githubPages[0]?.tools[0]?.inputSchema,
      },
      {
        name: "merge_pull_request",
        description: "Merge a pull request",
        inputSchema: { type: "object", properties: { number: { type: "number" } } },
        annotations: { destructiveHint: true },
      },
      { name: "list_commits", inputSchema: { type: "object", properties: { branch: { type: "string" } } } },
    ]);
  });

  it("stops when a server repeats a cursor", async () => {
    const client = mockClient([
      { tools: [], nextCursor: "1" },
      { tools: [], nextCursor: "1" },
    ]);
    expect(await mcpRegistry(client).list()).toEqual([]);
    expect(client.listTools).toHaveBeenCalledTimes(2);
  });

  it("applies prefix and filter", async () => {
    const registry = mcpRegistry(mockClient(githubPages), {
      prefix: "github__",
      filter: (tool) => tool.name !== "list_commits",
    });
    expect(normalizeTools(await registry.list()).map((tool) => tool.name)).toEqual([
      "github__create_issue",
      "github__merge_pull_request",
    ]);
  });

  it("lists lazily, only when the index is built", async () => {
    const client = mockClient(githubPages);
    const retriever = new ToolRetriever({ registry: mcpRegistry(client), topK: 1 });
    expect(client.listTools).not.toHaveBeenCalled();
    expect((await retriever.select("open an issue")).map((tool) => tool.name)).toEqual(["create_issue"]);
    await retriever.select("merge the pull request");
    expect(client.listTools).toHaveBeenCalledTimes(2);
  });

  it("propagates client errors", async () => {
    const client: McpClientLike = { listTools: () => Promise.reject(new Error("disconnected")) };
    await expect(mcpRegistry(client).list()).rejects.toThrow("disconnected");
  });
});

describe("combineRegistries", () => {
  it("merges several servers into one registry", async () => {
    const github = mcpRegistry(mockClient(githubPages), { prefix: "gh_" });
    const local = { list: () => [{ name: "read_file", description: "Read a local file" }] };
    const retriever = new ToolRetriever({ registry: combineRegistries(github, local), topK: 1 });
    expect((await retriever.tools()).map((tool) => tool.name)).toEqual([
      "gh_create_issue",
      "gh_merge_pull_request",
      "gh_list_commits",
      "read_file",
    ]);
    expect((await retriever.select("read the file")).map((tool) => tool.name)).toEqual(["read_file"]);
  });

  it("rejects name clashes across registries", async () => {
    const a = { list: () => [{ name: "search" }] };
    const retriever = new ToolRetriever({ registry: combineRegistries(a, a) });
    await expect(retriever.tools()).rejects.toThrow("Duplicate tool name: search");
  });
});
