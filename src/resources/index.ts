import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTopTokens, findToken } from "../api/bags.js";

export function registerResources(server: McpServer) {

  server.resource(
    "bags-trending",
    "bags://trending",
    {
      description: "Live feed of the top 20 tokens on Bags.fm by lifetime fees",
      mimeType: "application/json",
    },
    async (uri) => {
      const tokens = await getTopTokens(20);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(tokens, null, 2),
        }],
      };
    }
  );

  server.resource(
    "bags-token",
    new ResourceTemplate("bags://token/{symbol}", { list: undefined }),
    {
      description: "Full market data for a specific token on Bags.fm",
      mimeType: "application/json",
    },
    async (uri, { symbol }) => {
      const token = await findToken(symbol as string);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(token, null, 2),
        }],
      };
    }
  );
}
