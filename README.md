# BagsMCP — Bags.fm MCP Server for Claude

Give Claude native access to the Bags.fm ecosystem on Solana. Ask natural language questions and get live on-chain data back.

## What it does

- *"What are the top trending tokens on Bags right now?"*
- *"Give me full info on ASTEROID"*
- *"Analyze my wallet [address]"*
- *"Compare PEPE vs NYAN on Bags"*
- *"Prepare a swap of 1 SOL to ASTEROID"*

## Tools

| Tool | Description |
|------|-------------|
| `get_token_price` | Live price, 24h change, and volume |
| `get_token_info` | Market cap, liquidity, holders, audit info, 24h stats |
| `get_trending_tokens` | Top tokens on Bags.fm by lifetime fees |
| `get_wallet_portfolio` | Full token breakdown for any Solana wallet |
| `get_recent_transactions` | Last N transactions for a wallet |
| `prepare_swap` | Swap quote via Bags.fm trade API |

## Prompts

| Prompt | Description |
|--------|-------------|
| `/analyze-wallet` | Deep wallet analysis — portfolio + recent activity |
| `/compare-tokens` | Side-by-side token comparison |
| `/market-overview` | Full Bags.fm market snapshot |

## Connect to Claude Desktop

Add to your Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "bags": {
      "url": "https://bags-mcp.onrender.com/mcp",
      "headers": {
        "Authorization": "Bearer your_mcp_auth_token"
      }
    }
  }
}
```

## Local dev (stdio)

```bash
git clone https://github.com/Dami904/Bags-MCP
cd bags-mcp-server
npm install
cp .env.example .env   # fill in BAGS_API_KEY
npm run build
node dist/index.js
```

## Stack

TypeScript · MCP SDK · Bags SDK (`@bagsfm/bags-sdk`) · Solana web3.js · Render

## Bags Token

$BMCP — *[contract address]*

---

*Built for the Bags Hackathon — Claude Skills + Bags API + AI Agents*
