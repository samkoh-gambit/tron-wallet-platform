import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  getMint,
  getAccount,
} from '@solana/spl-token';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const EXPLORER_BASE = 'https://explorer.solana.com/tx';
const DEFAULT_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

function getCluster() {
  const url = (process.env.SOLANA_RPC_URL || '').toLowerCase();
  if (url.includes('mainnet')) return 'mainnet-beta';
  if (url.includes('testnet') && !url.includes('devnet')) return 'testnet';
  return 'devnet';
}

function loadKeypair() {
  const raw = process.env.SOLANA_PRIVATE_KEY;
  if (!raw) {
    throw new Error('SOLANA_PRIVATE_KEY is not set');
  }

  const trimmed = raw.trim();
  let secretKey;
  if (trimmed.startsWith('[')) {
    secretKey = Uint8Array.from(JSON.parse(trimmed));
  } else {
    secretKey = bs58.decode(trimmed);
  }
  return Keypair.fromSecretKey(secretKey);
}

function getConnection() {
  return new Connection(RPC_URL, 'confirmed');
}

function explorerLink(signature) {
  return `${EXPLORER_BASE}/${signature}?cluster=${getCluster()}`;
}

function getTokenMint() {
  return process.env.SOLANA_TOKEN_MINT || DEFAULT_USDC_MINT;
}

async function getSplBalance(connection, owner, mintAddress) {
  try {
    const mint = new PublicKey(mintAddress);
    const ata = await getAssociatedTokenAddress(mint, owner);
    const account = await getAccount(connection, ata);
    const mintInfo = await getMint(connection, mint);
    return Number(account.amount) / 10 ** mintInfo.decimals;
  } catch {
    return 0;
  }
}

export default async function handler(req, res) {
  console.log('[SOL] Incoming request:', req.method, req.url, req.body);

  let connection;
  let keypair;
  try {
    connection = getConnection();
    keypair = loadKeypair();
  } catch (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (req.method === 'GET') {
    try {
      const lamports = await connection.getBalance(keypair.publicKey);
      const mintAddress = getTokenMint();
      const tokenBalance = await getSplBalance(connection, keypair.publicKey, mintAddress);

      res.json({
        address: keypair.publicKey.toBase58(),
        balance: (lamports / LAMPORTS_PER_SOL).toString(),
        tokenBalance,
        usdtBalance: tokenBalance,
        tokenMint: mintAddress,
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
    const results = [];

    if (type === 'native') {
      for (let i = 0; i < recipients.length; i++) {
        try {
          const toPubkey = new PublicKey(recipients[i]);
          const lamports = Math.round(parseFloat(amounts[i]) * LAMPORTS_PER_SOL);
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: keypair.publicKey,
              toPubkey,
              lamports,
            })
          );
          const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);
          results.push({
            recipient: recipients[i],
            amount: amounts[i],
            success: true,
            txHash: signature,
            explorerLink: explorerLink(signature),
          });
        } catch (error) {
          results.push({
            recipient: recipients[i],
            amount: amounts[i],
            success: false,
            error: error.message,
          });
        }
      }
    } else {
      const mintAddress = tokenAddress || getTokenMint();
      if (!mintAddress) {
        res.status(400).json({ error: 'Token mint address required for SPL transfer' });
        return;
      }

      const mint = new PublicKey(mintAddress);
      const mintInfo = await getMint(connection, mint);
      const fromAta = await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        mint,
        keypair.publicKey
      );

      for (let i = 0; i < recipients.length; i++) {
        try {
          const toPubkey = new PublicKey(recipients[i]);
          const toAta = await getOrCreateAssociatedTokenAccount(
            connection,
            keypair,
            mint,
            toPubkey
          );
          const amount = BigInt(
            Math.round(parseFloat(amounts[i]) * 10 ** mintInfo.decimals)
          );
          const tx = new Transaction().add(
            createTransferInstruction(
              fromAta.address,
              toAta.address,
              keypair.publicKey,
              amount
            )
          );
          const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);
          results.push({
            recipient: recipients[i],
            amount: amounts[i],
            success: true,
            txHash: signature,
            explorerLink: explorerLink(signature),
          });
        } catch (error) {
          results.push({
            recipient: recipients[i],
            amount: amounts[i],
            success: false,
            error: error.message,
          });
        }
      }
    }

    res.json({
      success: results.every((tx) => tx.success),
      summary: {
        total: results.length,
        successCount: results.filter((tx) => tx.success).length,
        failureCount: results.filter((tx) => !tx.success).length,
      },
      results,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
