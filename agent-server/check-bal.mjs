import 'dotenv/config';
import { listWallets, getBalances, estimateContractFee } from './planbok-client.js';
import { ethers } from 'ethers';

const sellerWallet = '0x72cc17657d7008ef730c22e4ff5f3c8507c4e2df';
const all = await listWallets({ blockchain: 'ETH-SEPOLIA', limit: 100 });
const w = all.find(x => x.address?.toLowerCase() === sellerWallet.toLowerCase());
console.log('Wallet:', w?.id, w?.address);

const balances = await getBalances(w.id);
console.log('\nPlanbok /balances sees:');
for (const b of balances) {
  console.log(`  ${b.token?.symbol?.padEnd(6)} addr=${b.token?.address} amount=${b.amount}`);
}

const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
const erc20 = new ethers.Contract('0xab007ED755E3ac0946899dC2DD183362B49Ee207', ['function balanceOf(address) view returns (uint256)'], provider);
const onchainMock = await erc20.balanceOf(sellerWallet);
const onchainEth = await provider.getBalance(sellerWallet);
console.log(`\nChain directly sees: MOCK=${ethers.formatUnits(onchainMock,18)} ETH=${ethers.formatEther(onchainEth)}`);

try {
  const est = await estimateContractFee({
    walletId: w.id,
    contractAddress: '0xab007ED755E3ac0946899dC2DD183362B49Ee207',
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters: ['0xD605C56E969CC51aEe9e350Fc975D8eBcd7FcBF3', ethers.MaxUint256.toString()],
  });
  console.log('\nestimate-fee OK:', JSON.stringify(est, null, 2));
} catch (e) {
  console.log('\nestimate-fee error:', e.message.slice(0, 500));
}
