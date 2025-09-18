import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
const privateKey = process.env.BSC_PRIVATE_KEY;
const wallet = new ethers.Wallet(privateKey, provider);

const ERC20_ABI = [
  'function transfer(address to, uint256 value) public returns (bool)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)'
];

async function getUSDTBalance() {
  try {
    // Try multiple testnet token addresses
    const testTokens = [
      '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', // Original USDT testnet
      // '0x55d398326f99059fF775485246999027B3197955', // Mainnet USDT (might work on testnet)
      // '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'  // USDC on BSC (alternative)
    ];
    
    for (const tokenAddress of testTokens) {
      try {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const balance = await contract.balanceOf(wallet.address);
        const decimals = await contract.decimals();
        
        // Convert from wei to token units
        const formattedBalance = parseFloat(ethers.formatUnits(balance, decimals));
        
        if (formattedBalance > 0) {
          return formattedBalance;
        }
      } catch (tokenError) {
        continue;
      }
    }
    
    return 0;
  } catch (error) {
    console.error('Error fetching USDT balance:', error);
    return 0;
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const balance = await provider.getBalance(wallet.address);
      const usdtBalance = await getUSDTBalance();
      
      res.json({
        address: wallet.address,
        balance: ethers.formatEther(balance),
        usdtBalance: usdtBalance
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
      // Send BNB
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
            explorerLink: `https://testnet.bscscan.com/tx/${tx.hash}`
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
      // BEP-20 (USDT)
      if (!tokenAddress) {
        res.status(400).json({ error: 'Token address required for BEP-20' });
        return;
      }
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
      
      // Try to get decimals, fallback to 6 for USDT if it fails
      let decimals;
      try {
        decimals = await contract.decimals();
      } catch (error) {
        console.log(`Could not get decimals for token ${tokenAddress}, using default 6 for USDT`);
        decimals = 6; // USDT typically has 6 decimals
      }
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
            explorerLink: `https://testnet.bscscan.com/tx/${tx.hash}`
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