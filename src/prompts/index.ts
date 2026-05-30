import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {

  server.prompt(
    "analyze-wallet",
    "Deep analysis of a Solana wallet — portfolio breakdown, recent activity, and performance summary",
    { address: z.string().describe("Solana wallet address to analyze") },
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

  server.prompt(
    "find-gem",
    "Scan all Bags.fm tokens and surface hidden gems — low mcap, high organic score, growing momentum",
    { max_mcap_usd: z.string().optional().describe("Max market cap in USD to consider (e.g. '500000' for $500K). Default: 1000000") },
    async ({ max_mcap_usd }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Scan Bags.fm for hidden gem tokens. Use get_trending_tokens with limit 50 to get a broad list.

Filter for tokens that have:
- Market cap under $${max_mcap_usd ?? "1000000"}
- Positive 24h price change
- High organic score (prefer "High" or "Very High" labels)
- Reasonable liquidity (not near zero)

Then for the top 3 candidates, call get_token_info to get full audit and holder data.

Present your findings as:
- Top gem picks with a 1-sentence thesis for each
- Red flags to watch (bot holders %, audit issues)
- Which one you'd watch most closely and why`,
        },
      }],
    })
  );

  server.prompt(
    "audit-token",
    "Full security and rug-pull risk audit for a specific Bags.fm token",
    { symbol: z.string().describe("Token symbol or contract address to audit") },
    async ({ symbol }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Perform a full security audit of the token: ${symbol}

Use get_token_info to fetch all available data, then assess:

SECURITY CHECKS:
- Mint authority disabled? (rug risk if not)
- Freeze authority disabled? (rug risk if not)
- Top holder concentration (flag if top holders > 20%)
- Bot holder percentage (flag if > 10%)

MARKET HEALTH:
- Liquidity depth vs market cap ratio
- Buy/sell ratio in last 24h (heavy selling = bearish)
- Number of unique traders
- Organic score and what it means

VERDICT:
- Overall risk level: Low / Medium / High / Very High
- Key reasons for the rating
- Whether this token looks safe to trade`,
        },
      }],
    })
  );

  server.prompt(
    "swap-advisor",
    "Get a swap quote and recommendation — should you make this trade right now?",
    {
      from_token: z.string().describe("Token you're swapping from (symbol or mint address)"),
      to_token: z.string().describe("Token you're swapping to (symbol or mint address)"),
      amount: z.string().describe("Amount in SOL (e.g. '0.5')"),
    },
    async ({ from_token, to_token, amount }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `I want to swap ${amount} SOL worth of ${from_token} into ${to_token} on Bags.fm. Should I do it?

Steps:
1. Use get_token_info on both ${from_token} and ${to_token}
2. Use prepare_swap to get the actual quote (convert ${amount} SOL to lamports: multiply by 1000000000)

Then advise:
- Current price impact and whether it's acceptable
- Market conditions for both tokens right now
- Any audit red flags on ${to_token}
- Whether the timing looks good based on 24h momentum
- Final recommendation: Good trade / Risky / Avoid — with reasoning`,
        },
      }],
    })
  );

  server.prompt(
    "new-launches",
    "Show the most recently launched tokens on Bags.fm with quick stats",
    { count: z.string().optional().describe("Number of new tokens to show (default: 10)") },
    async ({ count }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Show me the ${count ?? "10"} most recently launched tokens on Bags.fm.

Use get_recently_launched with limit ${count ?? "10"} to fetch them.

For each token show:
- Name, symbol, launch time (how long ago)
- Current price and market cap
- 24h volume and price change if available
- Organic score

Then highlight:
- Which new launch looks most promising and why
- Any that already have suspicious audit flags
- Overall quality of recent launches (are devs building real projects or just pumping?)`,
        },
      }],
    })
  );

  server.prompt(
    "whale-watch",
    "Check if a wallet holds large positions in trending Bags.fm tokens — identify whale behavior",
    { address: z.string().describe("Solana wallet address to investigate") },
    async ({ address }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Investigate this wallet for whale activity: ${address}

Steps:
1. Use get_wallet_portfolio to see all Bags.fm holdings
2. Use get_recent_transactions to see recent on-chain activity
3. Use get_trending_tokens to get the current top 10
4. Cross-reference: does this wallet hold any of the top trending tokens?

Report:
- Total Bags.fm tokens held
- Any overlap with trending tokens (potential early whale)
- Recent transaction patterns (accumulating, distributing, or inactive?)
- Overall assessment: Is this a whale / smart money / regular trader?`,
        },
      }],
    })
  );
}
