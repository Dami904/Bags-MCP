import { BagsSDK } from "@bagsfm/bags-sdk";
import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
);

export const sdk = new BagsSDK(
  process.env.BAGS_API_KEY!,
  connection,
  "processed"
);

// ─── Response shapes from the real API ────────────────────────────────────────

export interface BagsToken {
  token: string;
  lifetimeFees: string;
  tokenInfo: {
    id: string;
    name: string;
    symbol: string;
    icon: string;
    decimals: number;
    twitter?: string;
    website?: string;
    dev: string;
    circSupply: number;
    totalSupply: number;
    holderCount: number;
    launchpad: string;
    fdv: number;
    mcap: number;
    usdPrice: number;
    liquidity: number;
    organicScore: number;
    organicScoreLabel: string;
    fees: number;
    bondingCurve: number;
    createdAt: string;
    updatedAt: string;
    stats6h?: TokenStats;
    stats24h?: TokenStats;
    stats7d?: { priceChange: number };
    stats30d?: { priceChange: number };
    graduatedPool?: string;
    graduatedAt?: string;
    audit?: {
      mintAuthorityDisabled: boolean;
      freezeAuthorityDisabled: boolean;
      topHoldersPercentage: number;
      botHoldersCount: number;
      botHoldersPercentage: number;
    };
  };
  tokenLatestPrice?: {
    price: number;
    priceUSD: number;
    priceSOL: number;
    volumeUSD: number;
    volumeSOL: number;
    blockTime: string;
  };
}

export interface TokenStats {
  priceChange: number;
  liquidityChange: number;
  volumeChange: number;
  buyVolume: number;
  sellVolume: number;
  numBuys: number;
  numSells: number;
  numTraders: number;
  numNetBuyers: number;
}

// ─── API calls ─────────────────────────────────────────────────────────────────

export async function getTopTokens(limit = 20): Promise<BagsToken[]> {
  const tokens: BagsToken[] = await sdk.bagsApiClient.get(
    "/token-launch/top-tokens/lifetime-fees"
  );
  return tokens.slice(0, limit);
}

export async function findToken(query: string): Promise<BagsToken | null> {
  const tokens = await getTopTokens(166);
  const q = query.toLowerCase();
  return (
    tokens.find(
      (t) =>
        t.token.toLowerCase() === q ||
        t.tokenInfo.symbol.toLowerCase() === q ||
        t.tokenInfo.name.toLowerCase().includes(q)
    ) ?? null
  );
}

export async function getSwapQuote(
  fromMint: string,
  toMint: string,
  amountLamports: number
): Promise<{ inAmount: number; outAmount: number; priceImpact: number; fee: number } | null> {
  try {
    const res: any = await sdk.trade.getQuote({
      inputMint: new PublicKey(fromMint),
      outputMint: new PublicKey(toMint),
      amount: amountLamports,
      slippageMode: "auto",
    });
    return {
      inAmount: res.inAmount ?? amountLamports,
      outAmount: res.outAmount ?? res.expectedOutputAmount ?? 0,
      priceImpact: res.priceImpact ?? res.priceImpactPct ?? 0,
      fee: res.platformFee ?? res.fee ?? 0,
    };
  } catch {
    return null;
  }
}
