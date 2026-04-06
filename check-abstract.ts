import { loadWallets } from './src/wallet-manager.js';
import { getProvider } from './src/chains/index.js';
import { formatEth } from './src/utils/gas.js';

async function main() {
  const wallets = loadWallets();
  const provider = getProvider('abstract');
  console.log('Abstract balances:');
  for (const w of wallets) {
    const bal = await provider.getBalance(w.address);
    console.log(`W${String(w.index).padStart(2,'0')}: ${formatEth(bal)} ETH`);
  }
}
main().catch(console.error);
