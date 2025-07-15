import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
const privateKey = process.env.AMOY_PRIVATE_KEY;
const wallet = new ethers.Wallet(privateKey, provider);

const ERC20_ABI = [
  'function transfer(address to, uint256 value) public returns (bool)',
  'function decimals() view returns (uint8)'
];

export default async function handler(req, res) {
  console.log('[POL] Incoming request:', req.method, req.url, req.body);
  
  if (req.method === 'GET') {
    try {
      const balance = await provider.getBalance(wallet.address);
      res.json({
        address: wallet.address,
        balance: ethers.formatEther(balance)
      });
      return;
    } catch (error) {
      res.status(500).json({ error: error.message });
      return;
    }
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { recipients, amounts, tokenAddress, type } = req.body;

  if (!recipients || !amounts || recipients.length !== amounts.length) {
    res.status(400).json({ error: 'Invalid recipient/amount data' });
    return;
  }

  try {
    let results = [];
    if (type === 'native') {
      // Send MATIC
      for (let i = 0; i < recipients.length; i++) {
        try {
          const tx = await wallet.sendTransaction({
            to: recipients[i],
            value: ethers.parseEther(amounts[i].toString())
          });
          await tx.wait();
          results.push({
            recipient: recipients[i],
            amount: amounts[i],
            success: true,
            txHash: tx.hash,
            explorerLink: `https://amoy.polygonscan.com/tx/${tx.hash}`
          });
        } catch (error) {
          results.push({
            recipient: recipients[i],
            amount: amounts[i],
            success: false,
            error: error.message
          });
        }
      }
    } else {
      // ERC-20
      if (!tokenAddress) {
        res.status(400).json({ error: 'Token address required for ERC-20' });
        return;
      }
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
      const decimals = await contract.decimals();
      for (let i = 0; i < recipients.length; i++) {
        try {
          const tx = await contract.transfer(
            recipients[i],
            ethers.parseUnits(amounts[i].toString(), decimals)
          );
          await tx.wait();
          results.push({
            recipient: recipients[i],
            amount: amounts[i],
            success: true,
            txHash: tx.hash,
            explorerLink: `https://amoy.polygonscan.com/tx/${tx.hash}`
          });
        } catch (error) {
          results.push({
            recipient: recipients[i],
            amount: amounts[i],
            success: false,
            error: error.message
          });
        }
      }
    }
    res.json({
      success: results.every(tx => tx.success),
      summary: {
        total: results.length,
        successCount: results.filter(tx => tx.success).length,
        failureCount: results.filter(tx => !tx.success).length
      },
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
} 