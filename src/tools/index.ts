import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTopTokens, findToken, getSwapQuote } from "../api/bags.js";
import { getWalletTokens, getRecentTransactions } from "../api/solana.js";
import { buildErrorResult, formatToolError } from "../utils/errors.js";
import { recordToolCall } from "../metrics.js";

export function registerTools(server: McpServer) {

  server.tool(
    "get_token_price",
    "Get the current price of a token on Bags.fm by symbol or contract address.",
    {
      symbol: z.string().describe("Token symbol (e.g. 'PEPE') or contract address"),
    },
    async ({ symbol }) => {
      await recordToolCall("get_token_price");
      try {
        const token = await findToken(symbol);
        if (!token) {
          return buildErrorResult(`Token '${symbol}' not found in Bags.fm top tokens.`);
        }
        const p = token.tokenLatestPrice;
        const i = token.tokenInfo;
        const text = [
          `${i.name} (${i.symbol})`,
          `Price USD:  $${i.usdPrice.toFixed(8)}`,
          `Price SOL:  ${p ? p.priceSOL.toFixed(8) : "N/A"} SOL`,
          `24h Change: ${i.stats24h ? (i.stats24h.priceChange > 0 ? "+" : "") + i.stats24h.priceChange.toFixed(2) + "%" : "N/A"}`,
          `Volume 24h: $${i.stats24h ? (i.stats24h.buyVolume + i.stats24h.sellVolume).toLocaleString() : "N/A"}`,
          `Updated:    ${i.updatedAt}`,
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return buildErrorResult(formatToolError(err));
      }
    }
  );

  server.tool(
    "get_token_info",
    "Get comprehensive market data for a token on Bags.fm — market cap, volume, holders, liquidity, audit info, and stats.",
    {
      symbol: z.string().describe("Token symbol or contract address"),
    },
    async ({ symbol }) => {
      await recordToolCall("get_token_info");
      try {
        const token = await findToken(symbol);
        if (!token) {
          return buildErrorResult(`Token '${symbol}' not found in Bags.fm top tokens.`);
        }
        const i = token.tokenInfo;
        const a = i.audit;
        const lines = [
          `${i.name} (${i.symbol})`,
          `Address:       ${token.token}`,
          `Price:         $${i.usdPrice.toFixed(8)}`,
          `Market Cap:    $${i.mcap.toLocaleString()}`,
          `FDV:           $${i.fdv.toLocaleString()}`,
          `Liquidity:     $${i.liquidity.toLocaleString()}`,
          `Holders:       ${i.holderCount.toLocaleString()}`,
          `Launchpad:     ${i.launchpad}`,
          `Fees (total):  $${i.fees.toLocaleString()}`,
          `Organic Score: ${i.organicScore} (${i.organicScoreLabel})`,
          i.stats24h ? [
            `--- 24h Stats ---`,
            `Price Change:  ${i.stats24h.priceChange > 0 ? "+" : ""}${i.stats24h.priceChange.toFixed(2)}%`,
            `Buy Volume:    $${i.stats24h.buyVolume.toLocaleString()}`,
            `Sell Volume:   $${i.stats24h.sellVolume.toLocaleString()}`,
            `Traders:       ${i.stats24h.numTraders}`,
            `Buys / Sells:  ${i.stats24h.numBuys} / ${i.stats24h.numSells}`,
          ].join("\n") : "",
          a ? [
            `--- Audit ---`,
            `Mint Auth Disabled:   ${a.mintAuthorityDisabled}`,
            `Freeze Auth Disabled: ${a.freezeAuthorityDisabled}`,
            `Top Holders %:        ${a.topHoldersPercentage.toFixed(2)}%`,
            `Bot Holders:          ${a.botHoldersCount} (${a.botHoldersPercentage.toFixed(2)}%)`,
          ].join("\n") : "",
        ].filter(Boolean).join("\n");
        return { content: [{ type: "text", text: lines }] };
      } catch (err) {
        return buildErrorResult(formatToolError(err));
      }
    }
  );

  server.tool(
    "get_trending_tokens",
    "Get the top tokens on Bags.fm ranked by lifetime fees generated (most traded). Returns price, market cap, 24h stats.",
    {
      limit: z.number().min(1).max(50).default(10).describe("Number of tokens to return (max 50)"),
    },
    async ({ limit }) => {
      await recordToolCall("get_trending_tokens");
      try {
        const tokens = await getTopTokens(limit);
        const lines = tokens.map((t, idx) => {
          const i = t.tokenInfo;
          const change = i.stats24h?.priceChange;
          const vol = i.stats24h ? (i.stats24h.buyVolume + i.stats24h.sellVolume) : 0;
          return `${idx + 1}. ${i.symbol} — $${i.usdPrice.toFixed(8)} | MCap: $${i.mcap.toLocaleString()} | 24h: ${change !== undefined ? (change > 0 ? "+" : "") + change.toFixed(2) + "%" : "N/A"} | Vol: $${vol.toLocaleString()}`;
        });
        const text = ["Top Tokens on Bags.fm (by lifetime fees)", ...lines].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return buildErrorResult(formatToolError(err));
      }
    }
  );

  server.tool(
    "get_wallet_portfolio",
    "Get the full token portfolio of a Solana wallet address.",
    {
      address: z.string().describe("Solana wallet address (public key)"),
    },
    async ({ address }) => {
      await recordToolCall("get_wallet_portfolio");
      try {
        const tokens = await getWalletTokens(address);
        if (tokens.length === 0) {
          return { content: [{ type: "text", text: `No tokens found for wallet ${address}` }] };
        }
        const lines = tokens.slice(0, 20).map((t, i) =>
          `${i + 1}. ${t.mint.slice(0, 8)}... — ${t.amount} tokens`
        );
        const text = [`Wallet: ${address}`, `Tokens (top 20):`, ...lines].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return buildErrorResult(formatToolError(err));
      }
    }
  );

  server.tool(
    "get_recent_transactions",
    "Get the most recent transactions for a Solana wallet address.",
    {
      address: z.string().describe("Solana wallet address"),
      limit: z.number().min(1).max(50).default(10).describe("Number of transactions to return"),
    },
    async ({ address, limit }) => {
      await recordToolCall("get_recent_transactions");
      try {
        const txs = await getRecentTransactions(address, limit);
        if (txs.length === 0) {
          return { content: [{ type: "text", text: "No recent transactions found." }] };
        }
        const lines = txs.map((tx, i) => {
          const date = new Date(tx.timestamp * 1000).toISOString();
          return `${i + 1}. [${tx.status.toUpperCase()}] ${date} — ${tx.signature.slice(0, 20)}...`;
        });
        const text = [`Recent Transactions for ${address.slice(0, 8)}...`, ...lines].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return buildErrorResult(formatToolError(err));
      }
    }
  );

  server.tool(
    "prepare_swap",
    "Get a swap quote on Bags.fm. Returns estimated output amount and price impact. Does NOT execute the swap.",
    {
      from_mint: z.string().describe("Input token mint address (use So11111111111111111111111111111111111111112 for SOL)"),
      to_mint: z.string().describe("Output token mint address"),
      amount_lamports: z.number().positive().describe("Amount in lamports/smallest unit (e.g. 1000000000 = 1 SOL)"),
    },
    async ({ from_mint, to_mint, amount_lamports }) => {
      await recordToolCall("prepare_swap");
      try {
        const quote = await getSwapQuote(from_mint, to_mint, amount_lamports);
        if (!quote) {
          return buildErrorResult("Could not get quote — this token pair may not have a Bags.fm liquidity pool.");
        }
        const text = [
          `Swap Quote (Bags.fm)`,
          `In:           ${amount_lamports.toLocaleString()} (${from_mint.slice(0, 8)}...)`,
          `Out:          ~${quote.outAmount.toLocaleString()} (${to_mint.slice(0, 8)}...)`,
          `Price Impact: ${quote.priceImpact.toFixed(4)}%`,
          `Fee:          ${quote.fee}`,
          ``,
          `To execute: sign the swap transaction in your Solana wallet.`,
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return buildErrorResult(formatToolError(err));
      }
    }
  );
}
