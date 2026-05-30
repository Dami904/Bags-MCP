import { GoogleGenerativeAI, FunctionDeclaration, SchemaType, Tool } from "@google/generative-ai";
import { getTopTokens, findToken, getSwapQuote } from "./api/bags.js";
import { getWalletTokens, getRecentTransactions } from "./api/solana.js";
import { recordToolCall } from "./metrics.js";
import type { StreamEvent, ChatMessage } from "./chat.js";

const SYSTEM = `You are BagsMCP, an AI assistant with live access to Bags.fm — a Solana token launch and trading platform.
You have tools to fetch real-time token prices, market data, wallet portfolios, and swap quotes.
Be concise. Lead with the most important number or insight. Format numbers clearly ($ for USD, abbreviate large numbers like 1.2M, 450K).
When showing token lists use a markdown table. Always mention data is live from Bags.fm.`;

const TOOL_DEFS: FunctionDeclaration[] = [
  {
    name: "get_trending_tokens",
    description: "Get the top trending tokens on Bags.fm ranked by lifetime fees generated.",
    parameters: { type: SchemaType.OBJECT, properties: { limit: { type: SchemaType.NUMBER, description: "Number of tokens (max 50, default 10)" } } },
  },
  {
    name: "get_token_info",
    description: "Get full market data for a token: price, market cap, volume, holders, liquidity, 24h stats, audit.",
    parameters: { type: SchemaType.OBJECT, properties: { symbol: { type: SchemaType.STRING, description: "Token symbol or contract address" } }, required: ["symbol"] },
  },
  {
    name: "get_token_price",
    description: "Get the current price of a token with 24h change and volume.",
    parameters: { type: SchemaType.OBJECT, properties: { symbol: { type: SchemaType.STRING, description: "Token symbol or contract address" } }, required: ["symbol"] },
  },
  {
    name: "get_wallet_portfolio",
    description: "Get all tokens held by a Solana wallet address.",
    parameters: { type: SchemaType.OBJECT, properties: { address: { type: SchemaType.STRING, description: "Solana wallet public key" } }, required: ["address"] },
  },
  {
    name: "get_recent_transactions",
    description: "Get the most recent transactions for a Solana wallet.",
    parameters: { type: SchemaType.OBJECT, properties: { address: { type: SchemaType.STRING, description: "Solana wallet public key" }, limit: { type: SchemaType.NUMBER, description: "Number of transactions (default 10, max 50)" } }, required: ["address"] },
  },
  {
    name: "prepare_swap",
    description: "Get a swap quote on Bags.fm. Returns estimated output and price impact.",
    parameters: { type: SchemaType.OBJECT, properties: { from_mint: { type: SchemaType.STRING, description: "Input token mint address" }, to_mint: { type: SchemaType.STRING, description: "Output token mint address" }, amount_lamports: { type: SchemaType.NUMBER, description: "Amount in smallest unit" } }, required: ["from_mint", "to_mint", "amount_lamports"] },
  },
];

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  recordToolCall(name);
  try {
    switch (name) {
      case "get_trending_tokens": {
        const tokens = await getTopTokens((args.limit as number) ?? 10);
        return tokens.map((t, i) => {
          const info = t.tokenInfo;
          const change = info.stats24h?.priceChange;
          const vol = info.stats24h ? info.stats24h.buyVolume + info.stats24h.sellVolume : 0;
          return `${i + 1}. ${info.symbol} | $${info.usdPrice.toFixed(8)} | MCap: $${info.mcap >= 1e6 ? (info.mcap / 1e6).toFixed(2) + "M" : info.mcap.toLocaleString()} | 24h: ${change !== undefined ? (change > 0 ? "+" : "") + change.toFixed(2) + "%" : "N/A"} | Vol: $${vol >= 1e3 ? (vol / 1e3).toFixed(1) + "K" : vol.toFixed(0)}`;
        }).join("\n");
      }
      case "get_token_info":
      case "get_token_price": {
        const token = await findToken(args.symbol as string);
        if (!token) return `Token '${args.symbol}' not found.`;
        const i = token.tokenInfo;
        const p = token.tokenLatestPrice;
        const change = i.stats24h?.priceChange;
        const vol = i.stats24h ? i.stats24h.buyVolume + i.stats24h.sellVolume : 0;
        return [
          `${i.name} (${i.symbol}) — ${token.token}`,
          `Price: $${i.usdPrice.toFixed(8)} | SOL: ${p ? p.priceSOL.toFixed(8) : "N/A"}`,
          `MCap: $${i.mcap >= 1e6 ? (i.mcap / 1e6).toFixed(2) + "M" : i.mcap.toLocaleString()} | FDV: $${i.fdv >= 1e6 ? (i.fdv / 1e6).toFixed(2) + "M" : i.fdv.toLocaleString()}`,
          `Liquidity: $${i.liquidity.toLocaleString()} | Holders: ${i.holderCount.toLocaleString()}`,
          `24h: ${change !== undefined ? (change > 0 ? "+" : "") + change.toFixed(2) + "%" : "N/A"} | Vol: $${vol >= 1e3 ? (vol / 1e3).toFixed(1) + "K" : vol.toFixed(0)}`,
          `Organic Score: ${i.organicScore} (${i.organicScoreLabel})`,
          i.audit ? `Audit — mint disabled: ${i.audit.mintAuthorityDisabled}, freeze disabled: ${i.audit.freezeAuthorityDisabled}, top holders: ${i.audit.topHoldersPercentage.toFixed(1)}%, bot holders: ${i.audit.botHoldersPercentage.toFixed(1)}%` : "",
        ].filter(Boolean).join("\n");
      }
      case "get_wallet_portfolio": {
        const tokens = await getWalletTokens(args.address as string);
        if (!tokens.length) return `No tokens found for wallet ${args.address}`;
        return [`Wallet: ${args.address}`, `Found ${tokens.length} token accounts:`, ...tokens.slice(0, 20).map((t, i) => `${i + 1}. Mint: ${t.mint} | Amount: ${t.amount}`)].join("\n");
      }
      case "get_recent_transactions": {
        const txs = await getRecentTransactions(args.address as string, (args.limit as number) ?? 10);
        if (!txs.length) return "No recent transactions found.";
        return txs.map((tx, i) => `${i + 1}. [${tx.status.toUpperCase()}] ${new Date(tx.timestamp * 1000).toISOString()} | ${tx.signature.slice(0, 24)}...`).join("\n");
      }
      case "prepare_swap": {
        const quote = await getSwapQuote(args.from_mint as string, args.to_mint as string, args.amount_lamports as number);
        if (!quote) return "Could not get quote — no liquidity pool found.";
        return `Swap: ${args.amount_lamports} in → ~${quote.outAmount} out | Price impact: ${quote.priceImpact.toFixed(4)}%`;
      }
      default: return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export async function geminiStream(
  userMessage: string,
  history: ChatMessage[],
  emit: (event: StreamEvent) => void,
  apiKey: string
): Promise<void> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite",
    systemInstruction: SYSTEM,
    tools: [{ functionDeclarations: TOOL_DEFS } as Tool],
  });

  const geminiHistory = history.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history: geminiHistory });
  let finalText = "";

  // Agentic tool loop
  let response = await chat.sendMessage(userMessage);

  while (true) {
    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const toolCalls = candidate.content.parts.filter(p => p.functionCall);
    if (toolCalls.length === 0) {
      finalText = candidate.content.parts.find(p => p.text)?.text ?? "";
      break;
    }

    const toolResults = [];
    for (const part of toolCalls) {
      if (!part.functionCall) continue;
      emit({ type: "tool_start", tool: part.functionCall.name });
      const result = await executeTool(part.functionCall.name, part.functionCall.args as Record<string, unknown>);
      emit({ type: "tool_done", tool: part.functionCall.name });
      toolResults.push({ functionResponse: { name: part.functionCall.name, response: { result } } });
    }

    response = await chat.sendMessage(toolResults as any);
  }

  // Stream final text word by word
  if (finalText) {
    for (const chunk of finalText.split(/(\s+)/)) {
      emit({ type: "text", text: chunk });
      await new Promise(r => setTimeout(r, 12));
    }
  }

  emit({
    type: "done",
    history: [...history, { role: "user", content: userMessage }, { role: "assistant", content: finalText }],
  });
}
