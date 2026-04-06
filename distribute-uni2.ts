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
  const feeData = await provider.getFeeData();

  console.log(`Balance: ${formatEth(balance)} ETH`);
  console.log(`Per wallet: ${formatEth(perWallet)} ETH`);
  console.log(`Gas price: ${feeData.gasPrice} wei`);

  let nonce = await provider.getTransactionCount(w00.address, 'latest');

  for (const r of recipients) {
    try {
      const tx = await signer.sendTransaction({
        to: r.address,
        value: perWallet,
        nonce: nonce++,
        maxFeePerGas: feeData.maxFeePerGas! * 2n,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas! * 2n,
      });
      console.log(`W00 → W${String(r.index).padStart(2,'0')}: ${tx.hash}`);
      const receipt = await Promise.race([
        tx.wait(),
        new Promise<null>((_, rej) => setTimeout(() => rej(new Error('60s timeout')), 60000))
      ]);
      console.log(`  confirmed in block ${(receipt as any)?.blockNumber}`);
    } catch (e: any) {
      console.error(`  W${r.index} error: ${e.message}`);
    }
  }
  
  const finalBal = await provider.getBalance(w00.address);
  console.log(`\nW00 remaining: ${formatEth(finalBal)} ETH`);
}
main().catch(console.error);
