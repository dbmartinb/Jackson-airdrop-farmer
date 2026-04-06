import { ethers } from 'ethers';
import { loadWallets, getPrivateKey } from './src/wallet-manager.js';
import { getSigner, getProvider } from './src/chains/index.js';
import { formatEth } from './src/utils/gas.js';

async function main() {
  const wallets = loadWallets();
  const w00 = wallets[0];
  const provider = getProvider('unichain');
  const signer = getSigner('unichain', getPrivateKey(w00));

  const balance = await provider.getBalance(w00.address);
  const reserve = ethers.parseEther('0.001');
  const recipients = wallets.slice(1);
  const perWallet = (balance - reserve) / BigInt(recipients.length);

  console.log(`Distributing ${formatEth(balance - reserve)} ETH → ${formatEth(perWallet)} each`);

  for (const r of recipients) {
    try {
      const tx = await signer.sendTransaction({ to: r.address, value: perWallet });
      console.log(`W00 → W${String(r.index).padStart(2,'0')}: tx ${tx.hash}`);
      // Wait with 60s timeout
      const receipt = await Promise.race([
        tx.wait(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 60000))
      ]);
      console.log(`  confirmed`);
    } catch (e: any) {
      console.error(`  W${r.index} error: ${e.message}`);
    }
  }
  console.log('Done');
}
main().catch(console.error);
