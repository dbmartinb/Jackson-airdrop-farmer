import { getProvider } from './src/chains/index.js';

async function main() {
  const provider = getProvider('unichain');
  const addr = '0xb7501C21e57244410C60a626C65C2F04A021d071';
  const confirmed = await provider.getTransactionCount(addr, 'latest');
  const pending = await provider.getTransactionCount(addr, 'pending');
  const feeData = await provider.getFeeData();
  console.log(`Confirmed nonce: ${confirmed}, Pending nonce: ${pending}`);
  console.log(`Gas price: ${feeData.gasPrice?.toString()} wei`);
  console.log(`Max fee: ${feeData.maxFeePerGas?.toString()} wei`);
}
main().catch(console.error);
