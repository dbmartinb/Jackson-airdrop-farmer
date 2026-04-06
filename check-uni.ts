import { loadWallets } from './src/wallet-manager.js';
import { getProvider } from './src/chains/index.js';
import { formatEth } from './src/utils/gas.js';

async function main() {
  const wallets = loadWallets();
  const provider = getProvider('unichain');
  console.log('Unichain balances:');
  for (const w of wallets) {
    const bal = await provider.getBalance(w.address);
    console.log(`W${String(w.index).padStart(2,'0')}: ${formatEth(bal)} ETH`);
  }
}
main();
