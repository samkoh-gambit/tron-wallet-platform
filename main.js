// This file is deprecated. The backend is now handled by Vercel serverless functions in /api/transfer.js

import express from 'express';
import cors from 'cors';
import { TronWeb } from 'tronweb';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Get the directory path of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from parent directory (one level up)
dotenv.config({ path: join(__dirname, '../.env') });

// Check if private key exists
if (!process.env.TRON_WALLET_PRIVATE_KEY) {
  console.error("❌ TRON_WALLET_PRIVATE_KEY not found in .env file");
  process.exit(1);
}

// Tron Shasta Testnet Nodes
const fullNode = process.env.TRON_FULL_NODE;
const solidityNode = process.env.TRON_SOLIDITY_NODE;
const eventServer = process.env.TRON_EVENT_SERVER;

// PRIVATE KEY (Don't use this in production)
const privateKey = process.env.TRON_WALLET_PRIVATE_KEY;
const tronWeb = new TronWeb(fullNode, solidityNode, eventServer, privateKey);

console.log("✅ TronWeb initialized with address:", tronWeb.defaultAddress.base58);


// === POST: Transfer Native TRX ===
app.post('/transfer-trx', async (req, res) => {
  const { recipients, amounts } = req.body;

  if (!recipients || !amounts || recipients.length !== amounts.length) {
    return res.status(400).json({ error: 'Invalid recipient/amount data' });
  }

  try {
    const sender = tronWeb.defaultAddress.base58;
    const balance = await tronWeb.trx.getBalance(sender);
    const balanceInTRX = tronWeb.fromSun(balance);

    const totalToSend = amounts.reduce((sum, amt) => sum + Number(amt), 0);
    const gasBuffer = 1;

    if (balanceInTRX < (totalToSend + gasBuffer)) {
      return res.status(400).json({ error: `Insufficient TRX balance` });
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

    // res.json({ results });
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
});

// === POST: Transfer TRC-20 Tokens ===
app.post('/transfer-trc20', async (req, res) => {
  const { recipients, amounts, tokenAddress } = req.body;

  if (!recipients || !amounts || recipients.length !== amounts.length || !tokenAddress) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  try {
    const contract = await tronWeb.contract().at(tokenAddress);
    const sender = tronWeb.defaultAddress.base58;
    const balance = await contract.balanceOf(sender).call();
    const balanceInTRX = tronWeb.fromSun(balance);

    const totalToSend = amounts.reduce((sum, amt) => sum + Number(amt), 0);
    if (balanceInTRX < totalToSend) {
      return res.status(400).json({ error: 'Insufficient token balance' });
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

    // res.json({ results });
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
});

app.listen(3012, () => console.log("✅ Backend server running on http://localhost:3012"));
