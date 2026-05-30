import axios from "axios";

const solanaClient = axios.create({
  baseURL: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

export interface WalletToken {
  symbol: string;
  name: string;
  amount: number;
  decimals: number;
  mint: string;
  price_usd?: number;
  value_usd?: number;
}

export interface Transaction {
  signature: string;
  type: string;
  timestamp: number;
  fee: number;
  status: "success" | "failed";
}

export async function getWalletTokens(address: string): Promise<WalletToken[]> {
  const { data } = await solanaClient.post("", {
    jsonrpc: "2.0",
    id: "bags-mcp",
    method: "getTokenAccountsByOwner",
    params: [
      address,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ],
  });
  return data.result?.value?.map((account: any) => ({
    mint: account.account.data.parsed.info.mint,
    amount: account.account.data.parsed.info.tokenAmount.uiAmount,
    decimals: account.account.data.parsed.info.tokenAmount.decimals,
    symbol: account.account.data.parsed.info.mint.slice(0, 6) + "...",
    name: "Unknown Token",
  })) || [];
}

export async function getRecentTransactions(address: string, limit = 10): Promise<Transaction[]> {
  const { data } = await solanaClient.post("", {
    jsonrpc: "2.0",
    id: "bags-mcp",
    method: "getSignaturesForAddress",
    params: [address, { limit }],
  });
  return data.result?.map((tx: any) => ({
    signature: tx.signature,
    type: "transaction",
    timestamp: tx.blockTime,
    fee: tx.fee || 0,
    status: tx.err ? "failed" : "success",
  })) || [];
}
