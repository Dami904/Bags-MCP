import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

export async function createServer() {
  const server = new McpServer({
    name: "bags-mcp-server",
    version: "1.0.0",
    description: "MCP server for Bags.fm — query tokens, wallets, and market data on Solana via Claude",
  });

  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  return server;
}

export async function startStdioServer() {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BagsMCP server running on stdio");
}
