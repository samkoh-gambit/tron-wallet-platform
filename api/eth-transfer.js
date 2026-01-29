import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
const wallet = new ethers.Wallet(privateKey, provider);

const ERC20_ABI = [
  'function transfer(address to, uint256 value) public returns (bool)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)'
];

async function getUSDTBalance() {
  try {
    const usdtContractAddress = '0xbDeaD2A70Fe794D2f97b37EFDE497e68974a296d'; // USDT on Sepolia
    const contract = new ethers.Contract(usdtContractAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(wallet.address);
    const decimals = await contract.decimals();

    // Convert from wei to token units
    return parseFloat(ethers.formatUnits(balance, decimals));
  } catch (error) {
    console.error('Error fetching USDT balance:', error);
    return 0;
  }
}

async function getOKKBalance() {
  try {
    const okkContractAddress = '0xC360c5E1aF4f29ECA6322813F4c5122A42a2E129'; // OKK on Sepolia
    const contract = new ethers.Contract(okkContractAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(wallet.address);
    const decimals = await contract.decimals();

    // Convert from wei to token units
    return parseFloat(ethers.formatUnits(balance, decimals));
  } catch (error) {
    console.error('Error fetching OKK balance:', error);
    return 0;
  }
}

async function getIMYRTokenBalance() {
  try {
    const imyrTokenContractAddress = '0x250AF871Fc8831f2B08c0d0e72C73aC4970F53e0'; // IMYR on Sepolia
    const contract = new ethers.Contract(imyrTokenContractAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(wallet.address);
    const decimals = await contract.decimals();
    return parseFloat(ethers.formatUnits(balance, decimals));
  } catch (error) {
    console.error('Error fetching IMYR Token balance:', error);
    return 0;
  }
}

export default async function handler(req, res) {
  console.log('[ETH] Incoming request:', req.method, req.url, req.body);

  if (req.method === 'GET') {
    try {
      const balance = await provider.getBalance(wallet.address);
      const usdtBalance = await getUSDTBalance();
      const okkBalance = await getOKKBalance();
      const imyrTokenBalance = await getIMYRTokenBalance();
      res.json({
        address: wallet.address,
        balance: ethers.formatEther(balance),
        usdtBalance: usdtBalance,
        okkBalance: okkBalance,
        imyrTokenBalance: imyrTokenBalance
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
      // Send ETH
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
            explorerLink: `https://sepolia.etherscan.io/tx/${tx.hash}`
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
      // ERC-20 (USDT, OKK or IMYR)
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
            explorerLink: `https://sepolia.etherscan.io/tx/${tx.hash}`
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