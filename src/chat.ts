import Anthropic from "@anthropic-ai/sdk";
import { getTopTokens, findToken, getSwapQuote } from "./api/bags.js";
import { getWalletTokens, getRecentTransactions } from "./api/solana.js";
import { recordToolCall } from "./metrics.js";


const SYSTEM = `You are BagsMCP, an AI assistant with live access to Bags.fm — a Solana token launch and trading platform.
You have tools to fetch real-time token prices, market data, wallet portfolios, and swap quotes.

Guidelines:
- Be concise and direct. Lead with the most important number or insight.
- Format numbers clearly: use $ for USD, abbreviate large numbers (1.2M, 450K), show % changes with + or - sign.
- When showing multiple tokens, use a markdown table with columns: Token, Price, MCap, 24h, Volume.
- Highlight standout data (biggest mover, most volume, suspicious audit flags).
- For wallet analysis: mention total tokens found, flag any with significant value.
- Always mention data is live from Bags.fm.
- Keep responses under 300 words unless the user asks for detail.`;

const TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: "get_trending_tokens",
    description: "Get the top trending tokens on Bags.fm ranked by lifetime fees generated.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of tokens to return (max 50, default 10)" },
      },
    },
  },
  {
    name: "get_token_info",
    description: "Get full market data for a token: price, market cap, volume, holders, liquidity, 24h stats, and audit info.",
    input_schema: {
      type: "object" as const,
      properties: {
        symbol: { type: "string", description: "Token symbol (e.g. 'PEPE') or contract address" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_token_price",
    description: "Get the current price of a token with 24h change and volume.",
    input_schema: {
      type: "object" as const,
      properties: {
        symbol: { type: "string", description: "Token symbol or contract address" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_wallet_portfolio",
    description: "Get all tokens held by a Solana wallet address.",
    input_schema: {
      type: "object" as const,
      properties: {
        address: { type: "string", description: "Solana wallet public key" },
      },
      required: ["address"],
    },
  },
  {
    name: "get_recent_transactions",
    description: "Get the most recent on-chain transactions for a Solana wallet.",
    input_schema: {
      type: "object" as const,
      properties: {
        address: { type: "string", description: "Solana wallet public key" },
        limit: { type: "number", description: "Number of transactions (default 10, max 50)" },
      },
      required: ["address"],
    },
  },
  {
    name: "prepare_swap",
    description: "Get a swap quote on Bags.fm. Returns estimated output and price impact.",
    input_schema: {
      type: "object" as const,
      properties: {
        from_mint: { type: "string", description: "Input token mint address" },
        to_mint: { type: "string", description: "Output token mint address" },
        amount_lamports: { type: "number", description: "Amount in smallest unit (1000000000 = 1 SOL)" },
      },
      required: ["from_mint", "to_mint", "amount_lamports"],
    },
  },
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  recordToolCall(name);
  try {
    switch (name) {
      case "get_trending_tokens": {
        const tokens = await getTopTokens((input.limit as number) ?? 10);
        return tokens.map((t, i) => {
          const info = t.tokenInfo;
          const change = info.stats24h?.priceChange;
          const vol = info.stats24h ? info.stats24h.buyVolume + info.stats24h.sellVolume : 0;
          return `${i + 1}. ${info.symbol} | $${info.usdPrice.toFixed(8)} | MCap: $${info.mcap >= 1e6 ? (info.mcap / 1e6).toFixed(2) + "M" : info.mcap.toLocaleString()} | 24h: ${change !== undefined ? (change > 0 ? "+" : "") + change.toFixed(2) + "%" : "N/A"} | Vol: $${vol >= 1e3 ? (vol / 1e3).toFixed(1) + "K" : vol.toFixed(0)}`;
        }).join("\n");
      }
      case "get_token_info":
      case "get_token_price": {
        const token = await findToken(input.symbol as string);
        if (!token) return `Token '${input.symbol}' not found in Bags.fm top tokens.`;
        const i = token.tokenInfo;
        const p = token.tokenLatestPrice;
        const change = i.stats24h?.priceChange;
        const vol = i.stats24h ? i.stats24h.buyVolume + i.stats24h.sellVolume : 0;
        return [
          `${i.name} (${i.symbol})`,
          `Address: ${token.token}`,
          `Price: $${i.usdPrice.toFixed(8)} | SOL: ${p ? p.priceSOL.toFixed(8) : "N/A"}`,
          `MCap: $${i.mcap >= 1e6 ? (i.mcap / 1e6).toFixed(2) + "M" : i.mcap.toLocaleString()} | FDV: $${i.fdv >= 1e6 ? (i.fdv / 1e6).toFixed(2) + "M" : i.fdv.toLocaleString()}`,
          `Liquidity: $${i.liquidity.toLocaleString()} | Holders: ${i.holderCount.toLocaleString()}`,
          `24h: ${change !== undefined ? (change > 0 ? "+" : "") + change.toFixed(2) + "%" : "N/A"} | Vol: $${vol >= 1e3 ? (vol / 1e3).toFixed(1) + "K" : vol.toFixed(0)}`,
          `Organic Score: ${i.organicScore} (${i.organicScoreLabel})`,
          i.stats24h ? `Buys: ${i.stats24h.numBuys} | Sells: ${i.stats24h.numSells} | Traders: ${i.stats24h.numTraders}` : "",
          i.audit ? `Audit — mint disabled: ${i.audit.mintAuthorityDisabled}, freeze disabled: ${i.audit.freezeAuthorityDisabled}, top holders: ${i.audit.topHoldersPercentage.toFixed(1)}%, bot holders: ${i.audit.botHoldersPercentage.toFixed(1)}%` : "",
          `Launchpad: ${i.launchpad} | Graduated: ${i.graduatedAt ?? "No"}`,
        ].filter(Boolean).join("\n");
      }
      case "get_wallet_portfolio": {
        const tokens = await getWalletTokens(input.address as string);
        if (!tokens.length) return `No tokens found for wallet ${input.address}`;
        return [`Wallet: ${input.address}`, `Found ${tokens.length} token accounts:`,
          ...tokens.slice(0, 20).map((t, i) => `${i + 1}. Mint: ${t.mint} | Amount: ${t.amount}`)
        ].join("\n");
      }
      case "get_recent_transactions": {
        const txs = await getRecentTransactions(input.address as string, (input.limit as number) ?? 10);
        if (!txs.length) return "No recent transactions found.";
        return txs.map((tx, i) => `${i + 1}. [${tx.status.toUpperCase()}] ${new Date(tx.timestamp * 1000).toISOString()} | ${tx.signature.slice(0, 24)}...`).join("\n");
      }
      case "prepare_swap": {
        const quote = await getSwapQuote(input.from_mint as string, input.to_mint as string, input.amount_lamports as number);
        if (!quote) return "Could not get quote — this token pair may not have a Bags.fm liquidity pool.";
        return `Swap: ${input.amount_lamports} in → ~${quote.outAmount} out | Price impact: ${quote.priceImpact.toFixed(4)}% | Fee: ${quote.fee}`;
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Error executing ${name}: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type StreamEvent =
  | { type: "tool_start"; tool: string }
  | { type: "tool_done"; tool: string }
  | { type: "text"; text: string }
  | { type: "done"; history: ChatMessage[] }
  | { type: "error"; message: string };

export async function chatStream(
  userMessage: string,
  history: ChatMessage[],
  emit: (event: StreamEvent) => void,
  apiKey?: string
): Promise<void> {
  const resolvedKey = apiKey || process.env.ANTHROPIC_API_KEY || "";
  const client = new Anthropic({ apiKey: resolvedKey });
  const messages: Anthropic.MessageParam[] = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  let finalText = "";

  // Agentic loop — tool calls run synchronously, final response streams
  while (true) {
    // Check if next turn will likely be a final response (after tool execution)
    const pendingTools = messages[messages.length - 1]?.role === "user" &&
      Array.isArray(messages[messages.length - 1]?.content);

    if (pendingTools || finalText === "") {
      // Try non-streaming first to detect tool use
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM,
        messages,
        tools: TOOL_DEFS,
      });

      if (response.stop_reason === "end_turn") {
        finalText = response.content
          .filter((b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === "text")
          .map((b: Anthropic.TextBlock) => b.text)
          .join("");
        break;
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            emit({ type: "tool_start", tool: block.name });
            const result = await executeTool(block.name, block.input as Record<string, unknown>);
            emit({ type: "tool_done", tool: block.name });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
          }
        }
        messages.push({ role: "user", content: toolResults });
        continue;
      }
    }
    break;
  }

  // Stream the final text word by word for UX
  if (finalText) {
    const words = finalText.split(/(\s+)/);
    for (const chunk of words) {
      emit({ type: "text", text: chunk });
      await new Promise(r => setTimeout(r, 12));
    }
  }

  const newHistory: ChatMessage[] = [
    ...history,
    { role: "user", content: userMessage },
    { role: "assistant", content: finalText },
  ];
  emit({ type: "done", history: newHistory });
}
