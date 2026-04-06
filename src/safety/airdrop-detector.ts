/**
 * Airdrop detector — scans for unexpected ERC-20 tokens across all wallets.
 * Saves a snapshot of known tokens to data/known-tokens.json.
 * Sends a Telegram alert if a new token is found.
 */
import { ethers } from "ethers";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getProvider } from "../chains/index.js";
import { loadWallets } from "../wallet-manager.js";
import { sendAlert } from "./alerts.js";
import { log } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_FILE = path.resolve(__dirname, "../../data/known-tokens.json");

// ERC-20 Transfer event topic
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

// Tokens the farm itself uses — ignore these
const KNOWN_FARM_TOKENS: Record<string, string[]> = {
  base:     ["0x4200000000000000000000000000000000000006", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
  scroll:   ["0x5300000000000000000000000000000000000004", "0x06efdbff2a14a7c8e15944d1f4a48f9f95f663a4"],
  linea:    ["0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f", "0x176211869ca2b568f2a7d4ee941e073a821ee1ff"],
  zksync:   ["0x5aea5775959fbc2557cc8789bc1bf90a239d9a91", "0x1d17cbcf0d6d143135ae902365d2e5e2a16538d4"],
  arbitrum: ["0x82af49447d8a07e3bd95bd0d56f35241523fbab1", "0xaf88d065e77c8cc2239327c5edb3a432268e5831"],
  optimism: ["0x4200000000000000000000000000000000000006", "0x0b2c639c533813f4aa9d7837caf62653d097ff85"],
  megaeth:  ["0x4200000000000000000000000000000000000006", "0xfafddbb3fc7688494971a79cc65dca3ef82079e7"],
  abstract: ["0x3439153eb7af838ad19d56e1571fbd09333c2809", "0x84a71ccd554cc1b02749b35d22f684cc8ec987e1"],
  unichain: ["0x4200000000000000000000000000000000000006", "0x078d782b760474a361dda0af3839290b0ef57ad6"],
};

type Snapshot = Record<string, Record<string, string[]>>; // chain → address → [tokenAddr]

function loadSnapshot(): Snapshot {
  if (!existsSync(SNAPSHOT_FILE)) return {};
  return JSON.parse(readFileSync(SNAPSHOT_FILE, "utf-8"));
}

function saveSnapshot(snapshot: Snapshot): void {
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
}

function isFarmToken(chain: string, tokenAddr: string): boolean {
  const known = KNOWN_FARM_TOKENS[chain.toLowerCase()] ?? [];
  return known.map(a => a.toLowerCase()).includes(tokenAddr.toLowerCase());
}

/** Scan recent Transfer events to wallet addresses on a chain */
async function scanChain(
  chain: string,
  walletAddresses: string[],
  snapshot: Snapshot,
): Promise<{ chain: string; wallet: string; token: string; symbol: string; amount: string }[]> {
  const findings: { chain: string; wallet: string; token: string; symbol: string; amount: string }[] = [];

  let provider: ethers.JsonRpcProvider;
  try {
    provider = getProvider(chain);
    await provider.getBlockNumber(); // connectivity check
  } catch {
    return findings; // chain RPC unavailable, skip silently
  }

  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - 10_000); // last ~10k blocks

  for (const walletAddr of walletAddresses) {
    const paddedAddr = "0x" + walletAddr.slice(2).toLowerCase().padStart(64, "0");

    let logs: ethers.Log[];
    try {
      logs = await provider.getLogs({
        fromBlock,
        toBlock: "latest",
        topics: [TRANSFER_TOPIC, null, paddedAddr],
      });
    } catch {
      continue;
    }

    for (const entry of logs) {
      const tokenAddr = entry.address.toLowerCase();

      if (isFarmToken(chain, tokenAddr)) continue;

      // Check if already in snapshot
      const knownTokens = snapshot[chain]?.[walletAddr.toLowerCase()] ?? [];
      if (knownTokens.includes(tokenAddr)) continue;

      // New token — check balance
      try {
        const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
        const [balance, symbol, decimals] = await Promise.all([
          token.balanceOf(walletAddr) as Promise<bigint>,
          token.symbol() as Promise<string>,
          token.decimals() as Promise<number>,
        ]);

        if (balance === 0n) continue;

        const formatted = ethers.formatUnits(balance, decimals);
        findings.push({ chain, wallet: walletAddr, token: tokenAddr, symbol, amount: formatted });
      } catch {
        continue; // not a standard ERC-20
      }
    }
  }

  return findings;
}

/** Run airdrop detection across all chains and wallets */
export async function detectAirdrops(chains: string[]): Promise<void> {
  const wallets = loadWallets();
  if (wallets.length === 0) return;

  const addresses = wallets.map(w => w.address.toLowerCase());
  const snapshot = loadSnapshot();
  const allFindings: { chain: string; wallet: string; token: string; symbol: string; amount: string }[] = [];

  for (const chain of chains) {
    try {
      const findings = await scanChain(chain, addresses, snapshot);
      allFindings.push(...findings);

      // Update snapshot with newly found tokens
      for (const f of findings) {
        if (!snapshot[chain]) snapshot[chain] = {};
        if (!snapshot[chain][f.wallet]) snapshot[chain][f.wallet] = [];
        if (!snapshot[chain][f.wallet].includes(f.token)) {
          snapshot[chain][f.wallet].push(f.token);
        }
      }
    } catch {
      // Skip chain on error
    }
  }

  saveSnapshot(snapshot);

  if (allFindings.length === 0) {
    log.info("Airdrop scan complete — no new tokens found.");
    return;
  }

  // Alert for each finding
  for (const f of allFindings) {
    const walletIdx = wallets.find(w => w.address.toLowerCase() === f.wallet)?.index ?? "?";
    const msg = [
      `*Potential Airdrop Detected!*`,
      ``,
      `Chain: ${f.chain}`,
      `Wallet: W${String(walletIdx).padStart(2, "0")} (${f.wallet.slice(0, 10)}...)`,
      `Token: ${f.symbol} (${f.token.slice(0, 10)}...)`,
      `Balance: ${f.amount} ${f.symbol}`,
    ].join("\n");

    log.success(`[AIRDROP] ${f.symbol} on ${f.chain} — W${walletIdx}: ${f.amount}`);
    await sendAlert(msg, "critical").catch(() => {});
  }
}
