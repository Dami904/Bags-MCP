import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {

  server.prompt(
    "analyze-wallet",
    "Deep analysis of a Solana wallet — portfolio breakdown, recent activity, and performance summary",
    {
      address: z.string().describe("Solana wallet address to analyze"),
    },
    async ({ address }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please analyze the Solana wallet at address: ${address}

Use the available Bags MCP tools to:
1. Fetch the full token portfolio (get_wallet_portfolio)
2. Get recent transactions (get_recent_transactions)
3. For the top 3 tokens by amount, fetch their full market info (get_token_info)

Then provide:
- A summary of what this wallet holds
- The approximate USD value of major positions
- Recent activity patterns
- Any notable observations about the portfolio`,
        },
      }],
    })
  );

  server.prompt(
    "compare-tokens",
    "Side-by-side comparison of two tokens on Bags.fm",
    {
      token_a: z.string().describe("First token symbol"),
      token_b: z.string().describe("Second token symbol"),
    },
    async ({ token_a, token_b }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Compare these two tokens on Bags.fm: ${token_a} vs ${token_b}

Use get_token_info for both tokens, then provide:
- Price comparison
- Market cap comparison
- Volume and liquidity comparison
- Active traders comparison
- Which one has more momentum right now and why`,
        },
      }],
    })
  );

  server.prompt(
    "market-overview",
    "Get a full snapshot of what's happening on Bags.fm right now",
    {},
    async () => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Give me a full market overview of Bags.fm right now.

Use get_trending_tokens to get the top 10 tokens, then for the top 3, use get_token_info to get deeper data.

Summarize:
- What sectors or themes are trending
- The biggest movers in the last 24h
- Overall market sentiment based on the data
- Any tokens worth watching`,
        },
      }],
    })
  );
}
