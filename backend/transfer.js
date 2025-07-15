import { TronWeb } from 'tronweb';
import dotenv from 'dotenv';

dotenv.config();

const fullNode = process.env.TRON_FULL_NODE;
const solidityNode = process.env.TRON_SOLIDITY_NODE;
const eventServer = process.env.TRON_EVENT_SERVER;
const privateKey = process.env.TRON_WALLET_PRIVATE_KEY;
const tronWeb = new TronWeb(fullNode, solidityNode, eventServer, privateKey);

async function getBalance() {
  const balance = await tronWeb.trx.getBalance(tronWeb.defaultAddress.base58);
  return balance;
}

export default async function handler(req, res) {
  console.log('[TRON] Incoming request:', req.method, req.url, req.body);
  if (req.method === 'GET') {
    try {
      const balance = await getBalance();
      res.json({
        address: tronWeb.defaultAddress.base58,
        balance: tronWeb.fromSun(balance)
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
    if (type === 'trc20') {
      if (!tokenAddress) {
        res.status(400).json({ error: 'Token address required for TRC20' });
        return;
      }
      const contract = await tronWeb.contract().at(tokenAddress);
      const sender = tronWeb.defaultAddress.base58;
      const balance = await contract.balanceOf(sender).call();
      const balanceInTRX = tronWeb.fromSun(balance);
      const totalToSend = amounts.reduce((sum, amt) => sum + Number(amt), 0);
      if (balanceInTRX < totalToSend) {
        res.status(400).json({ error: 'Insufficient token balance' });
        return;
      }
      const results = [];
      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const amountInSun = tronWeb.toSun(amounts[i]);
        try {
          const tx = await contract.transfer(recipient, amountInSun).send();
          results.push({
            recipient,
            amount: amounts[i],
            success: true,
            txHash: tx,
            explorerLink: `https://shasta.tronscan.org/#/transaction/${tx}`
          });
        } catch (error) {
          results.push({
            recipient,
            amount: amounts[i],
            success: false,
            error: error.message
          });
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
    } else {
      // Native TRX
      const sender = tronWeb.defaultAddress.base58;
      const balance = await tronWeb.trx.getBalance(sender);
      const balanceInTRX = tronWeb.fromSun(balance);
      const totalToSend = amounts.reduce((sum, amt) => sum + Number(amt), 0);
      const gasBuffer = 1;
      if (balanceInTRX < (totalToSend + gasBuffer)) {
        res.status(400).json({ error: `Insufficient TRX balance` });
        return;
      }
      const results = [];
      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const amountInSun = tronWeb.toSun(amounts[i]);
        try {
          const tx = await tronWeb.trx.sendTransaction(recipient, amountInSun);
          results.push({
            recipient,
            amount: amounts[i],
            success: true,
            txHash: tx.txid,
            explorerLink: `https://shasta.tronscan.org/#/transaction/${tx.txid}`
          });
        } catch (error) {
          results.push({
            recipient,
            amount: amounts[i],
            success: false,
            error: error.message
          });
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
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
} 