# BagsMCP — Bags.fm MCP Server for Claude

Give Claude native access to the Bags.fm ecosystem on Solana. Ask natural language questions and get live on-chain data back.

🌐 **Website:** [bags-mcp.onrender.com](https://bags-mcp.onrender.com) · 📊 **Dashboard:** [bags-mcp.onrender.com/dashboard](https://bags-mcp.onrender.com/dashboard) · 🛠 **GitHub:** [Dami904/Bags-MCP](https://github.com/Dami904/Bags-MCP)

## What it does

- *"What are the top trending tokens on Bags right now?"*
- *"Give me full info on ASTEROID"*
- *"Analyze my wallet [address]"*
- *"Compare PEPE vs NYAN on Bags"*
- *"Prepare a swap of 1 SOL to ASTEROID"*
- *"What tokens launched in the last hour?"*

## Tools

| Tool | Description |
|------|-------------|
| `get_token_price` | Live price, 24h change, and volume |
| `get_token_info` | Market cap, liquidity, holders, audit info, 24h stats |
| `get_trending_tokens` | Top tokens on Bags.fm by lifetime fees |
| `get_wallet_portfolio` | Full token breakdown for any Solana wallet |
| `get_recent_transactions` | Last N transactions for a wallet |
| `prepare_swap` | Swap quote via Bags.fm trade API |
| `get_recently_launched` | Most recently launched tokens, sorted by launch date |

## Prompts

| Prompt | Description |
|--------|-------------|
| `/analyze-wallet` | Deep wallet analysis — portfolio + recent activity |
| `/compare-tokens` | Side-by-side token comparison |
| `/market-overview` | Full Bags.fm market snapshot |

## Connect to Claude Desktop

The server is **free and public** — no API key or auth token required.

### Option A — mcp-remote (works with all versions of Claude Desktop)

Requires Node.js installed. Add to `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac):

```json
{
  "mcpServers": {
    "bags": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://bags-mcp.onrender.com/mcp"]
    }
  }
}
```

`npx` will auto-download `mcp-remote` on first run — no manual install needed.

### Option B — Direct URL (newer Claude Desktop only)

```json
{
  "mcpServers": {
    "bags": {
      "url": "https://bags-mcp.onrender.com/mcp"
    }
  }
}
```

Restart Claude Desktop after saving. If you see *"not valid MCP server configurations"*, use Option A instead.

### Cursor

Open **Cursor Settings → MCP** and add a new server, or paste into `~/.cursor/mcp.json`:

```json
{
  "bags": {
    "url": "https://bags-mcp.onrender.com/mcp"
  }
}
```

## Local dev (stdio)

```bash
git clone https://github.com/Dami904/Bags-MCP
cd bags-mcp-server
npm install
cp .env.example .env
npm run build
node dist/index.js
```

## Stack

TypeScript · MCP SDK · Bags.fm API · Solana web3.js · Render · Upstash Redis

## Dashboard

Live usage stats and market data at [bags-mcp.onrender.com/dashboard](https://bags-mcp.onrender.com/dashboard)

---

*Built for the Bags Hackathon — Claude Skills + Bags API + AI Agents*
