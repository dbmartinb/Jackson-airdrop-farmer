import { getProvider } from './src/chains/index.js';

async function main() {
  const p = getProvider('unichain');
  const block = await p.getBlockNumber();
  console.log('Unichain block:', block);
}
main().catch(e => console.error('RPC error:', e.message));
